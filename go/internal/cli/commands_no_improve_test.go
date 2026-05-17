package cli

// Tests asserting that the improve loop and all its traces are gone.
// These tests must FAIL before the removal and PASS after.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// TestRootCmd_NoImproveSubcommand verifies that the root command has no "improve" subcommand.
func TestRootCmd_NoImproveSubcommand(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	registerScriptCommands(root)

	for _, sub := range root.Commands() {
		if sub.Use == "improve" || strings.HasPrefix(sub.Use, "improve ") {
			t.Errorf("root command still has 'improve' subcommand (Use=%q) -- must be removed", sub.Use)
		}
	}
}

// TestLoopCmd_NoImproveFlags verifies that `ca loop` has no --improve / --improve-max-iters /
// --improve-time-budget flags.
func TestLoopCmd_NoImproveFlags(t *testing.T) {
	t.Parallel()
	cmd := loopCmd()

	forbidden := []string{"improve", "improve-max-iters", "improve-time-budget"}
	for _, name := range forbidden {
		if f := cmd.Flags().Lookup(name); f != nil {
			t.Errorf("loopCmd still has --%s flag -- must be removed", name)
		}
	}
}

// TestWatchCmd_NoImproveFlag verifies that `ca watch` has no --improve flag.
func TestWatchCmd_NoImproveFlag(t *testing.T) {
	t.Parallel()
	cmd := watchCmd()

	if f := cmd.Flags().Lookup("improve"); f != nil {
		t.Error("watchCmd still has --improve flag -- must be removed")
	}
}

// TestGenerateLoopScript_NoImprovePhaseMarkers verifies that a generated loop script (without
// --improve) contains no improve-phase markers (IMPROVED / NO_IMPROVEMENT) and no improve-phase
// function names (loopScriptImprovePhase was the assembly point).
func TestGenerateLoopScript_NoImprovePhaseMarkers(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}
	script := string(data)

	// These strings belong exclusively to the improve phase and must be absent.
	improveOnlyMarkers := []string{
		"IMPROVED",
		"NO_IMPROVEMENT",
		"Improvement phase",
		"get_topics()",
		"build_improve_prompt()",
		"detect_improve_marker()",
		"IMPROVE_STATUS_FILE",
		"IMPROVE_EXEC_LOG",
		"write_improve_status()",
		"log_improve_result()",
		"IMPROVE_DRY_RUN",
	}
	for _, m := range improveOnlyMarkers {
		if strings.Contains(script, m) {
			t.Errorf("generated loop script still contains improve-phase marker %q", m)
		}
	}

	// FAILED must still be present (it is a shared epic marker used in detect_marker).
	if !strings.Contains(script, "EPIC_FAILED") {
		t.Error("generated loop script must still contain EPIC_FAILED marker")
	}
}
