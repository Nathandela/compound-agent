package hook

import "fmt"

// PhaseGuardResult is the output of the phase-guard hook.
type PhaseGuardResult struct {
	SpecificOutput *SpecificOutput `json:"hookSpecificOutput,omitempty"`
}

// phaseGuardedEditTools is the set of file-mutating tool names the phase gate
// guards. Claude uses Edit/Write; the remaining names are Goose's native edit
// tools, so guarding them only ADDS blocking for tools Claude never sends.
// The Goose hooks.json PreToolUse matcher is unanchored, so the hook fires on
// the developer__text_editor name Goose actually sends and reaches this gate.
// The bare "write" and "edit" names are what Goose's toolshim collapses
// developer__text_editor to on the local-model path (no native tool_calls);
// Claude never sends those bare names, so adding them is purely additive.
var phaseGuardedEditTools = map[string]bool{
	"Edit":                   true,
	"Write":                  true,
	"str_replace":            true,
	"create_file":            true,
	"text_editor":            true,
	"developer__text_editor": true,
	"str_replace_editor":     true,
	"write":                  true,
	"edit":                   true,
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

	// The "PHASE GUARD WARNING" text below is advisory under the Claude path: Claude
	// receives it as additionalContext and is expected to read the skill before editing.
	// Under a blocking harness it becomes a HARD pre-tool block: the goose hooks.json
	// PreToolUse wrapper greps the "PHASE GUARD" substring and, on a match, emits
	// {"decision":"block"} and exits 2, denying the edit outright. Do NOT change the
	// "PHASE GUARD" / "PHASE GUARD WARNING" wording: the goose grep and Claude-path
	// tests pin it. The reason text must also stay free of double-quotes and
	// backslashes so the wrapper's sed extraction of additionalContext stays intact
	// (pinned by TestPhaseGuard_AdditionalContext_SedSafe).
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
