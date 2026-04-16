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

// Architect is index 6 -- outside the cook-it 5-phase sequence.
// ProcessStopAudit short-circuits on ExpectedGateForPhase("")
// before hasTransitionEvidence is called, so this MUST allow stop.
func TestProcessStopAudit_ArchitectPhaseDoesNotBlock(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "architect",
		PhaseIndex:   6,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})

	result := ProcessStopAudit(dir, false)
	if result.Continue != nil {
		t.Fatal("architect phase (index 6) has no gate; should allow stop")
	}
}

// hasTransitionEvidence is called with PhaseIndex values that passed
// validatePhaseState (1..maxPhaseIndex). It must never panic when the
// index exceeds len(Phases) -- architect (index 6) is the canonical case.
func TestHasTransitionEvidence_OutOfRangeReturnsFalse(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		index int
	}{
		{"architect index 6", 6},
		{"upper bound", maxPhaseIndex() + 1},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			state := &PhaseState{
				PhaseIndex: tc.index,
				SkillsRead: []string{".claude/skills/compound/work/SKILL.md"},
			}
			got := hasTransitionEvidence(state)
			if got {
				t.Errorf("expected false for PhaseIndex=%d, got true", tc.index)
			}
		})
	}
}

// Pin the final-phase branch: any PhaseIndex equal to the cook-it final
// phase index (currently 5) must return true regardless of skill reads.
func TestHasTransitionEvidence_FinalPhaseAlwaysTrue(t *testing.T) {
	t.Parallel()
	state := &PhaseState{
		PhaseIndex: len(Phases), // 5
		SkillsRead: []string{},
	}
	if !hasTransitionEvidence(state) {
		t.Errorf("final cook-it phase must always return true")
	}
}
