package hook

import "fmt"

// PhaseGuardResult is the output of the phase-guard hook.
type PhaseGuardResult struct {
	HookSpecificOutput *HookSpecificOutput `json:"hookSpecificOutput,omitempty"`
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

	expectedSkillPath := fmt.Sprintf(".claude/skills/compound/%s/SKILL.md", state.CurrentPhase)
	for _, s := range state.SkillsRead {
		if s == expectedSkillPath {
			return PhaseGuardResult{}
		}
	}

	return PhaseGuardResult{
		HookSpecificOutput: &HookSpecificOutput{
			HookEventName: "PreToolUse",
			AdditionalContext: fmt.Sprintf(
				"PHASE GUARD WARNING: You are in cook-it phase %d/5 (%s) but have NOT read the skill file yet. Read %s before continuing.",
				state.PhaseIndex, state.CurrentPhase, expectedSkillPath,
			),
		},
	}
}
