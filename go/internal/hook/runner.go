package hook

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

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
	stateDir := filepath.Join(util.GetRepoRoot(), ".claude")
	return ProcessToolFailure(data.ToolName, data.ToolInput, stateDir), 0
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
