package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writePhaseState(t *testing.T, dir string, state PhaseState) {
	t.Helper()
	stateDir := filepath.Join(dir, ".claude")
	os.MkdirAll(stateDir, 0o755)
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)
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

	result := ProcessPhaseGuard(dir, "Read", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("Read tool should not trigger phase guard")
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
