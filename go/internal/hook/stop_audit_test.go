package hook

import (
	"testing"
	"time"
)

func TestProcessStopAudit_NoState(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Error("no state should allow stop")
	}
}

func TestProcessStopAudit_StopHookActive(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "compound",
		PhaseIndex:   5,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, true)
	if result.Continue != nil {
		t.Error("stopHookActive=true should allow stop (prevent recursive loops)")
	}
}

func TestProcessStopAudit_Inactive(t *testing.T) {
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

	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Error("inactive state should allow stop")
	}
}

func TestProcessStopAudit_GatePassed(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "plan",
		PhaseIndex:   2,
		SkillsRead:   []string{},
		GatesPassed:  []string{"post-plan"},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Error("passed gate should allow stop")
	}
}

func TestProcessStopAudit_Phase1NoGate(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "spec-dev",
		PhaseIndex:   1,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Error("phase 1 (spec-dev) has no gate, should allow stop")
	}
}

func TestProcessStopAudit_BlocksOnTransitionEvidence(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	// Phase 2 (plan), gate not passed, but has read phase 3 skill (transition evidence)
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "plan",
		PhaseIndex:   2,
		SkillsRead:   []string{".claude/skills/compound/work/SKILL.md"},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue == nil || *result.Continue != false {
		t.Fatal("should block stop when gate not passed and transition evidence exists")
	}
	if result.StopReason == "" {
		t.Error("expected stop reason message")
	}
}

func TestProcessStopAudit_AllowsWithoutTransitionEvidence(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	// Phase 2, gate not passed, no transition evidence
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "plan",
		PhaseIndex:   2,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Error("no transition evidence should allow stop")
	}
}

func TestProcessStopAudit_Phase5AlwaysRequiresGate(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "compound",
		PhaseIndex:   5,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue == nil || *result.Continue != false {
		t.Fatal("phase 5 should always block without final gate")
	}
}
