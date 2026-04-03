package hook

import "fmt"

// PhaseGuardResult is the output of the phase-guard hook.
type PhaseGuardResult struct {
	SpecificOutput *SpecificOutput `json:"hookSpecificOutput,omitempty"`
}

// ProcessPhaseGuard checks if Edit/Write is allowed without reading the phase skill.
func ProcessPhaseGuard(repoRoot, toolName string, toolInput map[string]interface{}) PhaseGuardResult {
	if toolName != "Edit" && toolName != "Write" {
		return PhaseGuardResult{}
	}

	state := GetPhaseState(repoRoot)
	if state == nil || !state.CookitActive {
		return PhaseGuardResult{}
	}

	expectedSkillPath := ResolveSkillPath(state.CurrentPhase)
	for _, s := range state.SkillsRead {
		if s == expectedSkillPath {
			return PhaseGuardResult{}
		}
	}

	return PhaseGuardResult{
		SpecificOutput: &SpecificOutput{
			HookEventName: "PreToolUse",
			AdditionalContext: fmt.Sprintf(
				"PHASE GUARD WARNING: You are in phase %s (index %d) but have NOT read the skill file yet. Read %s before continuing.",
				state.CurrentPhase, state.PhaseIndex, expectedSkillPath,
			),
		},
	}
}
