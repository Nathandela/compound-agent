package hook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestResolveSkillPath(t *testing.T) {
	tests := []struct {
		name  string
		phase string
		want  string
	}{
		{"spec-dev phase", "spec-dev", ".claude/skills/compound/spec-dev/SKILL.md"},
		{"plan phase", "plan", ".claude/skills/compound/plan/SKILL.md"},
		{"work phase", "work", ".claude/skills/compound/work/SKILL.md"},
		{"review phase", "review", ".claude/skills/compound/review/SKILL.md"},
		{"compound phase", "compound", ".claude/skills/compound/compound/SKILL.md"},
		{"architect phase", "architect", ".claude/skills/compound/architect/SKILL.md"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveSkillPath(tt.phase)
			if got != tt.want {
				t.Errorf("ResolveSkillPath(%q) = %q, want %q", tt.phase, got, tt.want)
			}
		})
	}
}

func TestIsValidSkillPhase(t *testing.T) {
	valid := []string{"spec-dev", "plan", "work", "review", "compound", "architect"}
	for _, phase := range valid {
		if !IsValidSkillPhase(phase) {
			t.Errorf("IsValidSkillPhase(%q) = false, want true", phase)
		}
	}

	invalid := []string{"", "cook-it", "unknown", "orchestrator"}
	for _, phase := range invalid {
		if IsValidSkillPhase(phase) {
			t.Errorf("IsValidSkillPhase(%q) = true, want false", phase)
		}
	}
}

// TestProcessPhaseGuard_UsesResolveSkillPath verifies that phase-guard now
// resolves skill paths via ResolveSkillPath, accepting both old and new paths.
func TestProcessPhaseGuard_UsesResolveSkillPath(t *testing.T) {
	dir := t.TempDir()

	// State with a skill read using the canonical path
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{".claude/skills/compound/work/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should allow edit when skill read via canonical path")
	}
}

// TestProcessPhaseGuard_ArchitectPhase verifies phase-guard works for the
// architect phase (which is not a cook-it phase but a valid skill phase).
func TestProcessPhaseGuard_ArchitectPhase(t *testing.T) {
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".claude")
	os.MkdirAll(stateDir, 0o755)

	// Write a state with architect phase manually (not via normal cook-it flow)
	state := PhaseState{
		CookitActive: true,
		EpicID:       "test-arch",
		CurrentPhase: "architect",
		PhaseIndex:   1,
		SkillsRead:   []string{".claude/skills/compound/architect/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput != nil {
		t.Error("should allow edit when architect skill has been read")
	}
}

// TestProcessPhaseGuard_ArchitectPhase_NotRead verifies phase-guard warns
// when architect skill hasn't been read yet.
func TestProcessPhaseGuard_ArchitectPhase_NotRead(t *testing.T) {
	dir := t.TempDir()
	stateDir := filepath.Join(dir, ".claude")
	os.MkdirAll(stateDir, 0o755)

	state := PhaseState{
		CookitActive: true,
		EpicID:       "test-arch",
		CurrentPhase: "architect",
		PhaseIndex:   1,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(stateDir, ".ca-phase-state.json"), data, 0o644)

	result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
	if result.SpecificOutput == nil {
		t.Fatal("should warn when architect skill not read")
	}
	if result.SpecificOutput.HookEventName != "PreToolUse" {
		t.Errorf("got event %q, want PreToolUse", result.SpecificOutput.HookEventName)
	}
}
