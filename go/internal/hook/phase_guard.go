package hook

import "fmt"

// PhaseGuardResult is the output of the phase-guard hook.
type PhaseGuardResult struct {
	SpecificOutput *SpecificOutput `json:"hookSpecificOutput,omitempty"`
}

// phaseGuardedEditTools is the set of file-mutating tool names the phase gate
// guards. Claude uses Edit/Write; the remaining names are Goose's native edit
// tools, so guarding them only ADDS blocking for tools Claude never sends.
var phaseGuardedEditTools = map[string]bool{
	"Edit":                   true,
	"Write":                  true,
	"str_replace":            true,
	"create_file":            true,
	"text_editor":            true,
	"developer__text_editor": true,
	"str_replace_editor":     true,
}

// isPhaseGuardedEditTool reports whether name is a file-mutating tool the phase
// gate should guard.
func isPhaseGuardedEditTool(name string) bool {
	return phaseGuardedEditTools[name]
}

// ProcessPhaseGuard checks if a file-mutating tool is allowed without reading the phase skill.
func ProcessPhaseGuard(repoRoot, toolName string, toolInput map[string]interface{}) PhaseGuardResult {
	if !isPhaseGuardedEditTool(toolName) {
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
