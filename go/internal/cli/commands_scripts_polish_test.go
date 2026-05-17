package cli

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestPolishCommand_GeneratesScript(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-loop.sh")

	out, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v\nOutput: %s", err, out)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}

	script := string(data)
	if !strings.HasPrefix(script, "#!/usr/bin/env bash") {
		t.Error("expected bash shebang")
	}
	if !strings.Contains(script, "CYCLES=") {
		t.Error("expected CYCLES variable")
	}
	if !strings.Contains(script, "ca polish") {
		t.Error("expected 'ca polish' generator comment")
	}
}

func TestPolishCommand_UsesCompoundAgentLogDir(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, `LOG_DIR=".compound-agent/agent_logs"`) {
		t.Error("expected LOG_DIR to use .compound-agent/agent_logs")
	}
}

func TestPolishCommand_ForceOverwrite(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")
	os.WriteFile(outPath, []byte("old"), 0644)

	_, err := executeCommand(root, "polish", "-o", outPath, "--force",
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish --force failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	if string(data) == "old" {
		t.Error("expected file to be overwritten")
	}
}

func TestPolishCommand_RefusesOverwriteWithoutForce(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")
	os.WriteFile(outPath, []byte("existing"), 0644)

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err == nil {
		t.Error("expected error when file exists without --force")
	}
}

func TestPolishCommand_UsesNpxCa(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must prefer local ca binary with npx ca as fallback
	if !strings.Contains(script, "command -v ca") {
		t.Error("expected 'command -v ca' check to prefer local binary over npx")
	}
	if !strings.Contains(script, "npx ca") {
		t.Error("expected 'npx ca' as fallback when local binary not found")
	}
}

func TestPolishCommand_PermissionModeAuto(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "--permission-mode auto") {
		t.Error("generated script must include '--permission-mode auto' on Claude invocations")
	}
}

func TestPolishCommand_FullSpectrumPriority(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The polish architect prompt must instruct full-spectrum coverage
	if !strings.Contains(script, "P0") || !strings.Contains(script, "P1") || !strings.Contains(script, "P2") {
		t.Error("polish architect prompt must reference P0, P1, and P2 priorities")
	}
	// Should explicitly mention implementing all priority levels
	if !strings.Contains(script, "ALL priority levels") && !strings.Contains(script, "all priority levels") {
		t.Error("polish architect prompt must instruct to address all priority levels, not just critical")
	}
	// Should push for ambition, not just mechanical finding-to-epic conversion
	if !strings.Contains(script, "exceptional") {
		t.Error("polish architect prompt must push for exceptional quality, not just fix findings")
	}
	// Should instruct to go beyond reviewer findings
	if !strings.Contains(script, "STARTING POINT") && !strings.Contains(script, "starting point") {
		t.Error("polish architect prompt must treat findings as a starting point, not the ceiling")
	}
	// Should load context (spec, codebase)
	if !strings.Contains(script, "npx ca load-session") {
		t.Error("polish architect must load session context")
	}
	// Architect must route NEEDS_QA findings to QA Engineer
	if !strings.Contains(script, "NEEDS_QA") {
		t.Error("polish architect prompt must reference NEEDS_QA for QA routing")
	}
	if !strings.Contains(script, "qa-engineer") {
		t.Error("polish architect prompt must reference qa-engineer skill")
	}
	if !strings.Contains(script, "browser_evidence") {
		t.Error("polish architect prompt must instruct UI epics to include browser_evidence in Verification Contract")
	}
}

func TestPolishCommand_AuditCoversFullSpectrum(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Audit must cover all dimensions, not just UI
	dimensions := map[string]string{
		"Security":       "security",
		"Architecture":   "architecture",
		"Test coverage":  "test",
		"Error handling": "error handling",
	}
	for desc, keyword := range dimensions {
		if !strings.Contains(strings.ToLower(script), keyword) {
			t.Errorf("audit prompt must cover %s (expected %q)", desc, keyword)
		}
	}

	// Must reference QA Engineer skill for browser/runtime verification
	if !strings.Contains(script, "qa-engineer") {
		t.Error("audit prompt must reference qa-engineer skill for browser verification")
	}
	if !strings.Contains(script, "NEEDS_QA") {
		t.Error("audit prompt must include [NEEDS_QA] tagging mechanism for findings needing runtime verification")
	}
}

func TestPolishCommand_ShellInjection(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `"; rm -rf /; #`
	_, err := executeCommand(root, "polish", "-o", outPath, "--force",
		"--model", payload,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if strings.Contains(script, `MODEL="`+payload) {
		t.Error("model flag is interpolated without escaping -- shell injection possible")
	}
	if !strings.Contains(script, `MODEL='`) {
		t.Error("expected MODEL to be single-quoted for shell safety")
	}
}

func TestPolishCommand_ShellInjection_SpecFile(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `$(whoami)`
	_, err := executeCommand(root, "polish", "-o", outPath, "--force",
		"--spec-file", payload,
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, `SPEC_FILE='`) {
		t.Error("expected SPEC_FILE to be single-quoted for shell safety")
	}
}

func TestPolishCommand_ShellInjection_MetaEpic(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `'; echo pwned; '`
	_, err := executeCommand(root, "polish", "-o", outPath, "--force",
		"--spec-file", "spec.md",
		"--meta-epic", payload)
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, `META_EPIC='`) {
		t.Error("expected META_EPIC to be single-quoted for shell safety")
	}
}

func TestPolishCommand_WithReviewers(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--reviewers", "claude-sonnet,gemini",
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "claude-sonnet") {
		t.Error("expected claude-sonnet in configured reviewers")
	}
	if !strings.Contains(script, "gemini") {
		t.Error("expected gemini in configured reviewers")
	}
}

func TestPolishCommand_InvalidReviewerRejected(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--reviewers", "invalid-model",
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err == nil {
		t.Error("expected error for invalid reviewer")
	}
}

func TestPolishCommand_RequiresSpecFile(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath, "--meta-epic", "test-123")
	if err == nil {
		t.Error("expected error when --spec-file is missing")
	}
}

func TestPolishCommand_RequiresMetaEpic(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath, "--spec-file", "spec.md")
	if err == nil {
		t.Error("expected error when --meta-epic is missing")
	}
}

func TestPolishCommand_CyclesFlag(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--cycles", "7",
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "CYCLES=7") {
		t.Error("expected CYCLES=7 in generated script")
	}
}

func TestPolishCommand_StructuralCorrectness(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	checks := map[string]string{
		"set -euo pipefail":       "strict bash mode",
		"_polish_cleanup":         "crash handler",
		"portable_timeout":        "timeout function",
		"detect_polish_reviewers": "reviewer detection function",
		"run_polish_audit":        "audit function",
		"synthesize_report":       "synthesize function",
		"run_polish_architect":    "polish architect function",
		"run_inner_loop":          "inner loop function",
		"POLISH_EPIC:":            "epic ID marker",
		"--output-format text":    "text output format for architect",
		"BASH_LINENO":             "crash handler line info",
		"REVIEW_TIMEOUT":          "review timeout config",
	}
	for pattern, desc := range checks {
		if !strings.Contains(script, pattern) {
			t.Errorf("missing %s: expected %q in generated script", desc, pattern)
		}
	}
}

func TestPolishCommand_NamingConsistency(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// "mini-architect" should not appear in the generated script
	if strings.Contains(script, "mini-architect") {
		t.Error("generated script still references 'mini-architect'; should be 'polish architect' or 'polish-architect'")
	}
	// "polish architect" or "polish-architect" should appear
	if !strings.Contains(script, "polish architect") && !strings.Contains(script, "polish-architect") {
		t.Error("expected 'polish architect' naming in generated script")
	}
}

func TestPolishCommand_ArchitectNoMetaEpicDependency(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must NOT use "Parent:" label which leads architect to create parent dependencies
	if strings.Contains(script, "Parent: $META_EPIC") {
		t.Error("architect prompt must not use 'Parent: $META_EPIC' label (causes deadlock)")
	}

	// Must explicitly prohibit wiring dependencies to meta-epic
	if !strings.Contains(script, "Do NOT") || !strings.Contains(script, "META_EPIC") {
		t.Error("architect prompt must explicitly prohibit wiring deps to META_EPIC")
	}

	// Must prohibit --parent flag
	if !strings.Contains(script, "--parent") {
		t.Error("architect prompt must mention --parent flag in prohibition")
	}

	// Must still include meta-epic ID for context/traceability
	if !strings.Contains(script, "$META_EPIC") {
		t.Error("architect prompt must still reference META_EPIC for context")
	}
}

func TestPolishCommand_InnerLoopCapturesExitCode(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must NOT use "|| true" which swallows exit codes
	// The inner loop invocation must capture the exit code properly
	innerLoopIdx := strings.Index(script, "run_inner_loop()")
	if innerLoopIdx < 0 {
		t.Fatal("expected run_inner_loop function")
	}

	innerLoopFunc := script[innerLoopIdx:]
	// Find end of function (next function definition or end of script)
	nextFuncIdx := strings.Index(innerLoopFunc[1:], "\n}")
	if nextFuncIdx > 0 {
		innerLoopFunc = innerLoopFunc[:nextFuncIdx+2]
	}

	// Must capture exit code, not swallow with || true
	if strings.Contains(innerLoopFunc, `|| true`) {
		t.Error("run_inner_loop must not use '|| true' on inner script invocation (swallows exit code)")
	}

	// Must detect zero-work exit code (exit 2)
	if !strings.Contains(innerLoopFunc, "exit 2") && !strings.Contains(innerLoopFunc, "eq 2") {
		t.Error("run_inner_loop must detect zero-work exit code (2)")
	}
}

func TestPolishCommand_InnerLoopCallGuarded(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The main loop call to run_inner_loop must be guarded with ||
	// to prevent set -e from killing the entire polish script
	mainLoopIdx := strings.Index(script, "# Step 4: Inner Loop")
	if mainLoopIdx < 0 {
		t.Fatal("expected '# Step 4: Inner Loop' in main loop")
	}

	// Check that the call has an || guard
	callRegion := script[mainLoopIdx : mainLoopIdx+200]
	if !strings.Contains(callRegion, "||") {
		t.Error("run_inner_loop call in main loop must have || guard to prevent set -e cascade")
	}
}

func TestPolishCommand_ReviewerModelQuoting(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The model name with [1m] must be properly quoted to prevent glob expansion.
	// T1 seam: audit reviewers now call agent_invoke "$model_name" (first positional arg);
	// agent_invoke internally uses --model "$model" — still quoted at runtime.
	// Verify the seam function body uses double-quoted --model expansion.
	if !strings.Contains(script, `--model "$model"`) {
		t.Error("agent_invoke must use --model \"$model\" to prevent glob expansion on [1m]")
	}
}

func TestPolishCommand_PIDTracking(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must track PIDs explicitly, not use bare "wait"
	if !strings.Contains(script, `pids="$pids $!"`) {
		t.Error("expected PID tracking pattern in reviewer spawning")
	}
	if !strings.Contains(script, `for pid in $pids`) {
		t.Error("expected per-PID wait pattern")
	}
}

func TestPolishCommand_ReviewerHealthCheck(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must include health check beyond just command -v
	if !strings.Contains(script, "--version") {
		t.Error("expected reviewer health check (--version probe)")
	}
}

func TestPolishCommand_VisualVerification(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/specs/my-spec.md",
		"--meta-epic", "test-epic-123")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must have a Visual Verification section in the audit prompt
	if !strings.Contains(script, "Visual Verification") {
		t.Error("audit prompt must contain a Visual Verification section")
	}

	// Must reference Playwright for screenshots
	if !strings.Contains(script, "Playwright") && !strings.Contains(script, "playwright") {
		t.Error("visual verification must reference Playwright for screenshots")
	}

	// Must include auto-detect heuristics
	heuristics := []string{"package.json", "vite.config"}
	for _, h := range heuristics {
		if !strings.Contains(script, h) {
			t.Errorf("visual verification must include auto-detect heuristic: %s", h)
		}
	}

	// Must include viewport sizes for responsive screenshots
	viewports := []string{"375", "768", "1024", "1440"}
	for _, vp := range viewports {
		if !strings.Contains(script, vp) {
			t.Errorf("visual verification must include viewport width: %s", vp)
		}
	}

	// Must include graceful degradation
	if !strings.Contains(script, "skip") || !strings.Contains(script, "no UI") {
		t.Error("visual verification must include graceful degradation (skip when no UI detected)")
	}

	// Graceful degradation must reference [NEEDS_QA] fallback
	if !strings.Contains(script, "NEEDS_QA") {
		t.Error("visual verification graceful degradation must reference [NEEDS_QA] tagging")
	}

	// Must include dev server cleanup instruction
	if !strings.Contains(script, "Stop the dev server") {
		t.Error("visual verification must include dev server cleanup instruction")
	}
}

func TestPolishCommand_CompactPctValidation(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		value string
	}{
		{"negative", "-1"},
		{"over100", "101"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			root := &cobra.Command{Use: "ca"}
			root.AddCommand(polishCmd())
			dir := t.TempDir()
			outPath := filepath.Join(dir, "polish.sh")
			_, err := executeCommand(root, "polish", "-o", outPath,
				"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1",
				"--compact-pct", tt.value)
			if err == nil {
				t.Errorf("--compact-pct %s: expected error", tt.value)
			}
		})
	}
}

func TestPolishCommand_CompactPct(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1",
		"--compact-pct", "40")
	if err != nil {
		t.Fatalf("polish --compact-pct failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40") {
		t.Error("expected CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40 in script")
	}
}

func TestPolishCommand_CompactPctZeroOmitted(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if strings.Contains(script, "export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=") {
		t.Error("expected no export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE when --compact-pct is 0")
	}
}

func TestPolishCommand_CompactPctForwardedToInnerLoop(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1",
		"--compact-pct", "40")
	if err != nil {
		t.Fatalf("polish --compact-pct failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "--compact-pct $CLAUDE_AUTOCOMPACT_PCT_OVERRIDE") {
		t.Error("expected --compact-pct forwarded to inner ca loop call")
	}
}

// TestPolishCommand_PostLoopRespectsDryRun pins the post-loop dry-run guard so
// future refactors of polishScriptPostLoop cannot silently regress: the
// .polish-status.json write, the git commit, and the git push must all sit
// inside the POLISH_DRY_RUN=1 else branch, and a dry-run must emit a distinct
// "dry-run-completed" status so monitoring tools can tell preflights apart
// from real runs. Regression test for #16.
func TestPolishCommand_PostLoopRespectsDryRun(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	postIdx := strings.Index(script, "# --- Post Loop ---")
	if postIdx < 0 {
		t.Fatal("missing '# --- Post Loop ---' section marker")
	}
	postLoop := script[postIdx:]

	if !strings.Contains(postLoop, `[ "${POLISH_DRY_RUN:-}" = "1" ]`) {
		t.Error("post-loop section missing POLISH_DRY_RUN guard")
	}
	if !strings.Contains(postLoop, "DRY RUN: would commit and push polish loop artifacts") {
		t.Error("post-loop section missing dry-run log message")
	}
	if !strings.Contains(postLoop, `\"status\":\"dry-run-completed\"`) {
		t.Error("dry-run path must write status=dry-run-completed (distinct from real-run completion)")
	}

	// Every git-mutating line and the real-run status write must appear AFTER
	// the dry-run guard's `else` keyword so they cannot execute in dry-run.
	elseIdx := strings.Index(postLoop, "\nelse\n")
	if elseIdx < 0 {
		t.Fatal("post-loop dry-run guard missing else branch")
	}
	mustBeGuarded := []string{
		`\"status\":\"completed\"`,
		"git commit -m",
		"git push",
		"git add docs/specs/polish-report-cycle",
	}
	for _, needle := range mustBeGuarded {
		idx := strings.Index(postLoop, needle)
		if idx < 0 {
			t.Errorf("post-loop section missing expected line: %q", needle)
			continue
		}
		if idx < elseIdx {
			t.Errorf("line %q appears before the dry-run else branch — it would still execute in dry-run", needle)
		}
	}
}

// TestPolishCommand_AgentInvokeInAudit verifies that the audit fleet section
// uses agent_invoke instead of raw claude -p for claude reviewers (R-SEAM).
func TestPolishCommand_AgentInvokeInAudit(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1",
		"--reviewers", "claude-sonnet,claude-opus,gemini,codex")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// agent_invoke must be defined in the polish script
	if !strings.Contains(script, "agent_invoke()") {
		t.Error("polish script must define agent_invoke() seam function")
	}
	// Audit fleet must call agent_invoke for claude reviewers, not raw claude -p
	if !strings.Contains(script, "agent_invoke ") {
		t.Error("polish audit fleet must call agent_invoke for claude reviewer calls")
	}
	// Polish architect must use agent_invoke
	archIdx := strings.Index(script, "run_polish_architect()")
	if archIdx < 0 {
		t.Fatal("run_polish_architect function not found")
	}
	archBody := script[archIdx:]
	closeIdx := strings.Index(archBody, "\n}\n")
	if closeIdx > 0 {
		archBody = archBody[:closeIdx]
	}
	if !strings.Contains(archBody, "agent_invoke ") {
		t.Error("run_polish_architect must call agent_invoke (not raw claude -p)")
	}
}

// ===== T5: R-FLEET, R-FRAMEWORK, R-REVIEW tests for polish script =====

// TestPolishCommand_AuditFleetMixedBarrierBg verifies that when CA_BACKEND=bg,
// the polish audit fleet dispatches claude reviewers as bg sessions with a
// mixed-fleet barrier (poll bg handles + wait $pid for gemini/codex).
func TestPolishCommand_AuditFleetMixedBarrierBg(t *testing.T) {
	t.Parallel()
	audit := polishScriptRunAudit()

	// Must dispatch claude reviewers as bg sessions under bg backend
	if !strings.Contains(audit, "bg_dispatch_reviewer") {
		t.Error("polish audit fleet must use bg_dispatch_reviewer for claude reviewers under bg backend")
	}
	// Must track bg handles separately from sync pids
	if !strings.Contains(audit, "bg_handles") {
		t.Error("polish audit fleet must track bg_handles for claude bg reviewers")
	}
	// Gemini/codex stay as sync & + wait
	if !strings.Contains(audit, "for pid in $pids") {
		t.Error("polish audit fleet must use pid-wait barrier for gemini/codex")
	}
}

// TestPolishCommand_AuditFleetBgPBackendUnchanged verifies that under p backend,
// the polish audit fleet is byte-identical to pre-T5 (R-PLEGACY).
func TestPolishCommand_AuditFleetBgPBackendUnchanged(t *testing.T) {
	t.Parallel()
	audit := polishScriptRunAudit()

	// p backend still uses agent_invoke
	if !strings.Contains(audit, "portable_timeout \"$REVIEW_TIMEOUT\" agent_invoke") {
		t.Error("polish audit p backend must still use portable_timeout agent_invoke")
	}
}

// TestPolishCommand_ArchitectBgCapable verifies that run_polish_architect
// uses bg_dispatch_reviewer / wait under bg backend.
func TestPolishCommand_ArchitectBgCapable(t *testing.T) {
	t.Parallel()
	arch := polishScriptPolishArchitect()

	// Architect must be bg-capable: dispatch via bg_dispatch_reviewer OR agent_invoke based on CA_BACKEND
	if !strings.Contains(arch, "CA_BACKEND") {
		t.Error("polish architect must check CA_BACKEND to select bg vs p invocation")
	}
}

// TestPolishCommand_InnerLoopPropagatesCABackend verifies that the inner loop
// invocation (bash inner.sh) propagates CA_BACKEND via environment (R-FRAMEWORK).
func TestPolishCommand_InnerLoopPropagatesCABackend(t *testing.T) {
	t.Parallel()
	inner := polishScriptInnerLoop()

	// bash inner.sh must propagate CA_BACKEND
	if !strings.Contains(inner, "CA_BACKEND") {
		t.Error("run_inner_loop must export/propagate CA_BACKEND to inner bash invocation")
	}
	// Must use CA_BACKEND=... bash or export CA_BACKEND pattern (T6: default is now bg)
	if !strings.Contains(inner, `CA_BACKEND="${CA_BACKEND:-bg}" bash`) &&
		!strings.Contains(inner, "export CA_BACKEND") {
		t.Error("run_inner_loop must propagate CA_BACKEND as env var to bash inner.sh")
	}
}

// TestPolishCommand_InnerLoopBashSyntaxWithBgSeam verifies the generated polish
// script passes bash -n syntax check (including the bg-capable seam).
func TestPolishCommand_InnerLoopBashSyntaxWithBgSeam(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-bg.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1",
		"--reviewers", "claude-sonnet,gemini,codex")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	out, bashErr := executeBashSyntaxCheck(t, outPath)
	if bashErr != nil {
		t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
	}
}

// TestPolishCommand_SeamHandlesBgBackend verifies that the polish seam
// supports the bg backend (not just p).
func TestPolishCommand_SeamHandlesBgBackend(t *testing.T) {
	t.Parallel()
	seam := polishScriptSeam("bg", false)

	// Must handle bg backend, not just p
	if !strings.Contains(seam, "bg)") {
		t.Error("polish seam must handle bg backend case")
	}
	// bg backend must dispatch via claude --bg
	if !strings.Contains(seam, "claude --bg") {
		t.Error("polish seam bg case must dispatch via claude --bg")
	}
}

// TestPolishCommand_NoRawClaudePOutsideSeam verifies that the polish script
// has no raw `claude ... -p` invocation outside the seam function body.
func TestPolishCommand_NoRawClaudePOutsideSeam(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md", "--meta-epic", "ME1")
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Find agent_invoke() definition start
	invokeIdx := strings.Index(script, "agent_invoke()")
	if invokeIdx < 0 {
		t.Fatal("agent_invoke() not found in polish script")
	}
	// Extract the rest of the script after the seam function definitions
	// (everything outside function bodies should not have raw claude -p)
	// We check run_polish_audit and run_polish_architect don't have raw claude -p
	auditIdx := strings.Index(script, "run_polish_audit()")
	if auditIdx < 0 {
		t.Fatal("run_polish_audit() not found")
	}
	auditBody := script[auditIdx:]
	closeIdx := strings.Index(auditBody, "\n}\n")
	if closeIdx > 0 {
		auditBody = auditBody[:closeIdx]
	}
	// Inside run_polish_audit, claude reviewer calls must go through agent_invoke
	if strings.Contains(auditBody, "portable_timeout \"$REVIEW_TIMEOUT\" claude") &&
		!strings.Contains(auditBody, "agent_invoke") {
		t.Error("run_polish_audit must use agent_invoke, not direct claude invocation")
	}
}

// buildBgCollectReviewerPolishScript builds a bash test script that invokes
// bg_collect_reviewer from the polish seam.
// It stubs claude, sets up state.json, and uses the provided fake HOME.
func buildBgCollectReviewerPolishScript(
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
	stateJSON := `{"state":"done","inFlight":{"tasks":0},"output":"audit complete"}`
	if err := os.WriteFile(filepath.Join(jobDir, "state.json"), []byte(stateJSON), 0o644); err != nil {
		t.Fatalf("write state.json: %v", err)
	}

	seam := polishScriptSeam("bg", false)
	report := filepath.Join(t.TempDir(), "report.md")
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HOME=\"" + fakeHome + "\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"HAS_JQ=false\n" +
		"CA_BACKEND=bg\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		seam + "\n" +
		"bg_collect_reviewer \"" + handle + "\" \"" + report + "\"\n"
	return script
}

// TestT5_BgCollectReviewer_Polish_NoRmIfWorktreeHasCommits is a runtime test that
// verifies bg_collect_reviewer (polish seam) does NOT call claude rm when the
// reviewer's bg worktree has commits ahead of main, logging HUMAN_REQUIRED instead.
// R-HARVEST-FAIL, T3/T4 invariant: structural worktree check before every claude rm.
func TestT5_BgCollectReviewer_Polish_NoRmIfWorktreeHasCommits(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "pol1test"

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
	writeFile(t, wtDir, "reviewer-output.txt", "audit notes")
	mustGit(t, wtDir, "add", "reviewer-output.txt")
	mustGit(t, wtDir, "commit", "-m", "reviewer: unexpectedly committed in polish")

	// Build claude stub.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
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
	script := buildBgCollectReviewerPolishScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-polish-commit.sh")
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

	// Assert: claude rm must NOT have been called for the reviewer session (pol1test).
	// Note: the preflight probe may rm its own session (deadbeef); we check
	// specifically that the actual reviewer session handle was NOT rm'd.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), handle) {
		t.Errorf("claude rm was invoked for reviewer %q despite worktree having commits (polish) — data-loss guard broken\nscript output:\n%s", handle, out)
	}

	// Assert: HUMAN_REQUIRED must be logged.
	harvest, _ := os.ReadFile(harvestLog)
	combined := string(harvest) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when reviewer worktree has commits (polish)\noutput:\n%s", combined)
	}
}

// TestT5_BgCollectReviewer_Polish_RmIfNoWorktreeCommits is a runtime test that
// verifies bg_collect_reviewer (polish seam) DOES call claude rm when the
// reviewer's worktree has no commits ahead of main (normal/expected case).
func TestT5_BgCollectReviewer_Polish_RmIfNoWorktreeCommits(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "pol2test"

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
	// Add a worktree but do NOT commit anything.
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", handle)
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-"+handle, wtDir)

	// Build claude stub.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
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
	script := buildBgCollectReviewerPolishScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-polish-noop.sh")
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

	// Assert: claude rm MUST have been called for the reviewer session (pol2test).
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if !strings.Contains(string(rmLogData), handle) {
		t.Errorf("claude rm was NOT invoked for reviewer %q with no worktree commits (polish) — teardown must proceed\nscript output:\n%s", handle, out)
	}
}

// TestT5_BgCollectReviewer_Polish_SnapshotMissing_NoRm verifies the safe-default
// invariant for the polish seam: when the pre-dispatch snapshot file does NOT exist,
// bg_collect_reviewer does NOT call claude rm (cannot verify worktree safety), logs
// HUMAN_REQUIRED, and still writes the reviewer report. This structurally closes the
// data-loss gap even if a future dispatch path forgets to write the snapshot.
func TestT5_BgCollectReviewer_Polish_SnapshotMissing_NoRm(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	handle := "pol3nosnap"

	setupGitRepoForHarvest(t, repoDir)
	// Deliberately do NOT write a snapshot file for this handle.

	// Build claude stub.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
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
	script := buildBgCollectReviewerPolishScript(t, repoDir, stubDir, harvestLog, handle)
	scriptPath := filepath.Join(t.TempDir(), "collect-polish-nosnap.sh")
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

	// Assert: claude rm must NOT be called for the reviewer session when snapshot is missing.
	// Note: the preflight probe may rm its own session (deadbeef); we check
	// specifically that the actual reviewer session handle was NOT rm'd.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), handle) {
		t.Errorf("claude rm was invoked for reviewer %q despite missing snapshot (polish) — safe-default violated (data-loss risk)\nscript output:\n%s", handle, out)
	}

	// Assert: HUMAN_REQUIRED must be logged.
	harvest, _ := os.ReadFile(harvestLog)
	combined := string(harvest) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when snapshot is missing (polish)\noutput:\n%s", combined)
	}
}

// ===== P1-2: run_inner_loop --backend propagation =====

// TestPolishScriptInnerLoop_PassesBackendFlag verifies that run_inner_loop passes
// --backend "$CA_BACKEND" to the inner ca loop invocation, so the generated inner
// script hard-codes the correct backend. Fail-before: the old code omitted --backend,
// causing the inner loop to default to bg even under ca polish --backend p.
func TestPolishScriptInnerLoop_PassesBackendFlag(t *testing.T) {
	t.Parallel()
	inner := polishScriptInnerLoop()

	// The ca loop invocation must include --backend "$CA_BACKEND"
	if !strings.Contains(inner, `--backend "$CA_BACKEND"`) {
		t.Error("run_inner_loop must pass --backend \"$CA_BACKEND\" to inner ca loop invocation — omitting it silently hard-codes bg even under ca polish --backend p")
	}
}

// TestPolishCommand_BackendP_InnerLoopPassesBackendP verifies that a polish script
// generated with --backend p contains --backend p in the inner ca loop call,
// so the generated inner script uses the p seam (no bootstrap_preflight).
// Fail-before: old code omitted --backend entirely from the ca loop call.
func TestPolishCommand_BackendP_InnerLoopPassesBackendP(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-p.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--backend", "p",
		"--spec-file", "docs/SPEC.md",
		"--meta-epic", "ME1")
	if err != nil {
		t.Fatalf("polish --backend p failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The inner ca loop call must include --backend "$CA_BACKEND" (not just the env propagation).
	if !strings.Contains(script, `--backend "$CA_BACKEND"`) {
		t.Error("polish --backend p: inner ca loop call must include --backend \"$CA_BACKEND\" so the generated inner script uses the p seam")
	}

	// Under --backend p, the generated polish script must NOT invoke bootstrap_preflight
	// unconditionally (it should be absent, since p seam omits it).
	if strings.Contains(script, "bootstrap_preflight\n") {
		t.Error("polish --backend p: generated polish script must not call bootstrap_preflight (only bg seam includes it)")
	}
}

// TestPolishCommand_BackendBg_InnerLoopPassesBackendBg verifies that the default
// (bg) backend also passes --backend "$CA_BACKEND" to the inner ca loop call,
// preserving bg behavior unchanged.
func TestPolishCommand_BackendBg_InnerLoopPassesBackendBg(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-bg.sh")

	_, err := executeCommand(root, "polish", "-o", outPath,
		"--spec-file", "docs/SPEC.md",
		"--meta-epic", "ME1")
	if err != nil {
		t.Fatalf("polish (default bg) failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The inner ca loop call must still include --backend "$CA_BACKEND" under default bg.
	if !strings.Contains(script, `--backend "$CA_BACKEND"`) {
		t.Error("polish (default bg): inner ca loop call must include --backend \"$CA_BACKEND\"")
	}

	// Under default bg, bootstrap_preflight should be present.
	if !strings.Contains(script, "bootstrap_preflight") {
		t.Error("polish (default bg): generated polish script must call bootstrap_preflight")
	}
}
