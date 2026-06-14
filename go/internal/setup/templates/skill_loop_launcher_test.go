package templates

import (
	"strings"
	"testing"
)

// TestLoopLauncherSkill_DocumentsAltImplementers asserts the loop-launcher
// SKILL.md documents the codex/gemini implementer trigger scripts and the
// antigravity (agy) groundwork note. DESIGN-only: string content, no behavior.
func TestLoopLauncherSkill_DocumentsAltImplementers(t *testing.T) {
	t.Parallel()
	skill, ok := PhaseSkills()["loop-launcher"]
	if !ok || skill == "" {
		t.Fatal("expected non-empty loop-launcher skill")
	}
	for _, want := range []string{
		"--implementer codex",
		"--implementer gemini",
		"agy",
		"antigravity",
	} {
		if !strings.Contains(skill, want) {
			t.Errorf("loop-launcher SKILL.md missing %q", want)
		}
	}
}
