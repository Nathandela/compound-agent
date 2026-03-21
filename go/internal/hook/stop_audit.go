package hook

import "fmt"

// StopAuditResult is the output of the stop-audit hook.
type StopAuditResult struct {
	Continue   *bool  `json:"continue,omitempty"`
	StopReason string `json:"stopReason,omitempty"`
}

func hasTransitionEvidence(state *PhaseState) bool {
	// Final phase always requires explicit gate verification
	if state.PhaseIndex == 5 {
		return true
	}

	// For phases 2-4, only block when next phase skill has been read
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
			"PHASE GATE NOT VERIFIED: %s requires gate '%s'. Run: npx ca phase-check gate %s",
			state.CurrentPhase, expectedGate, expectedGate,
		),
	}
}
