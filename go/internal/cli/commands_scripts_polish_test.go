package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestPolishCommand_GeneratesScript(t *testing.T) {
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

func TestPolishCommand_ForceOverwrite(t *testing.T) {
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

	// Must use "npx ca" for compound-agent calls, never bare "ca loop" or "command -v ca"
	if strings.Contains(script, "command -v ca") {
		t.Error("generated script must not check 'command -v ca' (bare ca); use 'npx ca' instead")
	}
	if !strings.Contains(script, "npx ca loop") {
		t.Error("expected 'npx ca loop' for inner loop generation")
	}
}

func TestPolishCommand_PermissionModeAuto(t *testing.T) {
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
		"Security":      "security",
		"Architecture":  "architecture",
		"Test coverage": "test",
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
		"set -euo pipefail":         "strict bash mode",
		"_polish_cleanup":           "crash handler",
		"portable_timeout":          "timeout function",
		"detect_polish_reviewers":   "reviewer detection function",
		"run_polish_audit":          "audit function",
		"synthesize_report":         "synthesize function",
		"run_polish_architect":      "polish architect function",
		"run_inner_loop":            "inner loop function",
		"POLISH_EPIC:":              "epic ID marker",
		"--output-format text":      "text output format for architect",
		"BASH_LINENO":               "crash handler line info",
		"REVIEW_TIMEOUT":            "review timeout config",
	}
	for pattern, desc := range checks {
		if !strings.Contains(script, pattern) {
			t.Errorf("missing %s: expected %q in generated script", desc, pattern)
		}
	}
}

func TestPolishCommand_NamingConsistency(t *testing.T) {
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

func TestPolishCommand_ReviewerModelQuoting(t *testing.T) {
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
