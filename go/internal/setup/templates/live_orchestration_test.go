package templates

import (
	"strings"
	"testing"
)

// TestLiveOrchestration_ReferenceExists pins the architect live-orchestration
// reference file: it must be embedded, non-empty, and carry the invariant
// strings that define the mode B (in-conversation, sequential) protocol.
// DESIGN-only: string content, no behavior.
func TestLiveOrchestration_ReferenceExists(t *testing.T) {
	t.Parallel()
	refs := PhaseSkillReferences()
	ref, ok := refs["architect/references/live-orchestration.md"]
	if !ok {
		t.Fatal("missing architect/references/live-orchestration.md reference")
	}
	if strings.TrimSpace(ref) == "" {
		t.Fatal("architect/references/live-orchestration.md is empty")
	}

	for _, want := range []string{
		"sequential",        // epics processed sequentially, never in parallel
		"/compound:cook-it", // each epic run via the existing cook-it command
		"dependency",        // worklist built in dependency order
		"HUMAN_REQUIRED",    // human-required marker treated as a block
		"blocked",           // failed epic marked blocked, dependents skipped
		"checklist",         // beads-backed meta-epic checklist note
		"resume",            // run is resumable from the checklist note
		"ca verify-gates",   // per-epic completion verified via verify-gates
	} {
		if !strings.Contains(ref, want) {
			t.Errorf("live-orchestration.md missing invariant %q", want)
		}
	}
}

// TestLiveOrchestration_ArchitectPhase5 pins that architect Phase 5 references
// the live orchestration mode (mode B of the launch gate).
func TestLiveOrchestration_ArchitectPhase5(t *testing.T) {
	t.Parallel()
	architect := requireSkill(t, PhaseSkills(), "architect")

	phase5Idx := strings.Index(architect, "## Phase 5")
	if phase5Idx < 0 {
		t.Fatal("architect SKILL.md missing Phase 5 section")
	}

	lower := strings.ToLower(architect)
	if !strings.Contains(lower, "live orchestration") &&
		!strings.Contains(architect, "live-orchestration.md") {
		t.Error("architect SKILL.md does not reference live orchestration")
	}
}

// TestLiveOrchestration_LoopLauncherAlternative pins that loop-launcher
// SKILL.md documents the live orchestration alternative to the detached loop.
func TestLiveOrchestration_LoopLauncherAlternative(t *testing.T) {
	t.Parallel()
	launcher := requireSkill(t, PhaseSkills(), "loop-launcher")

	lower := strings.ToLower(launcher)
	if !strings.Contains(launcher, "live-orchestration.md") &&
		!strings.Contains(lower, "live orchestration") {
		t.Error("loop-launcher SKILL.md does not reference the live orchestration alternative")
	}
}
