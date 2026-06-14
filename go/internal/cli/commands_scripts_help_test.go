package cli

import (
	"strings"
	"testing"
)

// TestLoopImplementerHelp_ListsAllEngines asserts the --implementer flag help
// documents claude, goose, codex, and gemini.
func TestLoopImplementerHelp_ListsAllEngines(t *testing.T) {
	t.Parallel()
	f := loopCmd().Flags().Lookup("implementer")
	if f == nil {
		t.Fatal("loop command must define --implementer flag")
	}
	for _, want := range []string{"claude", "goose", "codex", "gemini"} {
		if !strings.Contains(f.Usage, want) {
			t.Errorf("--implementer help missing %q, got: %q", want, f.Usage)
		}
	}
}

// TestSetupHarnessHelp_MentionsAntigravity asserts the --harness flag help
// mentions antigravity as a groundwork install target.
func TestSetupHarnessHelp_MentionsAntigravity(t *testing.T) {
	t.Parallel()
	f := setupCmd().Flags().Lookup("harness")
	if f == nil {
		t.Fatal("setup command must define --harness flag")
	}
	if !strings.Contains(f.Usage, "antigravity") {
		t.Errorf("--harness help missing %q, got: %q", "antigravity", f.Usage)
	}
}
