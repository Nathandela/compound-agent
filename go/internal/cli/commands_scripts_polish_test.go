package cli

import (
	"os"
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

	// The model name with [1m] must be properly quoted to prevent glob expansion
	if !strings.Contains(script, `--model "$model_name"`) {
		t.Error("reviewer model name must be quoted to prevent glob expansion on [1m]")
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
