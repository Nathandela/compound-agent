package hook

import (
	"strings"
	"testing"
	"time"
)

// TestPhaseGuard_AdditionalContext_SedSafe pins the invariant that the phase-guard
// out-of-phase message contains neither a double-quote (0x22) nor a backslash
// (0x5c) for every phase in ValidSkillPhases.
//
// Why this matters: the goose hooks.json PreToolUse wrapper extracts the deny
// reason from phase_guard's additionalContext with a sed that slices on the FIRST
// double-quote (s/.*"additionalContext":"// then s/".*//). The backslash
// re-escape sed runs only afterward, so any embedded " or \ in the message would
// truncate or corrupt the block reason. Today the message is enum-derived and
// safe (phase names from ValidSkillPhases are lowercase/hyphen only; the skill
// path uses forward slashes), so this test PINS that safety rather than rewriting
// the wrapper. Any future message edit that introduces a quote or backslash will
// break this test before it can break the sed extraction.
func TestPhaseGuard_AdditionalContext_SedSafe(t *testing.T) {
	t.Parallel()
	for _, phase := range ValidSkillPhases {
		dir := t.TempDir()
		writePhaseState(t, dir, PhaseState{
			CookitActive: true,
			CurrentPhase: phase,
			PhaseIndex:   phaseIndexMap[phase],
			SkillsRead:   []string{},
			StartedAt:    time.Now().Format(time.RFC3339),
		})

		result := ProcessPhaseGuard(dir, "Edit", map[string]interface{}{})
		if result.SpecificOutput == nil {
			t.Fatalf("phase %q: expected out-of-phase SpecificOutput, got nil", phase)
		}
		if strings.ContainsAny(result.SpecificOutput.AdditionalContext, "\"\\") {
			t.Errorf("phase %q: AdditionalContext contains a quote or backslash, which would break the goose hooks.json sed extraction: %q",
				phase, result.SpecificOutput.AdditionalContext)
		}
	}
}
