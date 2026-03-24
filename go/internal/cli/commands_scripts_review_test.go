package cli

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// executeBashSyntaxCheck runs bash -n on a file to verify syntax.
func executeBashSyntaxCheck(path string) (string, error) {
	cmd := exec.Command("bash", "-n", path)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// --- CLI flag tests ---

func TestLoopCommand_WithReviewers(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet,gemini",
		"--max-review-cycles", "5",
		"--review-every", "2",
		"--review-blocking",
		"--review-model", "claude-opus-4-6",
	)
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "REVIEW_EVERY=2") {
		t.Error("expected REVIEW_EVERY=2 in script")
	}
	if !strings.Contains(script, "MAX_REVIEW_CYCLES=5") {
		t.Error("expected MAX_REVIEW_CYCLES=5 in script")
	}
	if !strings.Contains(script, "REVIEW_BLOCKING=true") {
		t.Error("expected REVIEW_BLOCKING=true in script")
	}
	// Verify function definitions exist
	if !strings.Contains(script, "detect_reviewers()") {
		t.Error("expected detect_reviewers function definition in script")
	}
	if !strings.Contains(script, "run_review_phase()") {
		t.Error("expected run_review_phase function definition in script")
	}
	if !strings.Contains(script, "spawn_reviewers()") {
		t.Error("expected spawn_reviewers function definition in script")
	}
	// Verify review is actually CALLED (not just defined) — Bug 6 regression
	if !strings.Contains(script, `run_review_phase "periodic"`) && !strings.Contains(script, `run_review_phase "final"`) {
		t.Error("expected run_review_phase to be CALLED in the main loop, not just defined")
	}
}

func TestLoopCommand_WithImprove(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--improve",
		"--improve-max-iters", "10",
		"--improve-time-budget", "3600",
	)
	if err != nil {
		t.Fatalf("loop --improve failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "MAX_ITERS=10") {
		t.Error("expected MAX_ITERS=10 in script")
	}
	if !strings.Contains(script, "TIME_BUDGET=3600") {
		t.Error("expected TIME_BUDGET=3600 in script")
	}
	if !strings.Contains(script, "Improvement phase") {
		t.Error("expected improvement phase section in script")
	}
	if !strings.Contains(script, "get_topics") {
		t.Error("expected get_topics function in script")
	}
	if !strings.Contains(script, "detect_improve_marker") {
		t.Error("expected detect_improve_marker function in script")
	}
}

func TestLoopCommand_InvalidReviewer(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "invalid-reviewer",
	)
	if err == nil {
		t.Fatal("expected error for invalid reviewer")
	}
	if !strings.Contains(err.Error(), "invalid reviewer") {
		t.Errorf("expected 'invalid reviewer' in error, got: %v", err)
	}
}

func TestLoopCommand_NoReviewWithoutFlag(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if strings.Contains(script, "REVIEW_EVERY") {
		t.Error("expected no review config without --reviewers flag")
	}
	if strings.Contains(script, "detect_reviewers") {
		t.Error("expected no reviewer detection without --reviewers flag")
	}
}

func TestLoopCommand_NoImproveWithoutFlag(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if strings.Contains(script, "Improvement phase") {
		t.Error("expected no improvement phase without --improve flag")
	}
	if strings.Contains(script, "get_topics") {
		t.Error("expected no get_topics without --improve flag")
	}
}

func TestLoopCommand_ReviewerShellInjection(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	// Valid reviewer names should not allow shell injection
	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet",
		"--review-model", `"; rm -rf /; #`,
	)
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The model should be single-quoted
	if !strings.Contains(script, "REVIEW_MODEL='") {
		t.Error("expected REVIEW_MODEL to be single-quoted for shell safety")
	}
}

func TestLoopCommand_AllReviewersValid(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet,claude-opus,gemini,codex",
	)
	if err != nil {
		t.Fatalf("loop with all reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "claude-sonnet claude-opus gemini codex") {
		t.Error("expected all four reviewers in REVIEW_REVIEWERS")
	}
}

func TestLoopCommand_ReviewAndImprove(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet",
		"--improve",
	)
	if err != nil {
		t.Fatalf("loop --reviewers --improve failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Both phases should be present
	if !strings.Contains(script, "run_review_phase") {
		t.Error("expected run_review_phase in combined script")
	}
	if !strings.Contains(script, "Improvement phase") {
		t.Error("expected improvement phase in combined script")
	}
}

// --- Review template unit tests ---

func TestLoopScriptReviewConfig_SetsVariables(t *testing.T) {
	config := loopScriptReviewConfig(loopReviewOptions{
		reviewers:       []string{"claude-sonnet", "gemini"},
		maxReviewCycles: 5,
		reviewBlocking:  true,
		reviewModel:     "claude-opus-4-6",
		reviewEvery:     3,
	})

	if !strings.Contains(config, "REVIEW_EVERY=3") {
		t.Error("expected REVIEW_EVERY=3")
	}
	if !strings.Contains(config, "MAX_REVIEW_CYCLES=5") {
		t.Error("expected MAX_REVIEW_CYCLES=5")
	}
	if !strings.Contains(config, "REVIEW_BLOCKING=true") {
		t.Error("expected REVIEW_BLOCKING=true")
	}
	if !strings.Contains(config, "portable_timeout") {
		t.Error("expected portable_timeout function")
	}
	if !strings.Contains(config, "gtimeout") {
		t.Error("expected gtimeout fallback for macOS")
	}
}

func TestLoopScriptReviewerDetection_ChecksCLIs(t *testing.T) {
	detection := loopScriptReviewerDetection()

	if !strings.Contains(detection, "command -v claude") {
		t.Error("expected claude CLI check")
	}
	if !strings.Contains(detection, "command -v gemini") {
		t.Error("expected gemini CLI check")
	}
	if !strings.Contains(detection, "command -v codex") {
		t.Error("expected codex CLI check")
	}
	if !strings.Contains(detection, "AVAILABLE_REVIEWERS") {
		t.Error("expected AVAILABLE_REVIEWERS variable")
	}
	if !strings.Contains(detection, "health check failed") {
		t.Error("expected health check failure warning")
	}
}

func TestLoopScriptSessionIdManagement_UsesUuidgen(t *testing.T) {
	mgmt := loopScriptSessionIDManagement()

	if !strings.Contains(mgmt, "uuidgen") {
		t.Error("expected uuidgen for session IDs")
	}
	if !strings.Contains(mgmt, "sessions.json") {
		t.Error("expected sessions.json reference")
	}
	if !strings.Contains(mgmt, "python3") {
		t.Error("expected python3 fallback")
	}
}

func TestLoopScriptReviewPrompt_ContainsMarkers(t *testing.T) {
	prompt := loopScriptReviewPrompt()

	if !strings.Contains(prompt, "REVIEW_APPROVED") {
		t.Error("expected REVIEW_APPROVED marker")
	}
	if !strings.Contains(prompt, "REVIEW_CHANGES_REQUESTED") {
		t.Error("expected REVIEW_CHANGES_REQUESTED marker")
	}
	if !strings.Contains(prompt, "git log --oneline") {
		t.Error("expected git log in review prompt")
	}
}

func TestLoopScriptSpawnReviewers_SupportsAllModels(t *testing.T) {
	spawner := loopScriptSpawnReviewers()

	if !strings.Contains(spawner, "--session-id") {
		t.Error("expected --session-id for claude reviewers on cycle 1")
	}
	if !strings.Contains(spawner, "--resume") {
		t.Error("expected --resume for claude reviewers on cycle 2+")
	}
	if !strings.Contains(spawner, "--yolo") {
		t.Error("expected --yolo for gemini reviewer")
	}
	if !strings.Contains(spawner, "codex exec") {
		t.Error("expected codex exec for codex reviewer")
	}
	if !strings.Contains(spawner, "portable_timeout") {
		t.Error("expected portable_timeout wrapping reviewer commands")
	}
}

func TestLoopScriptImplementerPhase_ContainsFixesMarker(t *testing.T) {
	impl := loopScriptImplementerPhase()

	if !strings.Contains(impl, "FIXES_APPLIED") {
		t.Error("expected FIXES_APPLIED marker")
	}
	if !strings.Contains(impl, "ca load-session") {
		t.Error("expected ca load-session in implementer prompt")
	}
	if !strings.Contains(impl, "feed_implementer") {
		t.Error("expected feed_implementer function")
	}
}

func TestLoopScriptReviewLoop_FullCycleLogic(t *testing.T) {
	loop := loopScriptReviewLoop()

	if !strings.Contains(loop, "run_review_phase") {
		t.Error("expected run_review_phase function")
	}
	if !strings.Contains(loop, "MAX_REVIEW_CYCLES") {
		t.Error("expected MAX_REVIEW_CYCLES reference")
	}
	if !strings.Contains(loop, "detect_reviewers") {
		t.Error("expected detect_reviewers call")
	}
	if !strings.Contains(loop, "spawn_reviewers") {
		t.Error("expected spawn_reviewers call")
	}
	if !strings.Contains(loop, "feed_implementer") {
		t.Error("expected feed_implementer call")
	}
	if !strings.Contains(loop, "REVIEW_APPROVED") {
		t.Error("expected REVIEW_APPROVED check")
	}
	if !strings.Contains(loop, "REVIEW_BLOCKING") {
		t.Error("expected REVIEW_BLOCKING check")
	}
}

func TestLoopScriptImprovePhase_ContainsAllSections(t *testing.T) {
	phase := loopScriptImprovePhase(loopImproveOptions{
		maxIters:   7,
		timeBudget: 1800,
	})

	if !strings.Contains(phase, "MAX_ITERS=7") {
		t.Error("expected MAX_ITERS=7")
	}
	if !strings.Contains(phase, "TIME_BUDGET=1800") {
		t.Error("expected TIME_BUDGET=1800")
	}
	if !strings.Contains(phase, "get_topics") {
		t.Error("expected get_topics function")
	}
	if !strings.Contains(phase, "build_improve_prompt") {
		t.Error("expected build_improve_prompt function")
	}
	if !strings.Contains(phase, "detect_improve_marker") {
		t.Error("expected detect_improve_marker function")
	}
	if !strings.Contains(phase, "IMPROVED") {
		t.Error("expected IMPROVED marker")
	}
	if !strings.Contains(phase, "NO_IMPROVEMENT") {
		t.Error("expected NO_IMPROVEMENT marker")
	}
	if !strings.Contains(phase, "git tag -f") {
		t.Error("expected git tag for rollback")
	}
	if !strings.Contains(phase, "git reset --hard") {
		t.Error("expected git reset for failed iterations")
	}
}

func TestValidateReviewers_AcceptsValid(t *testing.T) {
	for _, name := range []string{"claude-sonnet", "claude-opus", "gemini", "codex"} {
		if err := validateReviewers([]string{name}); err != nil {
			t.Errorf("expected %q to be valid, got: %v", name, err)
		}
	}
}

func TestValidateReviewers_RejectsInvalid(t *testing.T) {
	err := validateReviewers([]string{"claude-sonnet", "invalid"})
	if err == nil {
		t.Error("expected error for invalid reviewer")
	}
	if !strings.Contains(err.Error(), "invalid") {
		t.Errorf("expected 'invalid' in error, got: %v", err)
	}
}

func TestLoopScriptReviewLoop_AnchoredApproval(t *testing.T) {
	loop := loopScriptReviewLoop()

	// Must use anchored grep for REVIEW_APPROVED
	if !strings.Contains(loop, `^REVIEW_APPROVED$`) {
		t.Error("expected anchored grep for REVIEW_APPROVED")
	}
	// Must strip carriage returns for Windows CLI compat
	if !strings.Contains(loop, `tr -d '\r'`) {
		t.Error("expected tr -d '\\r' for Windows CLI compat")
	}
}

// --- Bug fix regression tests ---

func TestLoopCommand_DefinesLogFunction(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "log()") {
		t.Error("expected log() function definition in script")
	}
	if !strings.Contains(script, "timestamp()") {
		t.Error("expected timestamp() function definition in script")
	}
	if !strings.Contains(script, "HAS_JQ=false") {
		t.Error("expected HAS_JQ initialization in script")
	}
}

func TestLoopCommand_ReviewPeriodicCallSite(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet",
		"--review-every", "3",
	)
	if err != nil {
		t.Fatalf("loop --reviewers --review-every failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Periodic review: COMPLETED_SINCE_REVIEW counter and call
	if !strings.Contains(script, "COMPLETED_SINCE_REVIEW") {
		t.Error("expected COMPLETED_SINCE_REVIEW counter for periodic review")
	}
	if !strings.Contains(script, `run_review_phase "periodic"`) {
		t.Error("expected periodic review call-site in main loop")
	}
	if !strings.Contains(script, `run_review_phase "final"`) {
		t.Error("expected final review call-site after main loop")
	}
	if !strings.Contains(script, "REVIEW_BASE_SHA") {
		t.Error("expected REVIEW_BASE_SHA for diff range tracking")
	}
}

func TestLoopCommand_ReviewEndOnlyCallSite(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet",
		"--review-every", "0",
	)
	if err != nil {
		t.Fatalf("loop --reviewers --review-every=0 failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// End-only review: no periodic counter, but final call
	if strings.Contains(script, "COMPLETED_SINCE_REVIEW") {
		t.Error("expected NO COMPLETED_SINCE_REVIEW counter for end-only review")
	}
	if !strings.Contains(script, `run_review_phase "final"`) {
		t.Error("expected final review call-site after main loop")
	}
}

func TestLoopCommand_ImproveUsesFailedCount(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--improve")
	if err != nil {
		t.Fatalf("loop --improve failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The improve phase must use FAILED_COUNT (not FAILED) to match the main loop variable
	if strings.Contains(script, "[ $FAILED -eq 0 ]") {
		t.Error("improve phase uses undefined $FAILED variable; should use $FAILED_COUNT")
	}
	if !strings.Contains(script, "FAILED_COUNT") {
		t.Error("expected FAILED_COUNT in improve phase guard")
	}
}

func TestLoopCommand_ImproveUsesExtractTextWithArgs(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--improve")
	if err != nil {
		t.Fatalf("loop --improve failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// extract_text must be called with file args, not as a pipeline filter
	if strings.Contains(script, "| extract_text >") {
		t.Error("improve phase pipes into extract_text but it expects file args")
	}
	if !strings.Contains(script, `extract_text "$TRACEFILE" "$LOGFILE"`) {
		t.Error("expected extract_text called with file arguments")
	}
}

func TestLoopScriptReviewTriggers_Periodic(t *testing.T) {
	init, periodic, final := loopScriptReviewTriggers(3)

	if !strings.Contains(init, "REVIEW_BASE_SHA") {
		t.Error("expected REVIEW_BASE_SHA in init")
	}
	if !strings.Contains(init, "COMPLETED_SINCE_REVIEW=0") {
		t.Error("expected COMPLETED_SINCE_REVIEW counter in init")
	}
	if !strings.Contains(periodic, `run_review_phase "periodic"`) {
		t.Error("expected periodic review call")
	}
	if !strings.Contains(final, `run_review_phase "final"`) {
		t.Error("expected final review call")
	}
	if !strings.Contains(final, "COMPLETED_SINCE_REVIEW") {
		t.Error("expected COMPLETED_SINCE_REVIEW check in final trigger")
	}
}

func TestLoopScriptReviewTriggers_EndOnly(t *testing.T) {
	init, periodic, final := loopScriptReviewTriggers(0)

	if !strings.Contains(init, "REVIEW_BASE_SHA") {
		t.Error("expected REVIEW_BASE_SHA in init")
	}
	if strings.Contains(init, "COMPLETED_SINCE_REVIEW") {
		t.Error("expected NO counter in end-only mode")
	}
	if periodic != "" {
		t.Error("expected empty periodic trigger in end-only mode")
	}
	if !strings.Contains(final, `run_review_phase "final"`) {
		t.Error("expected final review call")
	}
	if !strings.Contains(final, `"$COMPLETED" -gt 0`) {
		t.Error("expected COMPLETED check in end-only final trigger")
	}
}

func TestLoopCommand_GeneratedScriptBashSyntax(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()

	tests := []struct {
		name string
		args []string
	}{
		{"basic", []string{"loop", "-o", filepath.Join(dir, "basic.sh")}},
		{"with-reviewers", []string{"loop", "-o", filepath.Join(dir, "review.sh"),
			"--reviewers", "claude-sonnet,gemini", "--review-every", "2"}},
		{"with-improve", []string{"loop", "-o", filepath.Join(dir, "improve.sh"), "--improve"}},
		{"all-flags", []string{"loop", "-o", filepath.Join(dir, "all.sh"),
			"--reviewers", "claude-sonnet,claude-opus,gemini,codex",
			"--review-every", "3", "--review-blocking", "--improve",
			"--improve-max-iters", "10", "--improve-time-budget", "3600"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCommand(root, tt.args...)
			if err != nil {
				t.Fatalf("command failed: %v", err)
			}

			// Run bash -n syntax check on the generated script
			out, bashErr := executeBashSyntaxCheck(tt.args[2]) // args[2] is the -o path
			if bashErr != nil {
				t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
			}
		})
	}
}

func TestLoopScriptReviewConfig_NonBlocking(t *testing.T) {
	config := loopScriptReviewConfig(loopReviewOptions{
		reviewers:       []string{"gemini"},
		maxReviewCycles: 3,
		reviewBlocking:  false,
		reviewModel:     "claude-opus-4-6",
		reviewEvery:     0,
	})

	if !strings.Contains(config, "REVIEW_BLOCKING=false") {
		t.Error("expected REVIEW_BLOCKING=false")
	}
}
