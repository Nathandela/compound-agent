package templates

import (
	"strings"
	"testing"
)

// TestGooseHooksJSON_BlockingPhaseGate verifies the embedded Goose hooks
// manifest exists, carries the BIN placeholder for substitution, declares the
// four lifecycle events, and blocks out-of-phase edits via exit 2 or a
// decision:block payload (R5).
func TestGooseHooksJSON_BlockingPhaseGate(t *testing.T) {
	hooks := GooseHooksJSON()
	if hooks == "" {
		t.Fatal("Goose hooks.json template is empty")
	}
	if !strings.Contains(hooks, "{{BIN}}") {
		t.Error("Goose hooks.json missing {{BIN}} placeholder")
	}
	for _, event := range []string{"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"} {
		if !strings.Contains(hooks, event) {
			t.Errorf("Goose hooks.json missing %s event", event)
		}
	}
	// PreToolUse must be a real blocking phase-gate, not a warning.
	if !strings.Contains(hooks, "exit 2") && !strings.Contains(hooks, `"decision":"block"`) {
		t.Error("Goose PreToolUse hook must block via exit 2 or decision:block")
	}
}

// TestGooseHints verifies the .goosehints memory file mirrors the compound
// integration and carries the completion markers plus a commit/push reminder.
func TestGooseHints(t *testing.T) {
	hints := GooseHints()
	if hints == "" {
		t.Fatal("Goose .goosehints template is empty")
	}
	for _, marker := range []string{"EPIC_COMPLETE", "HUMAN_REQUIRED", "EPIC_FAILED"} {
		if !strings.Contains(hints, marker) {
			t.Errorf(".goosehints missing %s marker", marker)
		}
	}
	if !strings.Contains(hints, "Compound Agent") {
		t.Error(".goosehints missing Compound Agent section")
	}
	if !strings.Contains(strings.ToLower(hints), "commit") || !strings.Contains(strings.ToLower(hints), "push") {
		t.Error(".goosehints missing commit and push reminder")
	}
}

// TestGooseRecipe verifies the compound-cook-it recipe encodes the workflow
// phases and requires the completion marker (R3).
func TestGooseRecipe(t *testing.T) {
	recipe := GooseRecipe()
	if recipe == "" {
		t.Fatal("Goose compound-cook-it recipe is empty")
	}
	for _, phase := range []string{"plan", "work", "review", "compound"} {
		if !strings.Contains(strings.ToLower(recipe), phase) {
			t.Errorf("recipe missing %s phase", phase)
		}
	}
	if !strings.Contains(recipe, "EPIC_COMPLETE") {
		t.Error("recipe must require EPIC_COMPLETE")
	}
}

// TestCodexConfig verifies the embedded codex config exists for the codex
// install target.
func TestCodexConfig(t *testing.T) {
	cfg := CodexConfig()
	if cfg == "" {
		t.Fatal("Codex config.toml template is empty")
	}
}

// TestGeminiMemory verifies the embedded GEMINI.md memory file exists and
// mirrors the compound integration.
func TestGeminiMemory(t *testing.T) {
	mem := GeminiMemory()
	if mem == "" {
		t.Fatal("GEMINI.md template is empty")
	}
	if !strings.Contains(mem, "Compound Agent") {
		t.Error("GEMINI.md missing Compound Agent section")
	}
}
