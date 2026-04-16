// Package setup provides Claude Code settings management and hook installation.
package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/util"
)

// HookMarkers are strings that identify compound-agent hooks in settings.json.
var HookMarkers = []string{
	"BIN prime",
	"BIN load-session",
	"ca load-session",
	"compound-agent load-session",
	"BIN hooks run user-prompt",
	"BIN hooks run post-tool-failure",
	"BIN hooks run post-tool-success",
	"BIN hooks run phase-guard",
	"BIN hooks run read-tracker",
	"BIN hooks run stop-audit",
	"BIN hooks run post-read",
	"BIN hooks run phase-audit",
	"BIN index-docs",
	"hook-runner.js",
}

// HookTypes managed by compound-agent.
var HookTypes = []string{
	"SessionStart", "PreCompact", "UserPromptSubmit",
	"PostToolUseFailure", "PostToolUse", "PreToolUse", "Stop",
}

type managedHookSpec struct {
	hookType     string
	matcher      string
	markers      []string
	buildCommand func(binaryPath string) string
	// profile is the minimum InitProfile that should install this hook.
	// ProfileMinimal hooks = lesson-capture plumbing (prime, user-prompt).
	// ProfileWorkflow hooks = phase/failure tracking.
	profile InitProfile
}

var managedHookSpecs = []managedHookSpec{
	{hookType: "SessionStart", matcher: "", markers: []string{"BIN prime"}, buildCommand: makePrimeCommand, profile: ProfileMinimal},
	{hookType: "PreCompact", matcher: "", markers: []string{"BIN prime"}, buildCommand: makePrimeCommand, profile: ProfileMinimal},
	{
		hookType: "UserPromptSubmit",
		matcher:  "",
		markers:  []string{"BIN hooks run user-prompt", "hook-runner.js\" user-prompt"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "user-prompt")
		},
		profile: ProfileMinimal,
	},
	{
		hookType: "PostToolUseFailure",
		matcher:  "Bash|Edit|Write",
		markers:  []string{"BIN hooks run post-tool-failure", "hook-runner.js\" post-tool-failure"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "post-tool-failure")
		},
		profile: ProfileWorkflow,
	},
	{
		hookType: "PostToolUse",
		matcher:  "Bash|Edit|Write",
		markers:  []string{"BIN hooks run post-tool-success", "hook-runner.js\" post-tool-success"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "post-tool-success")
		},
		profile: ProfileWorkflow,
	},
	{
		hookType: "PostToolUse",
		matcher:  "Read",
		markers:  []string{"BIN hooks run post-read", "BIN hooks run read-tracker", "hook-runner.js\" post-read"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "post-read")
		},
		profile: ProfileWorkflow,
	},
	{
		hookType: "PreToolUse",
		matcher:  "Edit|Write",
		markers:  []string{"BIN hooks run phase-guard", "hook-runner.js\" phase-guard"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "phase-guard")
		},
		profile: ProfileWorkflow,
	},
	{
		hookType: "Stop",
		matcher:  "",
		markers:  []string{"BIN hooks run phase-audit", "BIN hooks run stop-audit", "hook-runner.js\" phase-audit"},
		buildCommand: func(binaryPath string) string {
			return makeHookCommand(binaryPath, "phase-audit")
		},
		profile: ProfileWorkflow,
	},
}

// hookSpecsForProfile returns specs whose minimum profile is <= selected.
func hookSpecsForProfile(profile InitProfile) []managedHookSpec {
	out := make([]managedHookSpec, 0, len(managedHookSpecs))
	for _, spec := range managedHookSpecs {
		if profileIncludes(spec.profile, profile) {
			out = append(out, spec)
		}
	}
	return out
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
// binaryPath is shell-escaped to handle paths with spaces.
func makeHookCommand(binaryPath, hookName string) string {
	if binaryPath != "" {
		return fmt.Sprintf("%s hooks run %s 2>/dev/null || true", util.ShellEscape(binaryPath), hookName)
	}
	return fmt.Sprintf("npx ca hooks run %s 2>/dev/null || true", hookName)
}

// makePrimeCommand builds the prime command.
// binaryPath is shell-escaped to handle paths with spaces.
func makePrimeCommand(binaryPath string) string {
	if binaryPath != "" {
		return fmt.Sprintf("%s prime 2>/dev/null || true", util.ShellEscape(binaryPath))
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
				if commandHasMarker(cmd, marker) {
					return true
				}
			}
		}
	}
	return false
}

func normalizeManagedCommand(cmd string) string {
	trimmed := strings.TrimSpace(cmd)
	if strings.HasPrefix(trimmed, "npx ca ") {
		return "BIN " + strings.TrimPrefix(trimmed, "npx ca ")
	}
	if strings.HasPrefix(trimmed, "'") {
		if end := strings.Index(trimmed[1:], "'"); end >= 0 {
			return "BIN" + trimmed[end+2:]
		}
	}
	if idx := strings.Index(trimmed, " "); idx >= 0 {
		first := trimmed[:idx]
		if first == "ca" || strings.HasSuffix(first, "/ca") {
			return "BIN" + trimmed[idx:]
		}
	}
	return trimmed
}

func commandHasMarker(cmd, marker string) bool {
	if strings.Contains(cmd, marker) {
		return true
	}
	if strings.HasPrefix(marker, "BIN ") {
		return strings.Contains(normalizeManagedCommand(cmd), marker)
	}
	return false
}

func hookHasMarker(hook any, markers []string) bool {
	hMap, ok := hook.(map[string]any)
	if !ok {
		return false
	}
	cmd, _ := hMap["command"].(string)
	for _, marker := range markers {
		if commandHasMarker(cmd, marker) {
			return true
		}
	}
	return false
}

func filterHookEntries(arr []any, markers []string) ([]any, int, string) {
	filtered := make([]any, 0, len(arr))
	matchCount := 0
	firstCommand := ""

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

		keptHooks := make([]any, 0, len(hooksList))
		removedAny := false
		for _, hook := range hooksList {
			if hookHasMarker(hook, markers) {
				if firstCommand == "" {
					hMap, _ := hook.(map[string]any)
					firstCommand, _ = hMap["command"].(string)
				}
				matchCount++
				removedAny = true
				continue
			}
			keptHooks = append(keptHooks, hook)
		}

		if !removedAny {
			filtered = append(filtered, entry)
			continue
		}
		if len(keptHooks) == 0 {
			continue
		}

		cloned := make(map[string]any, len(entryMap))
		for key, value := range entryMap {
			cloned[key] = value
		}
		cloned["hooks"] = keptHooks
		filtered = append(filtered, cloned)
	}

	return filtered, matchCount, firstCommand
}

// upgradeNpxHooks replaces "npx ca" commands with the direct binary path.
// This is needed because npx resolution fails in Claude Code hook contexts
// (different PATH/environment). Called when binaryPath is available.
func upgradeNpxHooks(hooks map[string]any, binaryPath string) {
	if binaryPath == "" {
		return
	}
	escaped := util.ShellEscape(binaryPath)
	for _, hookType := range HookTypes {
		arr := getHookArray(hooks, hookType)
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
				if strings.Contains(cmd, "npx ca ") {
					upgraded := strings.Replace(cmd, "npx ca ", escaped+" ", 1)
					hMap["command"] = upgraded
				}
			}
		}
	}
}

// AddAllHooks adds all compound-agent hooks to settings (ProfileFull).
// Kept for backward compatibility — new callers should use AddHooksForProfile.
func AddAllHooks(settings map[string]any, binaryPath string) {
	AddHooksForProfile(settings, binaryPath, ProfileFull)
}

// AddHooksForProfile installs hooks whose minimum profile is <= the selected
// profile, and REMOVES any compound-agent hooks that are not in the profile.
// This makes downgrades (e.g. full→minimal) clean up phase-guard etc.
// binaryPath can be empty for npx fallback.
func AddHooksForProfile(settings map[string]any, binaryPath string, profile InitProfile) {
	hooks := getHooksMap(settings)
	upgradeNpxHooks(hooks, binaryPath) // rewrite existing npx commands to binary path
	removeOutOfProfileHooks(hooks, profile)
	installInProfileHooks(hooks, binaryPath, profile)
	dropEmptyHookArrays(hooks)
}

// removeOutOfProfileHooks strips managed hook entries whose spec is not in
// the selected profile. Used on downgrades (full→minimal drops phase-guard etc).
func removeOutOfProfileHooks(hooks map[string]any, profile InitProfile) {
	for _, spec := range managedHookSpecs {
		if profileIncludes(spec.profile, profile) {
			continue
		}
		arr, ok := hooks[spec.hookType].([]any)
		if !ok {
			continue
		}
		filtered, _, _ := filterHookEntries(arr, spec.markers)
		hooks[spec.hookType] = filtered
	}
}

// installInProfileHooks refreshes the hook entries for each in-profile spec.
// Existing entries with matching markers are replaced, not duplicated.
func installInProfileHooks(hooks map[string]any, binaryPath string, profile InitProfile) {
	for _, spec := range hookSpecsForProfile(profile) {
		arr := getHookArray(hooks, spec.hookType)
		filtered, _, firstCommand := filterHookEntries(arr, spec.markers)
		command := spec.buildCommand(binaryPath)
		if binaryPath == "" && firstCommand != "" && !strings.Contains(firstCommand, "npx ca ") {
			command = firstCommand
		}
		hooks[spec.hookType] = append(filtered, hookEntry(spec.matcher, command))
	}
}

// dropEmptyHookArrays deletes hook-type keys with zero entries so
// settings.json doesn't carry "PreToolUse": [] style noise. upgradeNpxHooks
// and pruning passes can create these eagerly.
func dropEmptyHookArrays(hooks map[string]any) {
	for _, hookType := range HookTypes {
		arr, ok := hooks[hookType].([]any)
		if ok && len(arr) == 0 {
			delete(hooks, hookType)
		}
	}
}

// HasAllHooks checks if all hooks for ProfileFull are installed.
// Retained for backward-compat callers (doctor checks, etc.).
func HasAllHooks(settings map[string]any) bool {
	return HasAllHooksForProfile(settings, ProfileFull)
}

// HasAllHooksForProfile checks whether every hook spec belonging to the
// selected profile is present in settings.
func HasAllHooksForProfile(settings map[string]any, profile InitProfile) bool {
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}
	for _, spec := range hookSpecsForProfile(profile) {
		arr, ok := hooks[spec.hookType].([]any)
		if !ok {
			return false
		}
		if !hasHookMarker(arr, spec.markers) {
			return false
		}
	}
	return true
}

// hooksHaveOutOfProfileEntries reports whether settings contains any
// compound-agent hook entry whose spec is NOT in the selected profile.
// Used to trigger a cleanup write during downgrades.
func hooksHaveOutOfProfileEntries(settings map[string]any, profile InitProfile) bool {
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}
	for _, spec := range managedHookSpecs {
		if profileIncludes(spec.profile, profile) {
			continue
		}
		arr, ok := hooks[spec.hookType].([]any)
		if !ok {
			continue
		}
		if hasHookMarker(arr, spec.markers) {
			return true
		}
	}
	return false
}

// hookArrayHasNpx checks if any entry in a hook array contains npx commands.
func hookArrayHasNpx(arr []any) bool {
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
			if strings.Contains(cmd, "npx ca ") {
				return true
			}
		}
	}
	return false
}

// HooksNeedUpgrade returns true if hooks exist but use npx commands
// and a binary path is available for upgrade.
func HooksNeedUpgrade(settings map[string]any, binaryPath string) bool {
	if binaryPath == "" {
		return false
	}
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}
	for _, hookType := range HookTypes {
		arr, ok := hooks[hookType].([]any)
		if !ok {
			continue
		}
		if hookArrayHasNpx(arr) {
			return true
		}
	}
	return false
}

// HooksNeedDedupe returns true if compound-agent hooks are duplicated and should be reconciled.
func HooksNeedDedupe(settings map[string]any) bool {
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return false
	}
	for _, spec := range managedHookSpecs {
		arr, ok := hooks[spec.hookType].([]any)
		if !ok {
			continue
		}
		_, matchCount, _ := filterHookEntries(arr, spec.markers)
		if matchCount > 1 {
			return true
		}
	}
	return false
}

// isCompoundHookEntry returns true if the hook entry contains any compound-agent marker.
func isCompoundHookEntry(entry any) bool {
	entryMap, ok := entry.(map[string]any)
	if !ok {
		return false
	}
	hooksList, ok := entryMap["hooks"].([]any)
	if !ok {
		return false
	}
	for _, h := range hooksList {
		hMap, ok := h.(map[string]any)
		if !ok {
			continue
		}
		cmd, _ := hMap["command"].(string)
		for _, marker := range HookMarkers {
			if commandHasMarker(cmd, marker) {
				return true
			}
		}
	}
	return false
}

// removeHookEntries filters out compound-agent entries from a hook type array.
// Returns the filtered array and whether any entries were removed.
func removeHookEntries(arr []any) ([]any, bool) {
	filtered := make([]any, 0, len(arr))
	for _, entry := range arr {
		if !isCompoundHookEntry(entry) {
			filtered = append(filtered, entry)
		}
	}
	return filtered, len(filtered) < len(arr)
}

// RemoveAllHooks removes all compound-agent hooks from settings.
// After removal, any hook-type key that is now an empty slice is deleted
// so settings.json stays free of "HookType": [] noise — symmetric with
// the dropEmptyHookArrays cleanup in AddHooksForProfile.
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
		filtered, removed := removeHookEntries(arr)
		if removed {
			anyRemoved = true
		}
		hooks[hookType] = filtered
	}

	dropEmptyHookArrays(hooks)
	return anyRemoved
}
