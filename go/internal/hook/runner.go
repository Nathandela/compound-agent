package hook

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/telemetry"
	"github.com/nathandelacretaz/compound-agent/internal/util"
)

const preCommitMessage = `
╔══════════════════════════════════════════════════════════════╗
║                    LESSON CAPTURE CHECKPOINT                 ║
╠══════════════════════════════════════════════════════════════╣
║ STOP. Before this commit, take a moment to reflect:          ║
║                                                              ║
║ [ ] Did I learn something relevant during this session?      ║
║ [ ] Is there anything worth remembering for next time?       ║
║                                                              ║
║ If so, consider capturing a lesson:                          ║
║   npx ca learn "<insight>" --trigger "<what happened>"       ║
╚══════════════════════════════════════════════════════════════╝`

// hookInput holds the raw JSON input read from stdin for a hook invocation.
type hookInput struct {
	raw string
}

// parseHookInput reads and returns the raw stdin content for hook processing.
func parseHookInput(stdin io.Reader) (*hookInput, error) {
	raw, err := util.ReadStdinFrom(stdin, 30*time.Second, 1<<20)
	if err != nil {
		return nil, err
	}
	return &hookInput{raw: raw}, nil
}

// writeHookOutput serializes the result as JSON and writes it to stdout.
func writeHookOutput(stdout io.Writer, result interface{}) {
	data, _ := json.Marshal(result)
	fmt.Fprintln(stdout, string(data))
}

// RunHook dispatches to the appropriate hook handler.
// Returns exit code (0 = success, 1 = error).
func RunHook(hookName string, stdin io.Reader, stdout io.Writer) int {
	if hookName == "" {
		fmt.Fprintln(os.Stderr, "Usage: ca hooks run <hook>")
		return 1
	}

	// pre-commit is a git hook (not a Claude Code hook) — output plain text.
	// Returns before the defer below; safe because fmt.Fprintln cannot panic.
	if hookName == "pre-commit" {
		fmt.Fprintln(stdout, preCommitMessage)
		return 0
	}

	// All Claude Code hooks catch errors and output {} on failure.
	defer func() {
		if r := recover(); r != nil {
			slog.Error("hook panic", "hook", hookName, "error", r)
			writeHookOutput(stdout, map[string]interface{}{})
		}
	}()

	result, code := dispatchHook(hookName, stdin)
	if result != nil {
		writeHookOutput(stdout, result)
	}
	return code
}

// RunHookWithTelemetry runs a hook and logs a telemetry event to db.
// Telemetry is recorded at the output boundary, after dispatch completes.
func RunHookWithTelemetry(hookName string, stdin io.Reader, stdout io.Writer, db *sql.DB) int {
	start := time.Now()
	code := RunHook(hookName, stdin, stdout)
	durationMs := time.Since(start).Milliseconds()

	outcome := telemetry.OutcomeSuccess
	if code != 0 {
		outcome = telemetry.OutcomeError
	}

	ev := telemetry.Event{
		EventType:  telemetry.EventHookExecution,
		HookName:   hookName,
		DurationMs: durationMs,
		Outcome:    outcome,
	}
	if err := telemetry.LogEvent(db, ev); err != nil {
		slog.Debug("telemetry write failed", "hook", hookName, "error", err)
	}

	if _, err := telemetry.PruneEvents(db, telemetry.MaxRows); err != nil {
		slog.Debug("telemetry prune failed", "error", err)
	}

	return code
}

// dispatchHook routes to the correct hook handler and returns the result to serialize.
func dispatchHook(hookName string, stdin io.Reader) (interface{}, int) {
	switch hookName {
	case "user-prompt":
		return dispatchUserPrompt(stdin, hookName)
	case "post-tool-failure":
		return dispatchToolFailure(stdin, hookName)
	case "post-tool-success":
		return dispatchToolSuccess(stdin)
	case "phase-guard", "post-read", "read-tracker":
		return dispatchPhaseGuard(stdin, hookName)
	case "phase-audit", "stop-audit":
		return dispatchStopAudit(stdin, hookName)
	default:
		return map[string]interface{}{
			"error": fmt.Sprintf(
				"Unknown hook: %s. Valid hooks: user-prompt, post-tool-failure, post-tool-success, post-read (or read-tracker), phase-guard, phase-audit (or stop-audit), pre-commit (git only)",
				hookName,
			),
		}, 1
	}
}

func dispatchUserPrompt(stdin io.Reader, hookName string) (interface{}, int) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0
	}
	var data struct {
		Prompt string `json:"prompt"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0
	}
	if data.Prompt == "" {
		return map[string]interface{}{}, 0
	}
	return ProcessUserPrompt(data.Prompt), 0
}

func dispatchToolFailure(stdin io.Reader, hookName string) (interface{}, int) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0
	}
	var data struct {
		ToolName   string                 `json:"tool_name"`
		ToolInput  map[string]interface{} `json:"tool_input"`
		ToolOutput string                 `json:"tool_output"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0
	}
	if data.ToolName == "" {
		return map[string]interface{}{}, 0
	}
	if data.ToolInput == nil {
		data.ToolInput = map[string]interface{}{}
	}
	repoRoot := util.GetRepoRoot()
	stateDir := filepath.Join(repoRoot, ".claude")
	searchFn := makeLessonSearchFunc(repoRoot, hookName)
	return ProcessToolFailureWithSearch(data.ToolName, data.ToolInput, data.ToolOutput, stateDir, searchFn), 0
}

// makeLessonSearchFunc creates a LessonSearchFunc backed by FTS5 keyword search.
// Uses OR between tokens for broad matching. hookName identifies the calling
// hook for telemetry attribution.
func makeLessonSearchFunc(repoRoot string, hookName string) LessonSearchFunc {
	return func(ctx context.Context, tokens []string, limit int) ([]LessonMatch, error) {
		db, err := storage.OpenRepoDB(repoRoot)
		if err != nil {
			return nil, err
		}
		defer db.Close()

		sdb := storage.NewSearchDB(db)
		scored, err := sdb.SearchKeywordScoredORContext(ctx, tokens, limit, memory.TypeLesson)
		if err != nil {
			return nil, err
		}

		// Log per-lesson retrieval telemetry events (REQ-E4: "WHEN a lesson is retrieved").
		// Only log when lessons are actually returned — empty searches are not retrievals.
		query := strings.Join(tokens, " ")
		qh := telemetry.HashQuery(query)
		for _, s := range scored {
			_ = telemetry.LogEvent(db, telemetry.Event{
				EventType: telemetry.EventLessonRetrieval,
				HookName:  hookName,
				QueryHash: qh,
				Outcome:   telemetry.OutcomeSuccess,
				Metadata: map[string]interface{}{
					"lesson_id": s.ID,
					"score":     s.Score,
				},
			})
		}

		var matches []LessonMatch
		for _, s := range scored {
			matches = append(matches, LessonMatch{
				Trigger: s.Trigger,
				Insight: s.Insight,
				Score:   s.Score,
			})
		}
		return matches, nil
	}
}

func dispatchToolSuccess(stdin io.Reader) (interface{}, int) {
	_, _ = parseHookInput(stdin) // consume stdin
	stateDir := filepath.Join(util.GetRepoRoot(), ".claude")
	ProcessToolSuccess(stateDir)
	return map[string]interface{}{}, 0
}

func dispatchPhaseGuard(stdin io.Reader, hookName string) (interface{}, int) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0
	}
	var data struct {
		ToolName  string                 `json:"tool_name"`
		ToolInput map[string]interface{} `json:"tool_input"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0
	}
	if data.ToolName == "" {
		return map[string]interface{}{}, 0
	}
	if data.ToolInput == nil {
		data.ToolInput = map[string]interface{}{}
	}
	repoRoot := util.GetRepoRoot()
	if hookName == "phase-guard" {
		return ProcessPhaseGuard(repoRoot, data.ToolName, data.ToolInput), 0
	}
	ProcessReadTracker(repoRoot, data.ToolName, data.ToolInput)
	return map[string]interface{}{}, 0
}

func dispatchStopAudit(stdin io.Reader, hookName string) (interface{}, int) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0
	}
	var data struct {
		StopHookActive bool `json:"stop_hook_active"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0
	}
	return ProcessStopAudit(util.GetRepoRoot(), data.StopHookActive), 0
}

// handleErrorResult logs the error at debug level and returns an empty JSON object.
func handleErrorResult(hookName string, err error) interface{} {
	slog.Debug("hook error", "hook", hookName, "error", err)
	return map[string]interface{}{}
}
