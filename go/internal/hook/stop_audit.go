package hook

import "fmt"

// StopAuditResult is the output of the stop-audit hook.
type StopAuditResult struct {
	Continue   *bool  `json:"continue,omitempty"`
	StopReason string `json:"stopReason,omitempty"`
}

func hasTransitionEvidence(state *PhaseState) bool {
	// Final cook-it phase always requires explicit gate verification.
	// Using len(Phases) keeps the constant in one place — if the cook-it
	// phase list ever changes length, this branch tracks it.
	if state.PhaseIndex == len(Phases) {
		return true
	}

	// Non-cook-it phases (e.g. architect at index 6) and out-of-range
	// values return false: there's no "next cook-it phase skill" to look for.
	// For cook-it phases 1..len(Phases)-1, we check whether the next phase's
	// skill file has been read as transition evidence.
	if state.PhaseIndex < 1 || state.PhaseIndex >= len(Phases) {
		return false
	}
	nextPhase := Phases[state.PhaseIndex] // 0-indexed, so PhaseIndex gives the next phase
	nextSkillPath := fmt.Sprintf(".claude/skills/compound/%s/SKILL.md", nextPhase)

	for _, s := range state.SkillsRead {
		if s == nextSkillPath {
			return true
		}
	}
	return false
}

// ProcessStopAudit verifies required phase gates before allowing stop.
func ProcessStopAudit(repoRoot string, stopHookActive bool) StopAuditResult {
	if stopHookActive {
		return StopAuditResult{}
	}

	state := GetPhaseState(repoRoot)
	if state == nil || !state.CookitActive {
		return StopAuditResult{}
	}

	expectedGate := ExpectedGateForPhase(state.PhaseIndex)
	if expectedGate == "" {
		return StopAuditResult{}
	}

	// Check if gate is already passed
	for _, g := range state.GatesPassed {
		if g == expectedGate {
			return StopAuditResult{}
		}
	}

	if !hasTransitionEvidence(state) {
		return StopAuditResult{}
	}

	f := false
	return StopAuditResult{
		Continue: &f,
		StopReason: fmt.Sprintf(
			"PHASE GATE NOT VERIFIED: %s requires gate '%s'. Run: ca phase-check gate %s",
			state.CurrentPhase, expectedGate, expectedGate,
		),
	}
}
