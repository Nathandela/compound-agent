// Package setup provides Claude Code settings management and hook installation.
package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// HookMarkers are strings that identify compound-agent hooks in settings.json.
var HookMarkers = []string{
	"ca prime",
	"ca load-session",
	"compound-agent load-session",
	"ca hooks run user-prompt",
	"ca hooks run post-tool-failure",
	"ca hooks run post-tool-success",
	"ca hooks run phase-guard",
	"ca hooks run read-tracker",
	"ca hooks run stop-audit",
	"ca hooks run post-read",
	"ca hooks run phase-audit",
	"ca index-docs",
	"hook-runner.js",
}

// HookTypes managed by compound-agent.
var HookTypes = []string{
	"SessionStart", "PreCompact", "UserPromptSubmit",
	"PostToolUseFailure", "PostToolUse", "PreToolUse", "Stop",
}

// ReadClaudeSettings reads and parses a Claude Code settings.json file.
// Returns empty map if file does not exist.
func ReadClaudeSettings(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read settings: %w", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("parse settings: %w", err)
	}
	return settings, nil
}

// WriteClaudeSettings writes settings.json atomically (write to temp, then rename).
func WriteClaudeSettings(path string, settings map[string]any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal settings: %w", err)
	}
	data = append(data, '\n')

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}
	return os.Rename(tmpPath, path)
}

// makeHookCommand builds the shell command for a hook invocation.
func makeHookCommand(binaryPath, hookName string) string {
	if binaryPath != "" {
		return fmt.Sprintf("%s hooks run %s 2>/dev/null || true", binaryPath, hookName)
	}
	return fmt.Sprintf("npx ca hooks run %s 2>/dev/null || true", hookName)
}

// makePrimeCommand builds the prime command.
func makePrimeCommand(binaryPath string) string {
	if binaryPath != "" {
		return fmt.Sprintf("%s prime 2>/dev/null || true", binaryPath)
	}
	return "npx ca prime 2>/dev/null || true"
}

// hookEntry creates a single hook configuration entry.
func hookEntry(matcher, command string) map[string]any {
	return map[string]any{
		"matcher": matcher,
		"hooks": []any{
			map[string]any{
				"type":    "command",
				"command": command,
			},
		},
	}
}

// getHooksMap retrieves or creates the hooks map in settings.
func getHooksMap(settings map[string]any) map[string]any {
	if settings["hooks"] == nil {
		settings["hooks"] = map[string]any{}
	}
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		hooks = map[string]any{}
		settings["hooks"] = hooks
	}
	return hooks
}

// getHookArray retrieves or creates a hook type array.
func getHookArray(hooks map[string]any, hookType string) []any {
	if hooks[hookType] == nil {
		hooks[hookType] = []any{}
	}
	arr, ok := hooks[hookType].([]any)
	if !ok {
		arr = []any{}
		hooks[hookType] = arr
	}
	return arr
}

// hasHookMarker checks if any entry in the array contains any of the given markers.
func hasHookMarker(arr []any, markers []string) bool {
	for _, entry := range arr {
		entryMap, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		hooksList, ok := entryMap["hooks"].([]any)
		if !ok {
			continue
		}
		for _, h := range hooksList {
			hMap, ok := h.(map[string]any)
			if !ok {
				continue
			}
			cmd, _ := hMap["command"].(string)
			for _, marker := range markers {
				if strings.Contains(cmd, marker) {
					return true
				}
			}
		}
	}
	return false
}

// AddAllHooks adds all compound-agent hooks to settings.
// binaryPath can be empty string for npx fallback, or path to Go binary.
func AddAllHooks(settings map[string]any, binaryPath string) {
	hooks := getHooksMap(settings)

	// SessionStart
	arr := getHookArray(hooks, "SessionStart")
	if !hasHookMarker(arr, []string{"ca prime"}) {
		hooks["SessionStart"] = append(arr, hookEntry("", makePrimeCommand(binaryPath)))
	}

	// PreCompact
	arr = getHookArray(hooks, "PreCompact")
	if !hasHookMarker(arr, []string{"ca prime"}) {
		hooks["PreCompact"] = append(arr, hookEntry("", makePrimeCommand(binaryPath)))
	}

	// UserPromptSubmit
	arr = getHookArray(hooks, "UserPromptSubmit")
	if !hasHookMarker(arr, []string{"ca hooks run user-prompt", "hook-runner.js\" user-prompt"}) {
		hooks["UserPromptSubmit"] = append(arr, hookEntry("", makeHookCommand(binaryPath, "user-prompt")))
	}

	// PostToolUseFailure
	arr = getHookArray(hooks, "PostToolUseFailure")
	if !hasHookMarker(arr, []string{"ca hooks run post-tool-failure", "hook-runner.js\" post-tool-failure"}) {
		hooks["PostToolUseFailure"] = append(arr, hookEntry("Bash|Edit|Write", makeHookCommand(binaryPath, "post-tool-failure")))
	}

	// PostToolUse - success reset
	arr = getHookArray(hooks, "PostToolUse")
	if !hasHookMarker(arr, []string{"ca hooks run post-tool-success", "hook-runner.js\" post-tool-success"}) {
		hooks["PostToolUse"] = append(arr, hookEntry("Bash|Edit|Write", makeHookCommand(binaryPath, "post-tool-success")))
	}

	// PostToolUse - read tracker
	arr = getHookArray(hooks, "PostToolUse")
	if !hasHookMarker(arr, []string{"ca hooks run post-read", "ca hooks run read-tracker", "hook-runner.js\" post-read"}) {
		hooks["PostToolUse"] = append(arr, hookEntry("Read", makeHookCommand(binaryPath, "post-read")))
	}

	// PreToolUse - phase guard
	arr = getHookArray(hooks, "PreToolUse")
	if !hasHookMarker(arr, []string{"ca hooks run phase-guard", "hook-runner.js\" phase-guard"}) {
		hooks["PreToolUse"] = append(arr, hookEntry("Edit|Write", makeHookCommand(binaryPath, "phase-guard")))
	}

	// Stop - phase audit
	arr = getHookArray(hooks, "Stop")
	if !hasHookMarker(arr, []string{"ca hooks run phase-audit", "ca hooks run stop-audit", "hook-runner.js\" phase-audit"}) {
		hooks["Stop"] = append(arr, hookEntry("", makeHookCommand(binaryPath, "phase-audit")))
	}
}

// HasAllHooks checks if all required compound-agent hooks are installed.
func HasAllHooks(settings map[string]any) bool {
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}

	checks := []struct {
		hookType string
		markers  []string
	}{
		{"SessionStart", []string{"ca prime"}},
		{"PreCompact", []string{"ca prime"}},
		{"UserPromptSubmit", []string{"ca hooks run user-prompt", "hook-runner.js\" user-prompt"}},
		{"PostToolUseFailure", []string{"ca hooks run post-tool-failure", "hook-runner.js\" post-tool-failure"}},
		{"PostToolUse", []string{"ca hooks run post-tool-success", "hook-runner.js\" post-tool-success"}},
		{"PostToolUse", []string{"ca hooks run post-read", "ca hooks run read-tracker", "hook-runner.js\" post-read"}},
		{"PreToolUse", []string{"ca hooks run phase-guard", "hook-runner.js\" phase-guard"}},
		{"Stop", []string{"ca hooks run phase-audit", "ca hooks run stop-audit", "hook-runner.js\" phase-audit"}},
	}

	for _, check := range checks {
		arr, ok := hooks[check.hookType].([]any)
		if !ok {
			return false
		}
		if !hasHookMarker(arr, check.markers) {
			return false
		}
	}
	return true
}

// RemoveAllHooks removes all compound-agent hooks from settings.
func RemoveAllHooks(settings map[string]any) bool {
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}

	anyRemoved := false
	for _, hookType := range HookTypes {
		arr, ok := hooks[hookType].([]any)
		if !ok {
			continue
		}

		filtered := make([]any, 0, len(arr))
		for _, entry := range arr {
			entryMap, ok := entry.(map[string]any)
			if !ok {
				filtered = append(filtered, entry)
				continue
			}
			hooksList, ok := entryMap["hooks"].([]any)
			if !ok {
				filtered = append(filtered, entry)
				continue
			}

			isCompound := false
			for _, h := range hooksList {
				hMap, ok := h.(map[string]any)
				if !ok {
					continue
				}
				cmd, _ := hMap["command"].(string)
				for _, marker := range HookMarkers {
					if strings.Contains(cmd, marker) {
						isCompound = true
						break
					}
				}
				if isCompound {
					break
				}
			}

			if !isCompound {
				filtered = append(filtered, entry)
			}
		}

		if len(filtered) < len(arr) {
			anyRemoved = true
		}
		hooks[hookType] = filtered
	}

	return anyRemoved
}
