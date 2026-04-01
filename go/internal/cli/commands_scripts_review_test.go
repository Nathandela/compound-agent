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
// Requires bash to be available (always on Unix; on Windows only with Git Bash).
func executeBashSyntaxCheck(t *testing.T, path string) (string, error) {
	t.Helper()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available on this platform")
	}
	cmd := exec.Command("bash", "-n", path)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// --- CLI flag tests ---

func TestLoopCommand_WithReviewers(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
	for _, name := range []string{"claude-sonnet", "claude-opus", "gemini", "codex"} {
		if err := validateReviewers([]string{name}); err != nil {
			t.Errorf("expected %q to be valid, got: %v", name, err)
		}
	}
}

func TestValidateReviewers_RejectsInvalid(t *testing.T) {
	t.Parallel()
	err := validateReviewers([]string{"claude-sonnet", "invalid"})
	if err == nil {
		t.Error("expected error for invalid reviewer")
	}
	if !strings.Contains(err.Error(), "invalid") {
		t.Errorf("expected 'invalid' in error, got: %v", err)
	}
}

func TestLoopScriptReviewLoop_AnchoredApproval(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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

func TestLoopCommand_UsesTwoScopeLogging(t *testing.T) {
	t.Parallel()
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

	// Main loop uses pipe-based two-scope logging: claude | tee $TRACE | extract_text > $LOG
	if !strings.Contains(script, "| tee") {
		t.Error("expected tee-based two-scope logging in main loop")
	}
	if !strings.Contains(script, "| extract_text >") {
		t.Error("expected piped extract_text in main loop")
	}
	// extract_text reads from stdin (no file args in function definition)
	if strings.Contains(script, `extract_text() {
  local file="$1"`) {
		t.Error("extract_text should read from stdin, not take file args")
	}
}

func TestLoopScriptReviewTriggers_Periodic(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
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
			out, bashErr := executeBashSyntaxCheck(t, tt.args[2]) // args[2] is the -o path
			if bashErr != nil {
				t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
			}
		})
	}
}

func TestLoopScriptReviewConfig_NonBlocking(t *testing.T) {
	t.Parallel()
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

// --- Parity tests: verify Go generator matches production infinity-loop.sh ---

func TestLoopCommand_CrashHandler(t *testing.T) {
	t.Parallel()
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

	checks := map[string]string{
		"_loop_cleanup":           "crash handler function",
		"trap _loop_cleanup EXIT": "EXIT trap",
		"stop_memory_watchdog":    "watchdog cleanup in crash handler",
		`\"status\":\"crashed\"`:  "crash status JSON",
		"BASH_LINENO":             "crash line number reporting",
	}
	for needle, desc := range checks {
		if !strings.Contains(script, needle) {
			t.Errorf("missing %s: expected %q", desc, needle)
		}
	}
}

func TestLoopCommand_MemoryWatchdog(t *testing.T) {
	t.Parallel()
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

	checks := map[string]string{
		"WATCHDOG_THRESHOLD":    "watchdog threshold config",
		"WATCHDOG_INTERVAL":     "watchdog interval config",
		"get_memory_pct":        "extracted memory function",
		"start_memory_watchdog": "watchdog start function",
		"stop_memory_watchdog":  "watchdog stop function",
		"WATCHDOG_PID":          "watchdog PID tracking",
		"CLAUDE_PGID":           "background subshell PID",
	}
	for needle, desc := range checks {
		if !strings.Contains(script, needle) {
			t.Errorf("missing %s: expected %q", desc, needle)
		}
	}
}

func TestLoopCommand_RepoScopedOrphanCleanup(t *testing.T) {
	t.Parallel()
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

	// Orphan cleanup must be scoped to repo directory
	if !strings.Contains(script, "repo_dir") {
		t.Error("orphan cleanup not scoped to repo directory")
	}
	if !strings.Contains(script, "lsof") {
		t.Error("missing macOS process cwd detection (lsof)")
	}
	if !strings.Contains(script, "readlink") {
		t.Error("missing Linux process cwd detection (readlink)")
	}
}

func TestLoopCommand_DependencyChecking(t *testing.T) {
	t.Parallel()
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

	checks := map[string]string{
		"check_deps_closed": "dependency checking function",
		"parse_json":        "JSON parsing function",
		"depends_on":        "depends_on field access",
		"blocking_dep":      "blocking dependency detection",
	}
	for needle, desc := range checks {
		if !strings.Contains(script, needle) {
			t.Errorf("missing %s: expected %q", desc, needle)
		}
	}
}

func TestLoopCommand_DualFileMarkerDetection(t *testing.T) {
	t.Parallel()
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

	// detect_marker takes two args: logfile and tracefile
	if !strings.Contains(script, `detect_marker() {
  local logfile="$1" tracefile="$2"`) {
		t.Error("detect_marker should take two file arguments (logfile + tracefile)")
	}
	// Uses anchored grep for primary detection
	if !strings.Contains(script, `"^EPIC_COMPLETE$"`) {
		t.Error("missing anchored EPIC_COMPLETE grep")
	}
	// Extracts HUMAN_REQUIRED reason
	if !strings.Contains(script, `"^HUMAN_REQUIRED:"`) {
		t.Error("missing HUMAN_REQUIRED reason extraction")
	}
	// Call site passes both files
	if !strings.Contains(script, `detect_marker "$LOGFILE" "$TRACEFILE"`) {
		t.Error("detect_marker call site should pass both LOGFILE and TRACEFILE")
	}
}

func TestLoopCommand_GitStatusCheckAfterEpic(t *testing.T) {
	t.Parallel()
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

	if !strings.Contains(script, "git diff --quiet") {
		t.Error("missing git status check after epic completion")
	}
	if !strings.Contains(script, "auto-committing") {
		t.Error("missing auto-commit for dirty working tree")
	}
}

func TestLoopCommand_GitPushAtEnd(t *testing.T) {
	t.Parallel()
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

	if !strings.Contains(script, "git push") {
		t.Error("missing git push at loop end")
	}
	if !strings.Contains(script, "git remote get-url origin") {
		t.Error("missing remote availability check before push")
	}
}

func TestLoopCommand_CLIPrerequisites(t *testing.T) {
	t.Parallel()
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

	if !strings.Contains(script, `command -v claude >/dev/null || die`) {
		t.Error("missing claude CLI prerequisite check")
	}
	if !strings.Contains(script, `command -v bd >/dev/null || die`) {
		t.Error("missing bd CLI prerequisite check")
	}
	if !strings.Contains(script, "die()") {
		t.Error("missing die() helper function")
	}
}

func TestLoopCommand_ReviewerAvailabilitySummary(t *testing.T) {
	t.Parallel()
	detection := loopScriptReviewerDetection()

	if !strings.Contains(detection, "Configured reviewers:") {
		t.Error("missing configured reviewers log line")
	}
	if !strings.Contains(detection, "configured but unavailable") {
		t.Error("missing unavailable reviewer diagnostics")
	}
}

func TestLoopCommand_ExtractTextPython3Fallback(t *testing.T) {
	t.Parallel()
	helpers := loopScriptHelpers()

	if !strings.Contains(helpers, "python3 -c") {
		t.Error("extract_text missing python3 fallback")
	}
	if !strings.Contains(helpers, "json.loads") {
		t.Error("extract_text python3 fallback should parse JSON line by line")
	}
}

func TestLoopCommand_StderrCapture(t *testing.T) {
	t.Parallel()
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

	if !strings.Contains(script, ".stderr") {
		t.Error("missing stderr capture")
	}
	if !strings.Contains(script, "extract_text may have failed") {
		t.Error("missing extract_text health check warning")
	}
}

// --- Structural ordering tests: verify injection points are correct ---

func TestLoopCommand_ReviewTriggersBeforeExit(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet", "--review-every", "2")
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	periodicIdx := strings.Index(script, `run_review_phase "periodic"`)
	finalIdx := strings.Index(script, `run_review_phase "final"`)
	exitIdx := strings.LastIndex(script, "exit 0 || exit 1")

	if periodicIdx < 0 {
		t.Fatal("periodic review trigger not found")
	}
	if finalIdx < 0 {
		t.Fatal("final review trigger not found")
	}
	if exitIdx < 0 {
		t.Fatal("exit line not found")
	}

	if periodicIdx > exitIdx {
		t.Errorf("periodic review trigger (pos %d) appears AFTER exit (pos %d) -- dead code", periodicIdx, exitIdx)
	}
	if finalIdx > exitIdx {
		t.Errorf("final review trigger (pos %d) appears AFTER exit (pos %d) -- dead code", finalIdx, exitIdx)
	}
}

func TestLoopCommand_ImprovePhaseBeforeExit(t *testing.T) {
	t.Parallel()
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

	improveIdx := strings.Index(script, "Improvement phase")
	exitIdx := strings.LastIndex(script, "exit 0")

	if improveIdx < 0 {
		t.Fatal("improve phase not found")
	}
	if exitIdx < 0 {
		t.Fatal("exit line not found")
	}
	if improveIdx > exitIdx {
		t.Errorf("improve phase (pos %d) appears AFTER exit (pos %d) -- dead code", improveIdx, exitIdx)
	}
}

func TestLoopCommand_ReviewInitBeforeWhile(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet", "--review-every", "1")
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	initIdx := strings.Index(script, "REVIEW_BASE_SHA=$(git rev-parse HEAD)")
	whileIdx := strings.Index(script, "while true; do")

	if initIdx < 0 {
		t.Fatal("REVIEW_BASE_SHA init not found")
	}
	if whileIdx < 0 {
		t.Fatal("while loop not found")
	}
	if initIdx > whileIdx {
		t.Errorf("REVIEW_BASE_SHA init (pos %d) appears INSIDE the while loop (pos %d) -- resets every iteration", initIdx, whileIdx)
	}
}

func TestLoopCommand_PeriodicTriggerInsideSuccessBranch(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet", "--review-every", "1")
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Periodic trigger should be BETWEEN COMPLETED++ and the elif/else branches
	completedIdx := strings.Index(script, `COMPLETED=$((COMPLETED + 1))`)
	periodicIdx := strings.Index(script, `run_review_phase "periodic"`)
	elifIdx := strings.Index(script, `"$SUCCESS" = skip`)

	if completedIdx < 0 || periodicIdx < 0 || elifIdx < 0 {
		t.Fatal("expected COMPLETED++, periodic trigger, and elif to exist")
	}
	if periodicIdx < completedIdx {
		t.Error("periodic trigger should be AFTER COMPLETED++")
	}
	if periodicIdx > elifIdx {
		t.Error("periodic trigger should be BEFORE the elif branch (inside success branch)")
	}
}

func TestLoopCommand_ImproveUsesPipeExtractText(t *testing.T) {
	t.Parallel()
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

	// Improve phase must NOT call extract_text with file arguments
	if strings.Contains(script, `extract_text "$TRACEFILE" "$LOGFILE"`) {
		t.Error("improve phase calls extract_text with file args but function reads from stdin")
	}
}

func TestLoopCommand_RejectsExtraPositionalArgs(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	// Space-separated epics look like extra positional args to cobra.
	// This must error rather than silently dropping epics.
	_, err := executeCommand(root, "loop", "-o", outPath,
		"--epics", "epic-1", "epic-2", "epic-3",
	)
	if err == nil {
		t.Fatal("expected error when extra positional args are passed (space-separated epics)")
	}
	if !strings.Contains(err.Error(), "unknown command") {
		t.Errorf("expected cobra 'unknown command' error, got: %v", err)
	}
}
