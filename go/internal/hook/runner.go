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
	code, _ := runHookCore(hookName, stdin, stdout, nil)
	return code
}

// runHookCore handles dispatch and output writing.
// Returns exit code and whether an internal error occurred (for telemetry).
// Internal errors return exit code 0 for graceful degradation but hadError=true
// so telemetry can accurately record the failure.
// If db is non-nil, it is reused for lesson search instead of opening a new connection.
func runHookCore(hookName string, stdin io.Reader, stdout io.Writer, db *sql.DB) (exitCode int, hadError bool) {
	if hookName == "" {
		fmt.Fprintln(os.Stderr, "Usage: ca hooks run <hook>")
		return 1, true
	}

	// pre-commit is a git hook (not a Claude Code hook) — output plain text.
	// Returns before the defer below; safe because fmt.Fprintln cannot panic.
	if hookName == "pre-commit" {
		fmt.Fprintln(stdout, preCommitMessage)
		return 0, false
	}

	// All Claude Code hooks catch errors and output {} on failure.
	defer func() {
		if r := recover(); r != nil {
			slog.Error("hook panic", "hook", hookName, "error", r)
			writeHookOutput(stdout, map[string]interface{}{})
			// Intentional: panics degrade gracefully to exit 0 (Claude Code compatibility)
			// but hadError=true ensures telemetry records the failure accurately.
			exitCode = 0
			hadError = true
		}
	}()

	result, code, intErr := dispatchHook(hookName, stdin, db)
	if result != nil {
		writeHookOutput(stdout, result)
	}
	return code, intErr
}

// RunHookWithTelemetry runs a hook and logs a telemetry event to db.
// Telemetry is recorded at the output boundary, after dispatch completes.
func RunHookWithTelemetry(hookName string, stdin io.Reader, stdout io.Writer, db *sql.DB) int {
	start := time.Now()
	code, hadError := runHookCore(hookName, stdin, stdout, db)
	durationMs := time.Since(start).Milliseconds()

	outcome := telemetry.OutcomeSuccess
	if code != 0 || hadError {
		outcome = telemetry.OutcomeError
	}

	phase := ""
	if state := GetPhaseState(util.GetRepoRoot()); state != nil {
		phase = state.CurrentPhase
	}

	ev := telemetry.Event{
		EventType:  telemetry.EventHookExecution,
		HookName:   hookName,
		Phase:      phase,
		DurationMs: durationMs,
		Outcome:    outcome,
	}
	if err := telemetry.LogEvent(db, ev); err != nil {
		slog.Debug("telemetry write failed", "hook", hookName, "error", err)
	}

	// Only prune when table exceeds threshold (avoid full-table scan on small tables)
	var count int64
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&count); err == nil && count > telemetry.MaxRows {
		if _, err := telemetry.PruneEvents(db, telemetry.MaxRows); err != nil {
			slog.Debug("telemetry prune failed", "error", err)
		}
	}

	return code
}

// dispatchHook routes to the correct hook handler and returns the result to serialize.
// The third return value indicates whether an internal error occurred (parse failure, etc.)
// that was gracefully handled (exit code 0) but should be tracked in telemetry.
// db may be nil; when non-nil it is reused for lesson search.
func dispatchHook(hookName string, stdin io.Reader, db *sql.DB) (interface{}, int, bool) {
	switch hookName {
	case "user-prompt":
		return dispatchUserPrompt(stdin, hookName)
	case "post-tool-failure":
		return dispatchToolFailure(stdin, hookName, db)
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
		}, 1, true
	}
}

func dispatchUserPrompt(stdin io.Reader, hookName string) (interface{}, int, bool) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	var data struct {
		Prompt string `json:"prompt"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	if data.Prompt == "" {
		return map[string]interface{}{}, 0, false
	}
	return ProcessUserPrompt(data.Prompt), 0, false
}

func dispatchToolFailure(stdin io.Reader, hookName string, db *sql.DB) (interface{}, int, bool) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	var data struct {
		ToolName   string                 `json:"tool_name"`
		ToolInput  map[string]interface{} `json:"tool_input"`
		ToolOutput string                 `json:"tool_output"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	if data.ToolName == "" {
		return map[string]interface{}{}, 0, false
	}
	if data.ToolInput == nil {
		data.ToolInput = map[string]interface{}{}
	}
	repoRoot := util.GetRepoRoot()
	stateDir := filepath.Join(repoRoot, ".claude")
	searchFn := makeLessonSearchFunc(db, repoRoot, hookName)
	return ProcessToolFailureWithSearch(data.ToolName, data.ToolInput, data.ToolOutput, stateDir, searchFn), 0, false
}

// makeLessonSearchFunc creates a LessonSearchFunc backed by FTS5 keyword search.
// Uses OR between tokens for broad matching. hookName identifies the calling
// hook for telemetry attribution.
// If db is non-nil it is reused; otherwise a new connection is opened per call.
func makeLessonSearchFunc(db *sql.DB, repoRoot string, hookName string) LessonSearchFunc {
	return func(ctx context.Context, tokens []string, limit int) ([]LessonMatch, error) {
		ownDB := db == nil
		searchDB := db
		if ownDB {
			var err error
			searchDB, err = storage.OpenRepoDB(repoRoot)
			if err != nil {
				return nil, err
			}
			defer searchDB.Close()
		}

		sdb := storage.NewSearchDB(searchDB)
		scored, err := sdb.SearchKeywordScoredORContext(ctx, tokens, limit, memory.TypeLesson)
		if err != nil {
			return nil, err
		}

		// Log per-lesson retrieval telemetry events (REQ-E4: "WHEN a lesson is retrieved").
		// Only log when lessons are actually returned — empty searches are not retrievals.
		query := strings.Join(tokens, " ")
		qh := telemetry.HashQuery(query)
		for _, s := range scored {
			_ = telemetry.LogEvent(searchDB, telemetry.Event{
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

func dispatchToolSuccess(stdin io.Reader) (interface{}, int, bool) {
	_, err := parseHookInput(stdin) // consume stdin
	if err != nil {
		return handleErrorResult("post-tool-success", err), 0, true
	}
	stateDir := filepath.Join(util.GetRepoRoot(), ".claude")
	ProcessToolSuccess(stateDir)
	return map[string]interface{}{}, 0, false
}

func dispatchPhaseGuard(stdin io.Reader, hookName string) (interface{}, int, bool) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	var data struct {
		ToolName  string                 `json:"tool_name"`
		ToolInput map[string]interface{} `json:"tool_input"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	if data.ToolName == "" {
		return map[string]interface{}{}, 0, false
	}
	if data.ToolInput == nil {
		data.ToolInput = map[string]interface{}{}
	}
	repoRoot := util.GetRepoRoot()
	if hookName == "phase-guard" {
		return ProcessPhaseGuard(repoRoot, data.ToolName, data.ToolInput), 0, false
	}
	ProcessReadTracker(repoRoot, data.ToolName, data.ToolInput)
	return map[string]interface{}{}, 0, false
}

func dispatchStopAudit(stdin io.Reader, hookName string) (interface{}, int, bool) {
	input, err := parseHookInput(stdin)
	if err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	var data struct {
		StopHookActive bool `json:"stop_hook_active"`
	}
	if err = json.Unmarshal([]byte(input.raw), &data); err != nil {
		return handleErrorResult(hookName, err), 0, true
	}
	return ProcessStopAudit(util.GetRepoRoot(), data.StopHookActive), 0, false
}

// handleErrorResult logs the error at debug level and returns an empty JSON object.
func handleErrorResult(hookName string, err error) interface{} {
	slog.Debug("hook error", "hook", hookName, "error", err)
	return map[string]interface{}{}
}
