package cli

// Reviewer-validation tests for the codex/agy implementers (codex review P2).
//
// When --implementer is codex or agy, the claude-sonnet/claude-opus reviewer
// branches in spawn_reviewers go through agent_invoke, which on those seams is
// redefined to run codex/agy (NOT claude). A claude reviewer would therefore
// run the wrong CLI with a claude-only model name, producing empty/error reports;
// the review cycle could then "pass" without a real review. Only the agy and
// codex reviewer branches invoke their own CLIs directly and are safe. So the
// valid --reviewers for codex/agy implementers is exactly {agy, codex}.

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// loopRejectsReviewers asserts `ca loop --implementer <impl> --reviewers <revs>`
// fails with a clear error mentioning the offending reviewer name.
func loopRejectsReviewers(t *testing.T, impl, reviewers, badName string) {
	t.Helper()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "loop.sh"),
		"--implementer", impl, "--reviewers", reviewers)
	if err == nil {
		t.Fatalf("--implementer %s --reviewers %s must be rejected (agent_invoke runs %s, not claude)", impl, reviewers, impl)
	}
	if !strings.Contains(err.Error(), badName) {
		t.Errorf("error for --implementer %s must name the offending reviewer %q, got: %v", impl, badName, err)
	}
	// The error must steer the user to the CLI-direct reviewers.
	if !strings.Contains(err.Error(), "agy") || !strings.Contains(err.Error(), "codex") {
		t.Errorf("error should list the valid {agy, codex} reviewers, got: %v", err)
	}
}

// loopAcceptsReviewers asserts `ca loop --implementer <impl> --reviewers <revs>` succeeds.
func loopAcceptsReviewers(t *testing.T, impl, reviewers string) {
	t.Helper()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "loop.sh"),
		"--implementer", impl, "--reviewers", reviewers)
	if err != nil {
		t.Fatalf("--implementer %s --reviewers %s should be accepted, got: %v", impl, reviewers, err)
	}
}

// --- RED: codex/agy reject claude reviewers (agent_invoke runs the wrong CLI) ---

func TestLoopCmd_CodexRejectsClaudeReviewers(t *testing.T) {
	t.Parallel()
	loopRejectsReviewers(t, "codex", "claude-sonnet", "claude-sonnet")
	loopRejectsReviewers(t, "codex", "claude-opus", "claude-opus")
	// Mixed list: a CLI-direct reviewer does not rescue an invalid claude one.
	loopRejectsReviewers(t, "codex", "codex,claude-sonnet", "claude-sonnet")
}

func TestLoopCmd_AgyRejectsClaudeReviewers(t *testing.T) {
	t.Parallel()
	loopRejectsReviewers(t, "agy", "claude-sonnet", "claude-sonnet")
	loopRejectsReviewers(t, "agy", "claude-opus", "claude-opus")
	loopRejectsReviewers(t, "agy", "agy,claude-opus", "claude-opus")
}

// --- GREEN: codex/agy accept only the CLI-direct reviewers {agy, codex} ---

func TestLoopCmd_CodexAcceptsCliDirectReviewers(t *testing.T) {
	t.Parallel()
	loopAcceptsReviewers(t, "codex", "codex")
	loopAcceptsReviewers(t, "codex", "agy")
	loopAcceptsReviewers(t, "codex", "codex,agy")
}

func TestLoopCmd_AgyAcceptsCliDirectReviewers(t *testing.T) {
	t.Parallel()
	loopAcceptsReviewers(t, "agy", "agy")
	loopAcceptsReviewers(t, "agy", "codex")
	loopAcceptsReviewers(t, "agy", "agy,codex")
}

// --- codex/agy reject any other (non-CLI-direct) reviewer name ---

func TestLoopCmd_CodexAgyRejectUnknownReviewer(t *testing.T) {
	t.Parallel()
	loopRejectsReviewers(t, "codex", "security", "security")
	loopRejectsReviewers(t, "agy", "bogus", "bogus")
}

// --- validateCodexAgyReviewers unit behavior (mirrors validateGooseReviewers) ---

func TestValidateCodexAgyReviewers(t *testing.T) {
	t.Parallel()
	// Accepts the CLI-direct set.
	for _, name := range []string{"codex", "agy"} {
		if err := validateCodexAgyReviewers([]string{name}); err != nil {
			t.Errorf("expected %q to be a valid codex/agy reviewer, got: %v", name, err)
		}
	}
	if err := validateCodexAgyReviewers([]string{"codex", "agy"}); err != nil {
		t.Errorf("expected codex,agy to be valid, got: %v", err)
	}
	// Rejects claude reviewers (agent_invoke runs the wrong CLI).
	for _, name := range []string{"claude-sonnet", "claude-opus"} {
		err := validateCodexAgyReviewers([]string{name})
		if err == nil {
			t.Errorf("expected %q to be rejected for codex/agy implementers", name)
		}
		if err != nil && !strings.Contains(err.Error(), name) {
			t.Errorf("error must name the offending reviewer %q, got: %v", name, err)
		}
	}
	// Rejects unknown names.
	if err := validateCodexAgyReviewers([]string{"nope"}); err == nil {
		t.Error("expected unknown reviewer to be rejected for codex/agy implementers")
	}
}
