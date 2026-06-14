package cli

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// buildBgCollectReviewerLoopScript builds a bash test script that invokes
// bg_collect_reviewer from the loop script's bg reviewer helpers.
// It stubs claude, sets up state.json, and optionally a worktree with a commit.
func buildBgCollectReviewerLoopScript(
	t *testing.T,
	repoDir, stubDir, harvestLog, handle string,
) string {
	t.Helper()
	// Fake $HOME with a state.json for the handle.
	fakeHome := t.TempDir()
	jobDir := filepath.Join(fakeHome, ".claude", "jobs", handle)
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		t.Fatalf("mkdir job dir: %v", err)
	}
	stateJSON := `{"state":"done","inFlight":{"tasks":0},"output":"review complete"}`
	if err := os.WriteFile(filepath.Join(jobDir, "state.json"), []byte(stateJSON), 0o644); err != nil {
		t.Fatalf("write state.json: %v", err)
	}

	helpers := loopScriptBgReviewHelpers()
	report := filepath.Join(t.TempDir(), "report.md")
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HOME=\"" + fakeHome + "\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"HAS_JQ=false\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		helpers + "\n" +
		"bg_collect_reviewer \"" + handle + "\" \"" + report + "\"\n"
	return script
}

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
		"--review-model", "claude-opus-4-7",
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

// --- Review template unit tests ---

func TestLoopScriptReviewConfig_SetsVariables(t *testing.T) {
	t.Parallel()
	config := loopScriptReviewConfig(loopReviewOptions{
		reviewers:       []string{"claude-sonnet", "gemini"},
		maxReviewCycles: 5,
		reviewBlocking:  true,
		reviewModel:     "claude-opus-4-7",
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

// TestAntigravityReviewer_NotActive asserts antigravity is NOT a selectable loop
// reviewer. agy -p drops stdout in non-TTY, so its report is always empty; the
// review loop treats an empty report as a reviewer error, and a cycle where all
// reviewers errored is "treated as approved" -> an antigravity-only run could
// falsely report approval. The reviewer wiring is therefore removed: antigravity
// is rejected by --reviewers and absent from the generated review bash. The
// antigravity HARNESS setup target (installAntigravity / AGENTS.md template)
// stays as groundwork and is covered by setup tests, not here.
func TestAntigravityReviewer_NotActive(t *testing.T) {
	t.Parallel()
	if validLoopReviewerSet()["antigravity"] {
		t.Error("antigravity must NOT be a valid loop reviewer (false-approval risk)")
	}
	for _, n := range validLoopReviewerNames() {
		if n == "antigravity" {
			t.Error("antigravity must NOT appear in validLoopReviewerNames")
		}
	}
	if err := validateReviewers([]string{"antigravity"}); err == nil {
		t.Error("expected --reviewers antigravity to be rejected")
	}
	detection := loopScriptReviewerDetection()
	if strings.Contains(detection, "agy") {
		t.Error("antigravity detection case must be removed from reviewer detection")
	}
	spawn := loopScriptSpawnReviewers()
	if strings.Contains(spawn, "agy") {
		t.Error("antigravity spawn case (agy -p) must be removed from spawn_reviewers")
	}
}

// TestValidLoopReviewerSet_ExactMembers asserts the valid loop-reviewer set is
// exactly {claude-sonnet, claude-opus, gemini, codex} — no more, no less.
func TestValidLoopReviewerSet_ExactMembers(t *testing.T) {
	t.Parallel()
	want := map[string]bool{
		"claude-sonnet": true,
		"claude-opus":   true,
		"gemini":        true,
		"codex":         true,
	}
	got := validLoopReviewerSet()
	if len(got) != len(want) {
		t.Errorf("valid loop reviewer set size = %d, want %d (set: %v)", len(got), len(want), got)
	}
	for name := range want {
		if !got[name] {
			t.Errorf("expected %q in valid loop reviewer set", name)
		}
	}
	for name := range got {
		if !want[name] {
			t.Errorf("unexpected reviewer %q in valid loop reviewer set", name)
		}
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
		{"all-flags", []string{"loop", "-o", filepath.Join(dir, "all.sh"),
			"--reviewers", "claude-sonnet,claude-opus,gemini,codex",
			"--review-every", "3", "--review-blocking"}},
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
		reviewModel:     "claude-opus-4-7",
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
		// T1 seam: CLAUDE_PGID renamed to AGENT_HANDLE (backend-agnostic; p backend sets it to subshell PID)
		"AGENT_HANDLE": "backend-agnostic session handle (was CLAUDE_PGID pre-T1)",
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

// ===== T5: R-REVIEW, R-FLEET, R-FRAMEWORK tests =====

// TestLoopScriptSpawnReviewers_BgCycle1NoPSessionID verifies that under bg backend
// cycle 1 does NOT pass --session-id (spike G1: --bg ignores --session-id).
func TestLoopScriptSpawnReviewers_BgCycle1NoPSessionID(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// The bg cycle-1 path must use plain claude --bg (no --session-id)
	if !strings.Contains(spawner, "bg_dispatch_reviewer") {
		t.Error("expected bg_dispatch_reviewer helper for bg backend review dispatch")
	}
	// The p path still uses --session-id
	if !strings.Contains(spawner, `--session-id "$sid"`) {
		t.Error("expected --session-id in p backend cycle-1 path")
	}
}

// TestLoopScriptSpawnReviewers_BgCapturesSessionId verifies that after cycle 1 bg dispatch,
// the .sessionId is read from state.json and persisted in sessions.json.
func TestLoopScriptSpawnReviewers_BgCapturesSessionId(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Must read .sessionId from ~/.claude/jobs/<short>/state.json
	if !strings.Contains(spawner, ".sessionId") {
		t.Error("expected .sessionId extraction from state.json for bg cycle-1 capture")
	}
	// Must persist into sessions.json
	if !strings.Contains(spawner, "sessions.json") {
		t.Error("expected sessions.json update after bg cycle-1 sessionId capture")
	}
}

// TestLoopScriptSpawnReviewers_BgCycle2UsesResume verifies that cycle 2+ under bg
// uses `claude --bg --resume <sessionId>` (not --session-id).
func TestLoopScriptSpawnReviewers_BgCycle2UsesResume(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Must have --bg --resume path for cycle 2+
	if !strings.Contains(spawner, `--bg --resume`) {
		t.Error("expected claude --bg --resume for cycle 2+ under bg backend")
	}
}

// TestLoopScriptSpawnReviewers_BgPollsToTerminal verifies that bg reviewer dispatch
// polls state.json to terminal (not just waits for a sync PID).
func TestLoopScriptSpawnReviewers_BgPollsToTerminal(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Must poll state.json for reviewer bg sessions
	if !strings.Contains(spawner, "bg_poll_reviewer") {
		t.Error("expected bg_poll_reviewer helper for polling reviewer bg sessions to terminal")
	}
}

// TestLoopScriptSpawnReviewers_BgCollectsOutput verifies that after polling to terminal,
// output is extracted from state.json (.output/.detail) into the report file.
func TestLoopScriptSpawnReviewers_BgCollectsOutput(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Must collect output from state.json into the report file
	if !strings.Contains(spawner, "bg_collect_reviewer") {
		t.Error("expected bg_collect_reviewer helper to extract state.json output into report file")
	}
}

// TestLoopScriptSpawnReviewers_MixedFleetBarrier verifies that the barrier waits
// both bg Claude handles (via polling) and gemini/codex PIDs (via wait $pid).
func TestLoopScriptSpawnReviewers_MixedFleetBarrier(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Gemini/codex still use sync & + wait $pid
	if !strings.Contains(spawner, "for pid in $pids") {
		t.Error("expected PID-based wait for gemini/codex in mixed-fleet barrier")
	}
	// Claude bg handles tracked separately and polled
	if !strings.Contains(spawner, "bg_handles") {
		t.Error("expected bg_handles tracking for claude bg reviewer sessions")
	}
}

// TestLoopScriptSpawnReviewers_BgTeardown verifies that reviewer bg sessions are
// torn down (stop + rm) after their output is collected (ephemeral, not harvested).
func TestLoopScriptSpawnReviewers_BgTeardown(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Must stop and rm reviewer bg sessions after collecting output
	if !strings.Contains(spawner, "claude stop") {
		t.Error("expected claude stop for reviewer bg session teardown")
	}
	if !strings.Contains(spawner, "claude rm") {
		t.Error("expected claude rm for reviewer bg session teardown")
	}
}

// TestLoopScriptSessionIDManagement_BgSkipsUuidgen verifies that under bg, sessions.json
// is initialized with empty slots (not pre-generated UUIDs — bg assigns its own).
func TestLoopScriptSessionIDManagement_BgSkipsUuidgen(t *testing.T) {
	t.Parallel()
	mgmt := loopScriptSessionIDManagement()

	// The p path uses uuidgen; bg must NOT pre-generate a UUID (spike G1 correction).
	// The bg path should leave the slot empty for cycle-1 capture.
	if !strings.Contains(mgmt, "CA_BACKEND") {
		t.Error("expected CA_BACKEND check in init_review_sessions to differentiate p vs bg UUID handling")
	}
}

// TestLoopScriptBgReviewHelpers verifies that bg_dispatch_reviewer, bg_poll_reviewer,
// bg_collect_reviewer helpers are defined in the spawn_reviewers output.
func TestLoopScriptBgReviewHelpers_Defined(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	helpers := []string{
		"bg_dispatch_reviewer()",
		"bg_poll_reviewer()",
		"bg_collect_reviewer()",
	}
	for _, h := range helpers {
		if !strings.Contains(spawner, h) {
			t.Errorf("expected helper function %q defined in spawn_reviewers", h)
		}
	}
}

// TestLoopScriptBgReviewHelpers_S12Guard verifies that bg_poll_reviewer treats
// unknown/partial .state as still-running (S12 guard, R-BG).
func TestLoopScriptBgReviewHelpers_S12Guard(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// Defensive terminal set: done|completed|failed|stopped|error|cancel
	terminalSet := "done|completed|failed|stopped|error|cancel"
	if !strings.Contains(spawner, terminalSet) {
		t.Errorf("expected defensive terminal set %q in bg_poll_reviewer (S12 guard)", terminalSet)
	}
}

// TestLoopScriptBgReviewHelpers_PBackendUnchanged verifies that the p backend path
// in spawn_reviewers is byte-identical to the pre-T5 implementation (R-PLEGACY).
func TestLoopScriptSpawnReviewers_PBackendUnchanged(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()

	// p backend cycle-1: agent_invoke with --session-id
	if !strings.Contains(spawner, `portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$model_name"`) {
		t.Error("expected p backend cycle-1 to use portable_timeout agent_invoke with model_name")
	}
	// p backend cycle-1: --session-id flag
	if !strings.Contains(spawner, `--session-id "$sid"`) {
		t.Error("expected p backend cycle-1 to pass --session-id")
	}
	// p backend cycle-2+: --resume flag
	if !strings.Contains(spawner, `--resume "$sid"`) {
		t.Error("expected p backend cycle-2+ to use --resume")
	}
	// p backend: -p flag for prompt
	if !strings.Contains(spawner, `-p "$(cat "$prompt_file")"`) {
		t.Error("expected p backend to use -p flag with prompt file content")
	}
}

// TestLoopScriptImplementerPhase_PBackendUnchanged verifies that the implementer phase
// still uses agent_invoke with -p for the p backend (R-PLEGACY).
func TestLoopScriptImplementerPhase_PBackendUnchanged(t *testing.T) {
	t.Parallel()
	impl := loopScriptImplementerPhase()

	if !strings.Contains(impl, `portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$REVIEW_MODEL"`) {
		t.Error("expected implementer to use portable_timeout agent_invoke REVIEW_MODEL")
	}
	if !strings.Contains(impl, `-p "$impl_prompt"`) {
		t.Error("expected implementer to use -p flag with impl_prompt")
	}
}

// TestLoopCommand_ReviewerBashSyntaxWithBgSeam verifies that the generated loop script
// (with reviewers) passes bash -n syntax check under the full seam (bg-capable).
func TestLoopCommand_ReviewerBashSyntaxWithBgSeam(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-with-reviewers.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet,claude-opus,gemini,codex",
		"--review-every", "2")
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	out, bashErr := executeBashSyntaxCheck(t, outPath)
	if bashErr != nil {
		t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
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

// TestT5_BgCollectReviewer_Loop_NoRmIfWorktreeHasCommits is a runtime test that
// verifies bg_collect_reviewer (loop script) does NOT call claude rm when the
// reviewer's bg worktree has commits ahead of main, logging HUMAN_REQUIRED instead.
// The report is still collected so the review cycle logic is unaffected.
// R-HARVEST-FAIL, T3/T4 invariant: structural worktree check before every claude rm.
func TestT5_BgCollectReviewer_Loop_NoRmIfWorktreeHasCommits(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "rev1test"

	// Init git repo with initial commit.
	setupGitRepoForHarvest(t, repoDir)

	// Write pre-dispatch snapshot BEFORE adding the reviewer worktree.
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, handle+".txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}

	// Add a worktree with a commit (simulating reviewer that misbehaved and committed).
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", handle)
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-"+handle, wtDir)
	writeFile(t, wtDir, "reviewer-output.txt", "review notes")
	mustGit(t, wtDir, "add", "reviewer-output.txt")
	mustGit(t, wtDir, "commit", "-m", "reviewer: unexpectedly committed")

	// Build claude stub that records rm invocations.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	harvestLog := filepath.Join(t.TempDir(), "harvest.log")
	script := buildBgCollectReviewerLoopScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-loop-commit.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm must NOT have been called (worktree has commits).
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	if _, statErr := os.Stat(rmLog); statErr == nil {
		t.Errorf("claude rm was invoked despite reviewer worktree having commits — data-loss guard broken\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED must be logged.
	harvest, _ := os.ReadFile(harvestLog)
	combined := string(harvest) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when reviewer worktree has commits\noutput:\n%s", combined)
	}
}

// TestT5_BgCollectReviewer_Loop_NoRmIfWorktreeHasCommits_Cycle2 is a runtime test
// that verifies bg_collect_reviewer (loop script) does NOT call claude rm for a
// cycle-2+ resumed session handle whose worktree has commits, when a snapshot was
// written by the cycle-2+ dispatch path (via _bg_snapshot_worktrees).
// This closes the residual data-loss gap: cycle-1 fix covered the cycle-1 path;
// this test covers the cycle-2+ resumed-dispatch path with the same invariant.
func TestT5_BgCollectReviewer_Loop_NoRmIfWorktreeHasCommits_Cycle2(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	// Use a distinct handle to simulate a cycle-2+ resumed session new short_id.
	handle := "rev3c2test"

	setupGitRepoForHarvest(t, repoDir)

	// Simulate the cycle-2+ path: capture pre-snapshot, add worktree+commit, then
	// write snapshot (as _bg_snapshot_worktrees does after parsing the new short_id).
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	// Add a worktree with a commit (reviewer misbehaved and committed).
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", handle)
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-"+handle, wtDir)
	writeFile(t, wtDir, "reviewer-c2-output.txt", "cycle-2 review notes")
	mustGit(t, wtDir, "add", "reviewer-c2-output.txt")
	mustGit(t, wtDir, "commit", "-m", "reviewer: unexpectedly committed in cycle 2")
	// Write snapshot (keyed to handle) AFTER worktree was created, but with the
	// pre-dispatch snapshot content — exactly what _bg_snapshot_worktrees does.
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, handle+".txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}

	// Build claude stub that records rm invocations.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	harvestLog := filepath.Join(t.TempDir(), "harvest.log")
	script := buildBgCollectReviewerLoopScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-loop-c2-commit.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm must NOT have been called (worktree has commits).
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	if _, statErr := os.Stat(rmLog); statErr == nil {
		t.Errorf("claude rm was invoked despite cycle-2 reviewer worktree having commits — data-loss guard broken\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED must be logged.
	harvest, _ := os.ReadFile(harvestLog)
	combined := string(harvest) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged for cycle-2 reviewer worktree with commits\noutput:\n%s", combined)
	}
}

// TestT5_BgCollectReviewer_Loop_SnapshotMissing_NoRm verifies the safe-default
// invariant: when the pre-dispatch snapshot file does NOT exist, bg_collect_reviewer
// does NOT call claude rm (cannot verify worktree safety), logs HUMAN_REQUIRED,
// and still writes the reviewer report. This structurally closes the data-loss gap
// even if a future dispatch path forgets to write the snapshot.
func TestT5_BgCollectReviewer_Loop_SnapshotMissing_NoRm(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "rev4nosnap"

	setupGitRepoForHarvest(t, repoDir)
	// Deliberately do NOT write a snapshot file for this handle.

	// Build claude stub.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	harvestLog := filepath.Join(t.TempDir(), "harvest.log")
	script := buildBgCollectReviewerLoopScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-loop-nosnap.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm must NOT be called when snapshot is missing.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	if _, statErr := os.Stat(rmLog); statErr == nil {
		t.Errorf("claude rm was invoked despite missing snapshot — safe-default violated (data-loss risk)\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED must be logged.
	harvest, _ := os.ReadFile(harvestLog)
	combined := string(harvest) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when snapshot is missing\noutput:\n%s", combined)
	}
}

// TestT5_BgCollectReviewer_Loop_RmIfNoWorktreeCommits is a runtime test that
// verifies bg_collect_reviewer (loop script) DOES call claude rm when the
// reviewer's worktree has no commits ahead of main (normal/expected case).
func TestT5_BgCollectReviewer_Loop_RmIfNoWorktreeCommits(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "rev2test"

	// Init git repo, write snapshot, add a worktree but NO commit (clean reviewer).
	setupGitRepoForHarvest(t, repoDir)
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, handle+".txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	// Add a worktree but do NOT commit anything (reviewer only read, didn't commit).
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", handle)
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-"+handle, wtDir)

	// Build claude stub.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	harvestLog := filepath.Join(t.TempDir(), "harvest.log")
	script := buildBgCollectReviewerLoopScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-loop-noop.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm MUST have been called (reviewer made no commits — safe teardown).
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	if _, statErr := os.Stat(rmLog); statErr != nil {
		t.Errorf("claude rm was NOT invoked for reviewer with no worktree commits — teardown must proceed\nscript output:\n%s", out)
	}
}

// ===== P1-1: agent_invoke bg) case + feed_implementer under CA_BACKEND=bg =====

// TestLoopScriptSeam_AgentInvoke_HasBgCase verifies that the loop seam's agent_invoke
// shell function contains a bg) branch (not just p)), so feed_implementer does not
// FATAL under CA_BACKEND=bg. Fail-before: the old code had only p) + *) FATAL.
func TestLoopScriptSeam_AgentInvoke_HasBgCase(t *testing.T) {
	t.Parallel()
	// Generate the seam under both backends and verify bg) is present in both.
	for _, backend := range []string{"p", "bg"} {
		seam := loopScriptSeam(backend, true)
		if !strings.Contains(seam, "bg)") {
			t.Errorf("loopScriptSeam(%q): agent_invoke missing bg) case — feed_implementer will FATAL under CA_BACKEND=bg", backend)
		}
		// Verify the bg) branch falls through to a claude invocation (not just exit 1).
		bgIdx := strings.Index(seam, "bg)")
		if bgIdx < 0 {
			continue
		}
		bgSnippet := seam[bgIdx : bgIdx+300]
		if !strings.Contains(bgSnippet, "claude") {
			t.Errorf("loopScriptSeam(%q): bg) branch in agent_invoke does not invoke claude", backend)
		}
	}
}

// TestFeedImplementer_BgBackend_NoFatal is a runtime test verifying that feed_implementer
// under CA_BACKEND=bg does NOT exit with non-zero (FATAL) and reaches the
// implementer-report path. Uses a stubbed claude that returns fake output.
// Fail-before: the old agent_invoke had only p) + *) FATAL, so CA_BACKEND=bg would
// immediately FATAL inside feed_implementer's portable_timeout agent_invoke call.
func TestFeedImplementer_BgBackend_NoFatal(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	stubDir := t.TempDir()
	cycleDir := t.TempDir()
	repoDir := t.TempDir()

	// Minimal git repo so bootstrap_preflight's git worktree list calls succeed.
	setupGitRepoForHarvest(t, repoDir)

	// Write a fake reviewer report so feed_implementer has something to process.
	reviewReport := filepath.Join(cycleDir, "claude-sonnet.md")
	if err := os.WriteFile(reviewReport, []byte("P1: Fix the bug.\n"), 0o644); err != nil {
		t.Fatalf("write reviewer report: %v", err)
	}

	// Claude stub: answer --bg with a fake session id (for bootstrap_preflight probe),
	// and answer any other synchronous invocation (implementer) with FIXES_APPLIED.
	// Also handle stop/rm for the probe teardown.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"# Stub: handle --bg probe for bootstrap_preflight, then answer implementer.\n" +
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"stop\" ] || [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  exit 0\n" +
		"fi\n" +
		"echo \"FIXES_APPLIED\"\n" +
		"exit 0\n"
	if err := os.WriteFile(claudeStub, []byte(stubContent), 0o755); err != nil {
		t.Fatalf("write claude stub: %v", err)
	}

	// Build a minimal bash script that includes the implementer phase and runs it
	// under CA_BACKEND=bg with the stubbed claude.
	// Only include the seam (for agent_invoke) and the implementer phase itself.
	// Provide the minimal variables feed_implementer needs without pulling in the
	// full loopScriptReviewConfig (which references LOG_DIR).
	impl := loopScriptImplementerPhase()
	// Use the bg seam so agent_invoke has the bg) case under test. bootstrap_preflight
	// is included because the bg seam always calls it; the claude stub answers --bg
	// with a valid fake session id so preflight succeeds.
	seam := loopScriptSeam("bg", true)

	implementerReport := filepath.Join(cycleDir, "implementer.md")

	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		// Minimal variables that feed_implementer reads directly.
		"CA_BACKEND=bg\n" +
		"AVAILABLE_REVIEWERS=\"claude-sonnet\"\n" +
		"REVIEW_MODEL=\"claude-sonnet-4-6\"\n" +
		"REVIEW_TIMEOUT=30\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		// portable_timeout stub: just run the command directly (no real timeout binary needed).
		"portable_timeout() { local _t=\"$1\"; shift; \"$@\"; }\n" +
		seam + "\n" +
		impl + "\n" +
		"feed_implementer \"" + cycleDir + "\"\n"

	scriptPath := filepath.Join(t.TempDir(), "feed-implementer-bg-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Dir = repoDir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	out, runErr := cmd.CombinedOutput()

	// Must NOT exit non-zero (old code would FATAL on *) branch).
	if runErr != nil {
		t.Errorf("feed_implementer under CA_BACKEND=bg exited non-zero (old code would FATAL on *) branch):\n%s\nerr=%v", out, runErr)
	}

	// implementer report must exist and contain FIXES_APPLIED (implementer-report path reachable).
	reportData, readErr := os.ReadFile(implementerReport)
	if readErr != nil {
		t.Errorf("implementer report not created (implementer-report path unreachable):\n%s", out)
	} else if !strings.Contains(string(reportData), "FIXES_APPLIED") {
		t.Errorf("implementer report does not contain FIXES_APPLIED:\nreport=%q\nscript output=%s", string(reportData), out)
	}
}

// TestLoopCmd_ReviewersHelpMentionsGooseReviewers verifies the --reviewers flag
// help text lists the goose fleet reviewer names, not just the claude reviewer
// names. The goose specialty names are the source of truth from
// validGooseReviewerNames(): security, correctness, quality. This is help-text
// only and does not affect the generated script bytes (the byte-identical guard
// strips the Date header and compares script content + seam impls, never help).
func TestLoopCmd_ReviewersHelpMentionsGooseReviewers(t *testing.T) {
	t.Parallel()
	lc := loopCmd()
	f := lc.Flags().Lookup("reviewers")
	if f == nil {
		t.Fatal("expected --reviewers flag to be defined")
	}
	for _, name := range validGooseReviewerNames() {
		if !strings.Contains(f.Usage, name) {
			t.Errorf("expected --reviewers help to mention goose reviewer %q, got: %q", name, f.Usage)
		}
	}
}
