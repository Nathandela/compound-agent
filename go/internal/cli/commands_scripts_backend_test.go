package cli

// T6 tests: --backend flag, default flip to bg, bootstrap preflight (R-BOOTSTRAP, R-DEFAULT, R-PLEGACY, S6).
// Tests are FAIL-BEFORE / PASS-AFTER (TDD).

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- helper: generate loop script via CLI into a temp dir ---

func generateLoopScriptViaCmd(t *testing.T, flags ...string) string {
	t.Helper()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")
	args := append([]string{"loop", "-o", outPath}, flags...)
	_, err := executeCommand(root, args...)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read generated script: %v", err)
	}
	return string(data)
}

func generatePolishScriptViaCmd(t *testing.T, flags ...string) string {
	t.Helper()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")
	base := []string{"polish", "-o", outPath, "--spec-file", "docs/spec.md", "--meta-epic", "test-123"}
	args := append(base, flags...)
	_, err := executeCommand(root, args...)
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read generated script: %v", err)
	}
	return string(data)
}

// --- --backend flag exists on loop + polish ---

func TestLoopCmd_BackendFlagExistsDefaultBg(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	lc := loopCmd()
	root.AddCommand(lc)
	f := lc.Flags().Lookup("backend")
	if f == nil {
		t.Fatal("loop command must define --backend flag")
	}
	if f.DefValue != "bg" {
		t.Errorf("--backend default must be 'bg', got %q", f.DefValue)
	}
}

func TestPolishCmd_BackendFlagExistsDefaultBg(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	pc := polishCmd()
	root.AddCommand(pc)
	f := pc.Flags().Lookup("backend")
	if f == nil {
		t.Fatal("polish command must define --backend flag")
	}
	if f.DefValue != "bg" {
		t.Errorf("--backend default must be 'bg', got %q", f.DefValue)
	}
}

// --- Invalid --backend value is rejected ---

func TestLoopCmd_InvalidBackendRejected(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")
	_, err := executeCommand(root, "loop", "-o", outPath, "--backend", "invalid")
	if err == nil {
		t.Fatal("expected error for invalid --backend value")
	}
	if !strings.Contains(err.Error(), "bg") || !strings.Contains(err.Error(), "p") {
		t.Errorf("error message should mention valid values 'bg' and 'p', got: %v", err)
	}
}

func TestPolishCmd_InvalidBackendRejected(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")
	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/spec.md", "--meta-epic", "test-123",
		"--backend", "invalid")
	if err == nil {
		t.Fatal("expected error for invalid --backend value")
	}
	if !strings.Contains(err.Error(), "bg") || !strings.Contains(err.Error(), "p") {
		t.Errorf("error message should mention valid values 'bg' and 'p', got: %v", err)
	}
}

// --- Default (no flag) generates bg backend ---

func TestLoopCmd_DefaultGeneratesBgBackend(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	// Must NOT hardcode CA_BACKEND=p nor CA_BACKEND=${CA_BACKEND:-p} (old default)
	if strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-p}") {
		t.Error("default loop script must not default CA_BACKEND to p; default is now bg")
	}
	// Must contain bg default
	if !strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-bg}") && !strings.Contains(script, "CA_BACKEND=bg") {
		t.Error("default loop script must set CA_BACKEND to bg (default or hardcoded)")
	}
}

func TestPolishCmd_DefaultGeneratesBgBackend(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t)
	if strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-p}") {
		t.Error("default polish script must not default CA_BACKEND to p; default is now bg")
	}
	if !strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-bg}") && !strings.Contains(script, "CA_BACKEND=bg") {
		t.Error("default polish script must set CA_BACKEND to bg (default or hardcoded)")
	}
}

// --- Explicit --backend bg generates bg backend ---

func TestLoopCmd_ExplicitBackendBgGeneratesBg(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--backend", "bg")
	if strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-p}") {
		t.Error("--backend bg must not emit the legacy p default")
	}
	// Explicit flag: env override no longer applies; CA_BACKEND is hardcoded to bg
	if !strings.Contains(script, "CA_BACKEND=bg") {
		t.Error("explicit --backend bg must emit CA_BACKEND=bg in the script")
	}
}

func TestPolishCmd_ExplicitBackendBgGeneratesBg(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t, "--backend", "bg")
	if strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-p}") {
		t.Error("--backend bg must not emit the legacy p default")
	}
	if !strings.Contains(script, "CA_BACKEND=bg") {
		t.Error("explicit --backend bg must emit CA_BACKEND=bg in the script")
	}
}

// --- Explicit --backend p generates p backend (R-PLEGACY) ---

func TestLoopCmd_ExplicitBackendPGeneratesP(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--backend", "p")
	if strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-bg}") {
		t.Error("--backend p must not emit bg default")
	}
	// Explicit p: hardcoded to p, env cannot override
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("explicit --backend p must emit CA_BACKEND=p in the script")
	}
}

func TestPolishCmd_ExplicitBackendPGeneratesP(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t, "--backend", "p")
	// The seam must set CA_BACKEND=p (the canonical backend selection line).
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("explicit --backend p must emit CA_BACKEND=p in the script")
	}
	// The seam must NOT use the bg default as the main backend selection.
	// (Inner-loop propagation lines may still use ${CA_BACKEND:-bg} as runtime fallback.)
	if strings.Contains(script, "\nCA_BACKEND=${CA_BACKEND:-bg}\n") {
		t.Error("--backend p seam must not emit CA_BACKEND=${CA_BACKEND:-bg} as the primary selection")
	}
}

// --- R-PLEGACY: --backend p retains the legacy claude -p pipeline (byte-identical paths) ---

func TestLoopCmd_PBackend_LegacyClaudePPipelinePreserved(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--backend", "p")
	// The p backend pipeline must still use claude -p with stream-json and the tee pipeline
	if !strings.Contains(script, "claude --dangerously-skip-permissions") {
		t.Error("p backend must still invoke claude --dangerously-skip-permissions")
	}
	if !strings.Contains(script, "--output-format stream-json") {
		t.Error("p backend must still use --output-format stream-json")
	}
	if !strings.Contains(script, "tee") {
		t.Error("p backend must still use tee to capture trace")
	}
	if !strings.Contains(script, "extract_text") {
		t.Error("p backend must still use extract_text")
	}
	// The seam must set CA_BACKEND=p so the runtime takes the p path.
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("p backend must set CA_BACKEND=p in the script")
	}
	// The p branch in agent_dispatch must use -p flag for prompt dispatch.
	if !strings.Contains(script, `-p "$prompt"`) {
		t.Error("p backend agent_dispatch must use -p flag for prompt dispatch")
	}
}

func TestPolishCmd_PBackend_LegacyAgentInvokePreserved(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t, "--backend", "p")
	if !strings.Contains(script, "claude --dangerously-skip-permissions") {
		t.Error("p backend polish must still invoke claude --dangerously-skip-permissions")
	}
	if !strings.Contains(script, "--output-format text") {
		t.Error("p backend polish must still use --output-format text for agent_invoke")
	}
}

// --- CA_BACKEND env override (default/no-flag case) ---

func TestLoopCmd_DefaultEnvOverrideWorks(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	// With default (no --backend flag), env variable must be respected
	// i.e., CA_BACKEND=${CA_BACKEND:-bg} means CA_BACKEND env var can override to p
	if !strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-bg}") {
		t.Error("default loop script must use CA_BACKEND=${CA_BACKEND:-bg} to allow env override")
	}
}

func TestPolishCmd_DefaultEnvOverrideWorks(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t)
	if !strings.Contains(script, "CA_BACKEND=${CA_BACKEND:-bg}") {
		t.Error("default polish script must use CA_BACKEND=${CA_BACKEND:-bg} to allow env override")
	}
}

// --- Bootstrap preflight present in bg scripts, absent in p scripts ---

func TestLoopCmd_BgDefaultContainsBootstrapPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	if !strings.Contains(script, "bootstrap_preflight") {
		t.Error("bg (default) loop script must contain bootstrap_preflight function")
	}
	// Preflight must check for the disclaimer-refusal signature
	if !strings.Contains(script, "dangerously-skip-permissions") {
		t.Error("preflight must reference dangerously-skip-permissions in its check")
	}
}

func TestLoopCmd_ExplicitBgContainsBootstrapPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--backend", "bg")
	if !strings.Contains(script, "bootstrap_preflight") {
		t.Error("--backend bg loop script must contain bootstrap_preflight function")
	}
}

func TestLoopCmd_PBackendSkipsBootstrapPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--backend", "p")
	if strings.Contains(script, "bootstrap_preflight") {
		t.Error("--backend p loop script must NOT contain bootstrap_preflight (not applicable to p backend)")
	}
}

func TestPolishCmd_BgDefaultContainsBootstrapPreflight(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t)
	if !strings.Contains(script, "bootstrap_preflight") {
		t.Error("bg (default) polish script must contain bootstrap_preflight function")
	}
}

func TestPolishCmd_PBackendSkipsBootstrapPreflight(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t, "--backend", "p")
	if strings.Contains(script, "bootstrap_preflight") {
		t.Error("--backend p polish script must NOT contain bootstrap_preflight")
	}
}

// --- Preflight: exits non-zero on disclaimer refusal (S6), passes on acceptance, no leak ---

// extractPreflightFunc extracts the bootstrap_preflight() function definition
// from a generated script. The function uses only bash if/while/fi/done/return
// constructs (no inner { }), so the first "\n}" after the function header is
// the closing brace of bootstrap_preflight itself.
func extractPreflightFunc(t *testing.T, generatedScript string) string {
	t.Helper()
	start := strings.Index(generatedScript, "bootstrap_preflight()")
	if start < 0 {
		t.Fatal("bootstrap_preflight() function not found in generated script")
	}
	// Walk back to the start of the line containing "bootstrap_preflight()".
	funcStart := strings.LastIndex(generatedScript[:start], "\n")
	if funcStart < 0 {
		funcStart = 0
	}
	funcBody := generatedScript[funcStart:]
	// bootstrap_preflight uses if/fi, while/done, return — no inner { }.
	// The first "\n}" is the function's own closing brace.
	end := strings.Index(funcBody[len("bootstrap_preflight()"):], "\n}")
	if end < 0 {
		t.Fatal("could not find closing brace of bootstrap_preflight() function")
	}
	return funcBody[:len("bootstrap_preflight()")+end+2] // include "\n}"
}

// buildPreflightHarness builds a self-contained bash harness that:
//   - Initialises a minimal git repo in a temp dir (for git worktree list calls).
//   - Places a smart claude stub on PATH that:
//     --bg invocation  => emits probeOutput (simulates probe dispatch).
//     stop <id>        => appends "stop <id>" to callLog file, exits 0.
//     rm <id>          => appends "rm <id>" to callLog file, exits 0.
//   - Defines log() and runs bootstrap_preflight.
//
// callLogPath is a file where stop/rm invocations are recorded; the caller
// reads it after the harness exits to assert no-leak behaviour.
func buildPreflightHarness(t *testing.T, generatedScript, probeOutput, callLogPath string) string {
	t.Helper()

	// Minimal git repo so "git worktree list --porcelain" works cleanly.
	repoDir := t.TempDir()
	if out, err := exec.Command("git", "init", repoDir).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v\n%s", err, out)
	}
	if out, err := exec.Command("git", "-C", repoDir, "commit",
		"--allow-empty", "-m", "init", "--no-gpg-sign").CombinedOutput(); err != nil {
		// Non-fatal: worktree list still works on repos with no commits on some git versions.
		t.Logf("git commit (allow-empty) warning: %v\n%s", err, out)
	}

	// Smart claude stub: behaviour depends on subcommand / flags.
	// The call log file is written by the stub for assertion.
	stubDir := t.TempDir()
	stubPath := filepath.Join(stubDir, "claude")
	// probeOutput may contain single quotes; use a temp file to avoid quoting issues.
	probeFile := filepath.Join(stubDir, "probe_output.txt")
	if err := os.WriteFile(probeFile, []byte(probeOutput+"\n"), 0o644); err != nil {
		t.Fatalf("write probe output file: %v", err)
	}
	stubContent := "#!/usr/bin/env bash\n" +
		"# Smart claude stub for preflight tests\n" +
		"CALL_LOG=" + callLogPath + "\n" +
		"PROBE_FILE=" + probeFile + "\n" +
		// bootstrap_preflight's bgIsolation precondition queries
		// `claude config get worktree.bgIsolation`; simulate the required
		// operator config so the disclaimer logic under test is reached.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then echo none; exit 0; fi\n" +
		"case \"$1\" in\n" +
		"  stop) echo \"stop $2\" >> \"$CALL_LOG\"; exit 0 ;;\n" +
		"  rm)   echo \"rm $2\"   >> \"$CALL_LOG\"; exit 0 ;;\n" +
		"  *)    cat \"$PROBE_FILE\"; exit 0 ;;\n" +
		"esac\n"
	if err := os.WriteFile(stubPath, []byte(stubContent), 0o755); err != nil {
		t.Fatalf("write claude stub: %v", err)
	}

	funcDef := extractPreflightFunc(t, generatedScript)

	harness := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=" + stubDir + ":$PATH\n" +
		// Change into the temp git repo so git worktree list works.
		"cd " + repoDir + "\n" +
		// bootstrap_preflight gates the bgIsolation check on CA_BACKEND=bg.
		"CA_BACKEND=bg\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		funcDef + "\n" +
		"bootstrap_preflight\n"
	return harness
}

// runPreflightHarness writes harness to a temp file and executes it with bash.
// Returns combined output and the error (non-nil => non-zero exit).
func runPreflightHarness(t *testing.T, harness string) (string, error) {
	t.Helper()
	dir := t.TempDir()
	harnessPath := filepath.Join(dir, "harness.sh")
	if err := os.WriteFile(harnessPath, []byte(harness), 0o755); err != nil {
		t.Fatalf("write harness: %v", err)
	}
	out, err := exec.Command("bash", harnessPath).CombinedOutput()
	return string(out), err
}

// TestLoopCmd_PreflightExitsNonZeroOnDisclaimerRefusal tests S6 REFUSED path:
// when claude --bg emits the disclaimer-refusal string (no session id), preflight
// exits non-zero with remediation. Decision driven by absence of session id, not
// the brittle English string.
func TestLoopCmd_PreflightExitsNonZeroOnDisclaimerRefusal(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	script := generateLoopScriptViaCmd(t)
	callLog := filepath.Join(t.TempDir(), "claude_calls.txt")
	refusalOutput := "--bg with bypassPermissions requires accepting the disclaimer first. Run `claude --dangerously-skip-permissions` once interactively."
	harness := buildPreflightHarness(t, script, refusalOutput, callLog)

	out, err := runPreflightHarness(t, harness)
	if err == nil {
		t.Errorf("expected preflight to exit non-zero on disclaimer refusal, but it succeeded; output:\n%s", out)
	}
	if !strings.Contains(out, "dangerously-skip-permissions") {
		t.Errorf("preflight output must mention 'dangerously-skip-permissions' as remediation; got:\n%s", out)
	}
	// On refused path, stop/rm must NOT be invoked (nothing to clean up).
	if data, _ := os.ReadFile(callLog); len(data) > 0 {
		t.Errorf("preflight must not invoke claude stop/rm on refused path; got calls:\n%s", string(data))
	}
}

// TestLoopCmd_PreflightExitsNonZeroOnEmptyOutput tests that empty output (or any output
// without a valid session id) is also treated as not-accepted and exits non-zero.
func TestLoopCmd_PreflightExitsNonZeroOnEmptyOutput(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	script := generateLoopScriptViaCmd(t)
	callLog := filepath.Join(t.TempDir(), "claude_calls.txt")
	harness := buildPreflightHarness(t, script, "", callLog)

	out, err := runPreflightHarness(t, harness)
	if err == nil {
		t.Errorf("expected preflight to exit non-zero on empty output (no session id), but it succeeded; output:\n%s", out)
	}
	if !strings.Contains(out, "dangerously-skip-permissions") {
		t.Errorf("preflight must mention remediation even on empty output; got:\n%s", out)
	}
}

// TestLoopCmd_PreflightPassesWhenDisclaimerAccepted tests the S6 ACCEPTED path:
// when claude --bg emits "backgrounded · <id>", preflight parses the session id,
// tears down the probe (stop + rm), and returns 0.
func TestLoopCmd_PreflightPassesWhenDisclaimerAccepted(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	script := generateLoopScriptViaCmd(t)
	callLog := filepath.Join(t.TempDir(), "claude_calls.txt")
	// Stub emits the canonical "backgrounded · <id>" line.
	harness := buildPreflightHarness(t, script, "backgrounded · deadbeef", callLog)

	out, err := runPreflightHarness(t, harness)
	if err != nil {
		t.Errorf("expected preflight to pass when disclaimer is accepted; exit: %v; output:\n%s", err, out)
	}

	// Verify stop and rm were invoked for the probe session (no leak).
	callData, _ := os.ReadFile(callLog)
	calls := string(callData)
	if !strings.Contains(calls, "stop deadbeef") {
		t.Errorf("preflight must invoke 'claude stop deadbeef' on accepted path to clean up probe; calls:\n%s", calls)
	}
	if !strings.Contains(calls, "rm deadbeef") {
		t.Errorf("preflight must invoke 'claude rm deadbeef' on accepted path to clean up probe; calls:\n%s", calls)
	}
}

// TestLoopCmd_PreflightNoOrphanProbeSessionOnAccepted explicitly asserts the
// no-orphan invariant (T3/T4): on the accepted path, the probe session must
// be stopped and removed so no session is left dangling.
func TestLoopCmd_PreflightNoOrphanProbeSessionOnAccepted(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}

	script := generateLoopScriptViaCmd(t)
	callLog := filepath.Join(t.TempDir(), "claude_calls.txt")
	harness := buildPreflightHarness(t, script, "backgrounded · a1b2c3d4", callLog)

	_, err := runPreflightHarness(t, harness)
	if err != nil {
		t.Fatalf("preflight must pass on accepted path (prerequisite for no-orphan check); err: %v", err)
	}

	callData, _ := os.ReadFile(callLog)
	calls := string(callData)
	// Both stop and rm must be present — no orphan session leaked.
	if !strings.Contains(calls, "stop a1b2c3d4") || !strings.Contains(calls, "rm a1b2c3d4") {
		t.Errorf("no-orphan invariant violated: probe session a1b2c3d4 was not fully torn down; calls:\n%s", calls)
	}
}

// TestLoopCmd_PreflightDoesNotEnterLoopOnRefusal verifies call-site ordering (S6):
// bootstrap_preflight is called BEFORE the while-true main loop.
func TestLoopCmd_PreflightDoesNotEnterLoopOnRefusal(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	preflightCall := "bootstrap_preflight"
	whileLoop := "while true"
	pIdx := strings.Index(script, preflightCall)
	wIdx := strings.Index(script, whileLoop)
	if pIdx < 0 {
		t.Fatal("bootstrap_preflight call not found in generated script")
	}
	if wIdx < 0 {
		t.Fatal("while true loop not found in generated script")
	}
	if pIdx > wIdx {
		t.Error("bootstrap_preflight call must appear BEFORE the while true loop body")
	}
}

// --- Bash syntax check for all 4 generated variants ---

func TestLoopCmd_BashSyntax_DefaultBg(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-bg-default.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on default-bg loop script: %v\n%s", err, string(out))
	}
}

func TestLoopCmd_BashSyntax_ExplicitBg(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-bg-explicit.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	_, err := executeCommand(root, "loop", "-o", outPath, "--backend", "bg")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on explicit-bg loop script: %v\n%s", err, string(out))
	}
}

func TestLoopCmd_BashSyntax_ExplicitP(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-p.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	_, err := executeCommand(root, "loop", "-o", outPath, "--backend", "p")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on explicit-p loop script: %v\n%s", err, string(out))
	}
}

func TestPolishCmd_BashSyntax_DefaultBg(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-bg-default.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())
	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/spec.md", "--meta-epic", "test-123")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on default-bg polish script: %v\n%s", err, string(out))
	}
}

func TestPolishCmd_BashSyntax_ExplicitP(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-p.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())
	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/spec.md", "--meta-epic", "test-123",
		"--backend", "p")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on explicit-p polish script: %v\n%s", err, string(out))
	}
}

// --- Preflight remediation text is accurate ---

func TestLoopCmd_PreflightRemediationText(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	// Preflight must emit a remediation message pointing users to run the tool interactively
	if !strings.Contains(script, "claude --dangerously-skip-permissions") {
		t.Error("preflight must mention 'claude --dangerously-skip-permissions' in remediation")
	}
	// Must instruct the user to run it interactively
	if !strings.Contains(script, "interactively") {
		t.Error("preflight remediation must tell user to run claude interactively")
	}
}

// --- bootstrap_preflight is called before the while loop in the pre-loop section ---

func TestLoopCmd_PreflightCalledBeforeMainLoop(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t)
	// The call site "bootstrap_preflight" (not the definition) must exist.
	// The function def starts with "bootstrap_preflight() {", the call is just "bootstrap_preflight".
	// Count occurrences: the definition plus the call site.
	count := strings.Count(script, "bootstrap_preflight")
	if count < 2 {
		t.Errorf("expected at least 2 occurrences of 'bootstrap_preflight' in script (definition + call), got %d", count)
	}
}

// --- Polish inner-loop propagates CA_BACKEND (R-FRAMEWORK) ---

func TestPolishCmd_InnerLoopPropagatesBackend(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t)
	// The inner loop invocation must propagate CA_BACKEND
	if !strings.Contains(script, "CA_BACKEND") {
		t.Error("polish script must reference CA_BACKEND for inner-loop propagation")
	}
	// Must propagate to the bash call
	if !strings.Contains(script, `bash "$inner_script"`) {
		t.Error("polish script must invoke inner loop with bash")
	}
}

// TestPolishCmd_PBackend_InnerLoopUsesP verifies that --backend p propagates p to the inner loop.
func TestPolishCmd_PBackend_InnerLoopUsesP(t *testing.T) {
	t.Parallel()
	script := generatePolishScriptViaCmd(t, "--backend", "p")
	// With --backend p, the CA_BACKEND emitted must be p, which the inner loop reads
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("--backend p polish script must emit CA_BACKEND=p so inner loop uses p backend")
	}
}
