package hook

import (
	"encoding/json"
	"fmt"
	"io"
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

// RunHook dispatches to the appropriate hook handler.
// Returns exit code (0 = success, 1 = error).
func RunHook(hookName string, stdin io.Reader, stdout io.Writer) int {
	if hookName == "" {
		fmt.Fprintln(os.Stderr, "Usage: ca hooks run <hook>")
		return 1
	}

	writeJSON := func(v interface{}) {
		data, _ := json.Marshal(v)
		fmt.Fprintln(stdout, string(data))
	}

	readInput := func() (string, error) {
		return util.ReadStdinFrom(stdin, 30*time.Second, 1<<20)
	}

	// All hooks catch errors and output {} on failure
	defer func() {
		if r := recover(); r != nil {
			if os.Getenv("CA_DEBUG") != "" {
				fmt.Fprintf(os.Stderr, "[CA_DEBUG] Hook %s panic: %v\n", hookName, r)
			}
			writeJSON(map[string]interface{}{})
		}
	}()

	var err error

	switch hookName {
	case "pre-commit":
		writeJSON(map[string]interface{}{
			"hook":    "pre-commit",
			"message": preCommitMessage,
		})
		return 0

	case "user-prompt":
		input, readErr := readInput()
		if readErr != nil {
			return handleError(hookName, readErr, writeJSON)
		}
		var data struct {
			Prompt string `json:"prompt"`
		}
		if err = json.Unmarshal([]byte(input), &data); err != nil {
			return handleError(hookName, err, writeJSON)
		}
		if data.Prompt == "" {
			writeJSON(map[string]interface{}{})
			return 0
		}
		writeJSON(ProcessUserPrompt(data.Prompt))
		return 0

	case "post-tool-failure":
		input, readErr := readInput()
		if readErr != nil {
			return handleError(hookName, readErr, writeJSON)
		}
		var data struct {
			ToolName  string                 `json:"tool_name"`
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		if err = json.Unmarshal([]byte(input), &data); err != nil {
			return handleError(hookName, err, writeJSON)
		}
		if data.ToolName == "" {
			writeJSON(map[string]interface{}{})
			return 0
		}
		if data.ToolInput == nil {
			data.ToolInput = map[string]interface{}{}
		}
		stateDir := filepath.Join(util.GetRepoRoot(), ".claude")
		writeJSON(ProcessToolFailure(data.ToolName, data.ToolInput, stateDir))
		return 0

	case "post-tool-success":
		_, _ = readInput() // consume stdin
		stateDir := filepath.Join(util.GetRepoRoot(), ".claude")
		ProcessToolSuccess(stateDir)
		writeJSON(map[string]interface{}{})
		return 0

	case "phase-guard", "post-read", "read-tracker":
		input, readErr := readInput()
		if readErr != nil {
			return handleError(hookName, readErr, writeJSON)
		}
		var data struct {
			ToolName  string                 `json:"tool_name"`
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		if err = json.Unmarshal([]byte(input), &data); err != nil {
			return handleError(hookName, err, writeJSON)
		}
		if data.ToolName == "" {
			writeJSON(map[string]interface{}{})
			return 0
		}
		if data.ToolInput == nil {
			data.ToolInput = map[string]interface{}{}
		}
		repoRoot := util.GetRepoRoot()
		if hookName == "phase-guard" {
			writeJSON(ProcessPhaseGuard(repoRoot, data.ToolName, data.ToolInput))
		} else {
			ProcessReadTracker(repoRoot, data.ToolName, data.ToolInput)
			writeJSON(map[string]interface{}{})
		}
		return 0

	case "phase-audit", "stop-audit":
		input, readErr := readInput()
		if readErr != nil {
			return handleError(hookName, readErr, writeJSON)
		}
		var data struct {
			StopHookActive bool `json:"stop_hook_active"`
		}
		if err = json.Unmarshal([]byte(input), &data); err != nil {
			return handleError(hookName, err, writeJSON)
		}
		writeJSON(ProcessStopAudit(util.GetRepoRoot(), data.StopHookActive))
		return 0

	default:
		writeJSON(map[string]interface{}{
			"error": fmt.Sprintf(
				"Unknown hook: %s. Valid hooks: pre-commit, user-prompt, post-tool-failure, post-tool-success, post-read (or read-tracker), phase-guard, phase-audit (or stop-audit)",
				hookName,
			),
		})
		return 1
	}
}

func handleError(hookName string, err error, writeJSON func(interface{})) int {
	if os.Getenv("CA_DEBUG") != "" {
		fmt.Fprintf(os.Stderr, "[CA_DEBUG] Hook %s error: %v\n", hookName, err)
	}
	writeJSON(map[string]interface{}{})
	return 0
}
