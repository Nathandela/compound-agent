package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadClaudeSettings_NonExistent(t *testing.T) {
	t.Parallel()
	settings, err := ReadClaudeSettings("/nonexistent/path/settings.json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(settings) != 0 {
		t.Errorf("expected empty map, got %v", settings)
	}
}

func TestReadClaudeSettings_ValidJSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	os.WriteFile(path, []byte(`{"key": "value"}`), 0644)

	settings, err := ReadClaudeSettings(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if settings["key"] != "value" {
		t.Errorf("expected key=value, got %v", settings["key"])
	}
}

func TestWriteClaudeSettings_Atomic(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")

	settings := map[string]any{"test": true}
	if err := WriteClaudeSettings(path, settings); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read written file: %v", err)
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("invalid JSON written: %v", err)
	}
	if result["test"] != true {
		t.Error("expected test=true")
	}
}

func TestWriteClaudeSettings_CreatesDirectory(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "dir", "settings.json")

	settings := map[string]any{"nested": true}
	if err := WriteClaudeSettings(path, settings); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("expected file to be created")
	}
}

func TestAddAllHooks(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		t.Fatal("expected hooks map")
	}

	expectedTypes := []string{
		"SessionStart", "PreCompact", "UserPromptSubmit",
		"PostToolUseFailure", "PostToolUse", "PreToolUse", "Stop",
	}
	for _, hookType := range expectedTypes {
		if _, exists := hooks[hookType]; !exists {
			t.Errorf("missing hook type: %s", hookType)
		}
	}
}

func TestAddAllHooks_Idempotent(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")
	AddAllHooks(settings, "")

	hooks := settings["hooks"].(map[string]any)
	// SessionStart should have exactly 1 entry
	sessionStart := hooks["SessionStart"].([]any)
	if len(sessionStart) != 1 {
		t.Errorf("expected 1 SessionStart entry, got %d (not idempotent)", len(sessionStart))
	}
}

func TestAddAllHooks_DedupesExistingCompoundHooks(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	hooks := settings["hooks"].(map[string]any)
	hooks["SessionStart"] = append(hooks["SessionStart"].([]any), hookEntry("", makePrimeCommand("")))
	hooks["PreCompact"] = append(hooks["PreCompact"].([]any), hookEntry("", makePrimeCommand("")))

	if !HooksNeedDedupe(settings) {
		t.Fatal("expected duplicates to be detected before reconciliation")
	}

	AddAllHooks(settings, "")

	if HooksNeedDedupe(settings) {
		t.Error("expected duplicates to be removed after reconciliation")
	}
	if got := len(hooks["SessionStart"].([]any)); got != 1 {
		t.Errorf("expected 1 SessionStart entry after dedupe, got %d", got)
	}
	if got := len(hooks["PreCompact"].([]any)); got != 1 {
		t.Errorf("expected 1 PreCompact entry after dedupe, got %d", got)
	}
}

func TestAddAllHooks_DedupePreservesUnrelatedHooks(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	hooks := settings["hooks"].(map[string]any)
	unrelated := hookEntry("", "echo unrelated")
	hooks["SessionStart"] = append([]any{unrelated}, hooks["SessionStart"].([]any)...)
	hooks["SessionStart"] = append(hooks["SessionStart"].([]any), hookEntry("", makePrimeCommand("")))

	AddAllHooks(settings, "")

	sessionStart := hooks["SessionStart"].([]any)
	if len(sessionStart) != 2 {
		t.Fatalf("expected unrelated hook plus one compound hook, got %d entries", len(sessionStart))
	}
	first := sessionStart[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)["command"].(string)
	if first != "echo unrelated" {
		t.Errorf("expected unrelated hook to be preserved, got %q", first)
	}
}

func TestAddAllHooks_WithBinaryPath(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "/usr/local/bin/ca")

	hooks := settings["hooks"].(map[string]any)
	userPrompt := hooks["UserPromptSubmit"].([]any)
	entry := userPrompt[0].(map[string]any)
	hooksList := entry["hooks"].([]any)
	hook := hooksList[0].(map[string]any)
	cmd := hook["command"].(string)

	if cmd == "" {
		t.Error("expected non-empty command")
	}
	// Should reference the Go binary, not npx
	if cmd == "npx ca hooks run user-prompt 2>/dev/null || true" {
		t.Error("expected Go binary path, got npx fallback")
	}
}

func TestHasAllHooks_Empty(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	if HasAllHooks(settings) {
		t.Error("expected false for empty settings")
	}
}

func TestHasAllHooks_Complete(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	if !HasAllHooks(settings) {
		t.Error("expected true after AddAllHooks")
	}
}

func TestRemoveAllHooks(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	removed := RemoveAllHooks(settings)
	if !removed {
		t.Error("expected hooks to be removed")
	}

	if HasAllHooks(settings) {
		t.Error("expected no hooks after removal")
	}
}

func TestRemoveAllHooks_NoHooks(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	removed := RemoveAllHooks(settings)
	if removed {
		t.Error("expected false when no hooks exist")
	}
}

func TestMakeHookCommand_ShellEscapesBinaryPath(t *testing.T) {
	t.Parallel()
	// Paths with spaces must be escaped to prevent shell injection
	cmd := makeHookCommand("/path/with spaces/ca", "user-prompt")
	if cmd != "'/path/with spaces/ca' hooks run user-prompt 2>/dev/null || true" {
		t.Errorf("expected escaped path, got: %s", cmd)
	}
}

func TestMakePrimeCommand_ShellEscapesBinaryPath(t *testing.T) {
	t.Parallel()
	cmd := makePrimeCommand("/path/with spaces/ca")
	if cmd != "'/path/with spaces/ca' prime 2>/dev/null || true" {
		t.Errorf("expected escaped path, got: %s", cmd)
	}
}

func TestMakeHookCommand_NoEscape_EmptyBinaryPath(t *testing.T) {
	t.Parallel()
	cmd := makeHookCommand("", "user-prompt")
	if cmd != "npx ca hooks run user-prompt 2>/dev/null || true" {
		t.Errorf("expected npx fallback, got: %s", cmd)
	}
}

func TestAddAllHooks_UpgradesNpxToBinaryPath(t *testing.T) {
	t.Parallel()
	// Simulate hooks installed with npx fallback
	settings := map[string]any{}
	AddAllHooks(settings, "")

	hooks := settings["hooks"].(map[string]any)
	entry := hooks["SessionStart"].([]any)[0].(map[string]any)
	cmd := entry["hooks"].([]any)[0].(map[string]any)["command"].(string)
	if !strings.Contains(cmd, "npx ca") {
		t.Fatalf("expected npx hook, got: %s", cmd)
	}

	// Re-run with binary path — should upgrade npx to binary path
	AddAllHooks(settings, "/usr/local/bin/ca")

	entry = hooks["SessionStart"].([]any)[0].(map[string]any)
	cmd = entry["hooks"].([]any)[0].(map[string]any)["command"].(string)
	if strings.Contains(cmd, "npx") {
		t.Errorf("hook still uses npx after upgrade: %s", cmd)
	}
	if !strings.Contains(cmd, "/usr/local/bin/ca") {
		t.Errorf("hook should use binary path, got: %s", cmd)
	}
}

func TestAddAllHooks_WithSpacesInPath(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "/opt/My App/bin/ca")

	hooks := settings["hooks"].(map[string]any)
	sessionStart := hooks["SessionStart"].([]any)
	entry := sessionStart[0].(map[string]any)
	hooksList := entry["hooks"].([]any)
	hook := hooksList[0].(map[string]any)
	cmd := hook["command"].(string)

	// Must be shell-escaped
	if cmd != "'/opt/My App/bin/ca' prime 2>/dev/null || true" {
		t.Errorf("expected shell-escaped path, got: %s", cmd)
	}
}

func TestHooksNeedUpgrade_NpxWithBinary(t *testing.T) {
	t.Parallel()
	// Hooks installed with npx, binary now available → needs upgrade
	settings := map[string]any{}
	AddAllHooks(settings, "") // Install with npx fallback

	if !HooksNeedUpgrade(settings, "/usr/local/bin/ca") {
		t.Error("expected true: npx hooks should need upgrade when binary available")
	}
}

func TestHooksNeedUpgrade_AlreadyBinary(t *testing.T) {
	t.Parallel()
	// Hooks already use binary path → no upgrade needed
	settings := map[string]any{}
	AddAllHooks(settings, "/usr/local/bin/ca")

	if HooksNeedUpgrade(settings, "/usr/local/bin/ca") {
		t.Error("expected false: binary hooks should not need upgrade")
	}
}

func TestHooksNeedUpgrade_NoBinaryPath(t *testing.T) {
	t.Parallel()
	// No binary available → can't upgrade, return false
	settings := map[string]any{}
	AddAllHooks(settings, "")

	if HooksNeedUpgrade(settings, "") {
		t.Error("expected false: can't upgrade without binary path")
	}
}

func TestHooksNeedUpgrade_NoHooks(t *testing.T) {
	t.Parallel()
	// No hooks at all → nothing to upgrade
	settings := map[string]any{}

	if HooksNeedUpgrade(settings, "/usr/local/bin/ca") {
		t.Error("expected false: no hooks to upgrade")
	}
}

func TestHooksNeedDedupe_NoDuplicates(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	if HooksNeedDedupe(settings) {
		t.Error("expected false: canonical hooks should not need dedupe")
	}
}

func TestHooksNeedDedupe_WithDuplicates(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "")

	hooks := settings["hooks"].(map[string]any)
	hooks["SessionStart"] = append(hooks["SessionStart"].([]any), hookEntry("", makePrimeCommand("")))

	if !HooksNeedDedupe(settings) {
		t.Error("expected true: duplicate SessionStart hooks should need dedupe")
	}
}

func TestHooksNeedUpgrade_MixedHooks(t *testing.T) {
	t.Parallel()
	// Some hooks are npx, some are binary (shouldn't happen but test boundary)
	settings := map[string]any{}
	AddAllHooks(settings, "") // All npx

	// Manually upgrade just SessionStart
	hooks := settings["hooks"].(map[string]any)
	arr := hooks["SessionStart"].([]any)
	entry := arr[0].(map[string]any)
	hooksList := entry["hooks"].([]any)
	h := hooksList[0].(map[string]any)
	h["command"] = "/usr/local/bin/ca prime 2>/dev/null || true"

	// Other hooks still use npx → needs upgrade
	if !HooksNeedUpgrade(settings, "/usr/local/bin/ca") {
		t.Error("expected true: some hooks still use npx")
	}
}

func TestAddAllHooks_DedupePreservesExistingBinaryCommandWithoutBinaryPath(t *testing.T) {
	t.Parallel()
	settings := map[string]any{}
	AddAllHooks(settings, "/usr/local/bin/ca")

	hooks := settings["hooks"].(map[string]any)
	hooks["SessionStart"] = append(hooks["SessionStart"].([]any), hookEntry("", "/opt/alt/ca prime 2>/dev/null || true"))

	AddAllHooks(settings, "")

	sessionStart := hooks["SessionStart"].([]any)
	if len(sessionStart) != 1 {
		t.Fatalf("expected 1 SessionStart entry after dedupe, got %d", len(sessionStart))
	}
	cmd := sessionStart[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)["command"].(string)
	if strings.Contains(cmd, "npx ca") {
		t.Errorf("expected existing binary command to be preserved, got %q", cmd)
	}
}
