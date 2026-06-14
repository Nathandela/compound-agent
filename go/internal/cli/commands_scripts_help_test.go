package cli

import (
	"strings"
	"testing"
)

// TestLoopImplementerHelp_ListsAllEngines asserts the --implementer flag help
// documents claude, goose, codex, and agy.
func TestLoopImplementerHelp_ListsAllEngines(t *testing.T) {
	t.Parallel()
	f := loopCmd().Flags().Lookup("implementer")
	if f == nil {
		t.Fatal("loop command must define --implementer flag")
	}
	for _, want := range []string{"claude", "goose", "codex", "agy"} {
		if !strings.Contains(f.Usage, want) {
			t.Errorf("--implementer help missing %q, got: %q", want, f.Usage)
		}
	}
	// The standalone gemini CLI is removed; help must not list gemini.
	if strings.Contains(f.Usage, "gemini") {
		t.Errorf("--implementer help must NOT list gemini (removed), got: %q", f.Usage)
	}
}

// TestSetupHarnessHelp_MentionsAgy asserts the --harness flag help mentions agy
// as a functional install target.
func TestSetupHarnessHelp_MentionsAgy(t *testing.T) {
	t.Parallel()
	f := setupCmd().Flags().Lookup("harness")
	if f == nil {
		t.Fatal("setup command must define --harness flag")
	}
	if !strings.Contains(f.Usage, "agy") {
		t.Errorf("--harness help missing %q, got: %q", "agy", f.Usage)
	}
}
