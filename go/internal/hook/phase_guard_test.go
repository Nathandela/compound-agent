package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writePhaseState(t *testing.T, dir string, state PhaseState) {
	t.Helper()
	stateDir := filepath.Join(dir, ".compound-agent")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestProcessPhaseGuard_NonEditTool(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	for _, tool := range []string{"Read", "Bash"} {
		result := ProcessPhaseGuard(dir, tool, map[string]interface{}{})
		if result.SpecificOutput != nil {
			t.Errorf("%s tool should not trigger phase guard", tool)
		}
	}
}

// TestProcessPhaseGuard_GooseEditToolsGuarded verifies that Goose's native edit
// tool names (str_replace, create_file, text_editor and friends) trigger the
// phase gate under the same out-of-phase state that guards Edit/Write (FIX-1).
// Claude never sends these names, so this only ADDS blocking for new tools.
func TestProcessPhaseGuard_GooseEditToolsGuarded(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	gooseTools := []string{
		"str_replace", "create_file", "text_editor",
		"developer__text_editor", "str_replace_editor",
	}
	for _, tool := range gooseTools {
		result := ProcessPhaseGuard(dir, tool, map[string]interface{}{})
		if result.SpecificOutput == nil {
			t.Errorf("expected phase guard warning for goose edit tool %q", tool)
			continue
		}
		if result.SpecificOutput.HookEventName != "PreToolUse" {
			t.Errorf("tool %q: got event %q, want PreToolUse", tool, result.SpecificOutput.HookEventName)
		}
	}
}

func TestProcessPhaseGuard_SkillNotRead(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput == nil {
		t.Fatal("expected warning when skill not read")
	}
	if result.SpecificOutput.HookEventName != "PreToolUse" {
		t.Errorf("got event %q, want PreToolUse", result.SpecificOutput.HookEventName)
	}
}

func TestProcessPhaseGuard_SkillAlreadyRead(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{".claude/skills/compound/work/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Write", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should allow write when skill has been read")
	}
}

func TestProcessPhaseGuard_NoStateFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should return empty when no state file")
	}
}

func TestProcessPhaseGuard_ArchitectPhaseSkillNotRead(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "meta-epic",
		CurrentPhase: "architect",
		PhaseIndex:   6,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput == nil {
		t.Fatal("expected warning when architect skill not read")
	}
	if !strings.Contains(result.SpecificOutput.AdditionalContext, "architect") {
		t.Error("warning should mention architect phase")
	}
}

func TestProcessPhaseGuard_ArchitectPhaseSkillRead(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "meta-epic",
		CurrentPhase: "architect",
		PhaseIndex:   6,
		SkillsRead:   []string{".claude/skills/compound/architect/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Write", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should allow write when architect skill has been read")
	}
}

func TestProcessPhaseGuard_Inactive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: false,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should return empty when cookit inactive")
	}
}
