package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestReadClaudeSettings_NonExistent(t *testing.T) {
	settings, err := ReadClaudeSettings("/nonexistent/path/settings.json")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(settings) != 0 {
		t.Errorf("expected empty map, got %v", settings)
	}
}

func TestReadClaudeSettings_ValidJSON(t *testing.T) {
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

func TestAddAllHooks_WithBinaryPath(t *testing.T) {
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
	settings := map[string]any{}
	if HasAllHooks(settings) {
		t.Error("expected false for empty settings")
	}
}

func TestHasAllHooks_Complete(t *testing.T) {
	settings := map[string]any{}
	AddAllHooks(settings, "")

	if !HasAllHooks(settings) {
		t.Error("expected true after AddAllHooks")
	}
}

func TestRemoveAllHooks(t *testing.T) {
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
	settings := map[string]any{}
	removed := RemoveAllHooks(settings)
	if removed {
		t.Error("expected false when no hooks exist")
	}
}
