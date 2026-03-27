package cli

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- CLI flag tests ---

func TestPolishCommand_GeneratesScript(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish-loop.sh")

	out, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "3",
		"--meta-epic", "E1",
		"--spec", "docs/specs/foo.md",
		"--reviewers", "claude-opus",
	)
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
	if !strings.Contains(script, "CYCLES=3") {
		t.Error("expected CYCLES=3 variable")
	}
	if !strings.Contains(script, "META_EPIC=") {
		t.Error("expected META_EPIC variable")
	}
	if !strings.Contains(script, "SPEC_FILE=") {
		t.Error("expected SPEC_FILE variable")
	}
}

func TestPolishCommand_FileExistsError(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")
	os.WriteFile(outPath, []byte("old"), 0644)

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "2",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err == nil {
		t.Fatal("expected error when file exists without --force")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("expected 'already exists' error, got: %v", err)
	}
}

func TestPolishCommand_ForceOverwrite(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")
	os.WriteFile(outPath, []byte("old"), 0644)

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--force",
		"--cycles", "2",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("polish --force failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	if string(data) == "old" {
		t.Error("expected file to be overwritten")
	}
}

func TestPolishCommand_InvalidReviewer(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "invalid-reviewer",
	)
	if err == nil {
		t.Fatal("expected error for invalid reviewer")
	}
	if !strings.Contains(err.Error(), "invalid reviewer") {
		t.Errorf("expected 'invalid reviewer' error, got: %v", err)
	}
}

func TestPolishCommand_RequiresCycles(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err == nil {
		t.Fatal("expected error when --cycles not specified")
	}
	if !strings.Contains(err.Error(), "--cycles") {
		t.Errorf("expected error about --cycles, got: %v", err)
	}
}

func TestPolishCommand_RequiresMetaEpic(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "2",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err == nil {
		t.Fatal("expected error when --meta-epic not specified")
	}
	if !strings.Contains(err.Error(), "--meta-epic") {
		t.Errorf("expected error about --meta-epic, got: %v", err)
	}
}

func TestPolishCommand_RequiresSpec(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "2",
		"--meta-epic", "E1",
		"--reviewers", "claude-opus",
	)
	if err == nil {
		t.Fatal("expected error when --spec not specified")
	}
	if !strings.Contains(err.Error(), "--spec") {
		t.Errorf("expected error about --spec, got: %v", err)
	}
}

func TestPolishCommand_RequiresReviewers(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "2",
		"--meta-epic", "E1",
		"--spec", "spec.md",
	)
	if err == nil {
		t.Fatal("expected error when --reviewers not specified")
	}
	if !strings.Contains(err.Error(), "--reviewers") {
		t.Errorf("expected error about --reviewers, got: %v", err)
	}
}

// --- Shell injection tests ---

func TestPolishCommand_ShellInjection(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--force",
		"--cycles", "3",
		"--meta-epic", "$(evil)",
		"--spec", "$(evil)",
		"--model", "$(evil)",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("polish command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// All interpolated values must be single-quoted
	if strings.Contains(script, `"$(evil)"`) {
		t.Error("found double-quoted shell injection vector")
	}
	// META_EPIC, SPEC_FILE, MODEL should all be single-quoted
	if !strings.Contains(script, `META_EPIC='$(evil)'`) {
		t.Error("META_EPIC not single-quoted")
	}
	if !strings.Contains(script, `SPEC_FILE='$(evil)'`) {
		t.Error("SPEC_FILE not single-quoted")
	}
	if !strings.Contains(script, `MODEL='$(evil)'`) {
		t.Error("MODEL not single-quoted")
	}
}

// --- Script structure tests ---

func TestPolishCommand_ScriptHasExactNCycles(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "5",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "CYCLES=5") {
		t.Error("expected CYCLES=5")
	}
	if !strings.Contains(script, "for ((cycle=1; cycle<=CYCLES; cycle++))") {
		t.Error("expected fixed N-cycle for loop with no early exit")
	}
	// No early exit patterns
	if strings.Contains(script, "all_approved") {
		t.Error("script must not contain early exit logic")
	}
}

func TestPolishCommand_AuditPhaseSpawnsReviewers(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus,gemini",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Audit function must exist and be called
	if !strings.Contains(script, "run_polish_audit()") {
		t.Error("expected run_polish_audit function definition")
	}
	if !strings.Contains(script, "run_polish_audit") {
		t.Error("expected run_polish_audit to be called in main loop")
	}
	// Reviewers spawned in parallel
	if !strings.Contains(script, "wait") {
		t.Error("expected 'wait' for parallel reviewer spawning")
	}
}

func TestPolishCommand_AuditPromptContainsBGTChecklist(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// BGT checklist items must be in the audit prompt
	bgtItems := []string{
		"loading", "empty", "error",
		"hover", "focus", "disabled",
		"typography", "spacing", "geometric",
		"Core Web Vitals",
		"semantic HTML",
		"44x44px",
		"LCP",
	}
	for _, item := range bgtItems {
		if !strings.Contains(script, item) {
			t.Errorf("audit prompt missing BGT checklist item: %s", item)
		}
	}
}

func TestPolishCommand_MiniArchitectPhase(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Mini-architect function must exist
	if !strings.Contains(script, "run_mini_architect()") {
		t.Error("expected run_mini_architect function definition")
	}
	// Must use bd create for epic creation
	if !strings.Contains(script, "bd create") {
		t.Error("expected bd create in mini-architect phase")
	}
	// Must use bd dep add for dependency wiring
	if !strings.Contains(script, "bd dep add") {
		t.Error("expected bd dep add in mini-architect phase")
	}
}

func TestPolishCommand_InnerLoopPhase(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must invoke ca loop synchronously (no backgrounding)
	if !strings.Contains(script, "ca loop") {
		t.Error("expected ca loop invocation for inner loop")
	}
	// Inner loop must NOT be backgrounded
	innerLoopIdx := strings.Index(script, "ca loop")
	if innerLoopIdx > 0 {
		// Check the line containing ca loop doesn't end with &
		lineEnd := strings.Index(script[innerLoopIdx:], "\n")
		if lineEnd > 0 {
			line := script[innerLoopIdx : innerLoopIdx+lineEnd]
			if strings.HasSuffix(strings.TrimSpace(line), "&") {
				t.Error("inner ca loop must not be backgrounded")
			}
		}
	}
}

func TestPolishCommand_SynthesizeReport(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "synthesize_report()") {
		t.Error("expected synthesize_report function definition")
	}
	if !strings.Contains(script, "docs/specs/") {
		t.Error("expected docs/specs/ path for polish report output")
	}
}

func TestPolishCommand_ReviewerDetection(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus,gemini,codex",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must check reviewer CLI availability
	if !strings.Contains(script, "command -v") {
		t.Error("expected CLI availability check via command -v")
	}
	// Must handle missing reviewers gracefully
	if !strings.Contains(script, "WARN") {
		t.Error("expected WARN log for missing reviewer CLIs")
	}
}

// --- Ordering tests ---

func TestPolishCommand_PhaseOrdering(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Verify all three phase functions are defined somewhere in the script
	if !strings.Contains(script, "run_polish_audit()") {
		t.Fatal("missing run_polish_audit function definition")
	}
	if !strings.Contains(script, "run_mini_architect()") {
		t.Fatal("missing run_mini_architect function definition")
	}
	if !strings.Contains(script, "run_inner_loop()") {
		t.Fatal("missing run_inner_loop function definition")
	}

	// In the main loop body, audit must come before architect, architect before inner loop
	// Find the call sites within the for loop body (not function definitions)
	forLoopIdx := strings.Index(script, "for ((cycle=1")
	if forLoopIdx < 0 {
		t.Fatal("missing for loop")
	}

	loopBody := script[forLoopIdx:]
	auditCall := strings.Index(loopBody, "run_polish_audit")
	architectCall := strings.Index(loopBody, "run_mini_architect")
	innerCall := strings.Index(loopBody, "run_inner_loop")

	if auditCall < 0 || architectCall < 0 || innerCall < 0 {
		t.Fatal("missing one or more phase calls in loop body")
	}
	if auditCall > architectCall {
		t.Error("audit must come before mini-architect in loop body")
	}
	if architectCall > innerCall {
		t.Error("mini-architect must come before inner loop in loop body")
	}
}

// --- Bash syntax check ---

func TestPolishCommand_BashSyntax(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{
			name: "single reviewer",
			args: []string{"polish", "-o", "", "--cycles", "2", "--meta-epic", "E1", "--spec", "spec.md", "--reviewers", "claude-opus"},
		},
		{
			name: "multiple reviewers",
			args: []string{"polish", "-o", "", "--cycles", "3", "--meta-epic", "E1", "--spec", "spec.md", "--reviewers", "claude-opus,gemini,codex"},
		},
		{
			name: "custom model",
			args: []string{"polish", "-o", "", "--cycles", "1", "--meta-epic", "E1", "--spec", "spec.md", "--reviewers", "claude-opus", "--model", "claude-sonnet-4-6"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := &cobra.Command{Use: "ca"}
			root.AddCommand(polishCmd())

			dir := t.TempDir()
			outPath := filepath.Join(dir, "polish.sh")
			tt.args[2] = outPath // replace -o placeholder

			_, err := executeCommand(root, tt.args...)
			if err != nil {
				t.Fatalf("command failed: %v", err)
			}

			out, bashErr := exec.Command("bash", "-n", outPath).CombinedOutput()
			if bashErr != nil {
				t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
			}
		})
	}
}

// --- Template unit tests ---

func TestPolishScriptConfig_SetsVariables(t *testing.T) {
	config := polishScriptConfig(3, "'claude-opus-4-6[1m]'", "'E1'", "'docs/specs/foo.md'", "'claude-opus'")
	if !strings.Contains(config, "CYCLES=3") {
		t.Error("expected CYCLES variable")
	}
	if !strings.Contains(config, "META_EPIC='E1'") {
		t.Error("expected META_EPIC variable")
	}
	if !strings.Contains(config, "SPEC_FILE='docs/specs/foo.md'") {
		t.Error("expected SPEC_FILE variable")
	}
	if !strings.Contains(config, "MODEL='claude-opus-4-6[1m]'") {
		t.Error("expected MODEL variable")
	}
	if !strings.Contains(config, "set -euo pipefail") {
		t.Error("expected strict bash mode")
	}
}

func TestPolishScriptReviewerDetection_ChecksCLIs(t *testing.T) {
	detection := polishScriptReviewerDetection()
	if !strings.Contains(detection, "command -v") {
		t.Error("expected command -v for CLI detection")
	}
	if !strings.Contains(detection, "claude") {
		t.Error("expected claude CLI check")
	}
	if !strings.Contains(detection, "gemini") {
		t.Error("expected gemini CLI check")
	}
	if !strings.Contains(detection, "codex") {
		t.Error("expected codex CLI check")
	}
}

func TestPolishScriptAuditPrompt_ContainsBGTItems(t *testing.T) {
	prompt := polishScriptAuditPrompt()

	requiredItems := []string{
		"States",
		"Interaction",
		"Visual Craft",
		"Responsiveness",
		"Performance",
		"Accessibility",
		"Completeness",
		"loading", "empty", "error",
	}
	for _, item := range requiredItems {
		if !strings.Contains(prompt, item) {
			t.Errorf("audit prompt missing required item: %s", item)
		}
	}
}

func TestPolishScriptMiniArchitect_ContainsBdCommands(t *testing.T) {
	architect := polishScriptMiniArchitect()
	if !strings.Contains(architect, "bd create") {
		t.Error("expected bd create in mini-architect")
	}
	if !strings.Contains(architect, "bd dep add") {
		t.Error("expected bd dep add in mini-architect")
	}
	if !strings.Contains(architect, "claude") {
		t.Error("expected claude CLI invocation in mini-architect")
	}
}

func TestPolishScriptInnerLoop_InvokesCaLoop(t *testing.T) {
	inner := polishScriptInnerLoop()
	if !strings.Contains(inner, "ca loop") {
		t.Error("expected ca loop invocation")
	}
	if !strings.Contains(inner, "--epics") {
		t.Error("expected --epics flag in ca loop invocation")
	}
}

func TestPolishScriptMainLoop_HasNCycleForLoop(t *testing.T) {
	mainLoop := polishScriptMainLoop()
	if !strings.Contains(mainLoop, "for ((cycle=1; cycle<=CYCLES; cycle++))") {
		t.Error("expected N-cycle for loop")
	}
}

func TestPolishCommand_CLIPrerequisites(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must check for claude, bd, and ca CLIs
	if !strings.Contains(script, `command -v claude`) {
		t.Error("expected claude CLI prerequisite check")
	}
	if !strings.Contains(script, `command -v bd`) {
		t.Error("expected bd CLI prerequisite check")
	}
	if !strings.Contains(script, `command -v ca`) {
		t.Error("expected ca CLI prerequisite check")
	}
}

func TestPolishCommand_CrashHandler(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "trap") {
		t.Error("expected trap for crash handling")
	}
	if !strings.Contains(script, "EXIT") {
		t.Error("expected EXIT trap")
	}
}

func TestPolishCommand_LogFunction(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// log function must write to stderr (not stdout) to avoid polluting return values
	if !strings.Contains(script, ">&2") {
		t.Error("expected log function to write to stderr")
	}
}

func TestPolishCommand_GitPushAtEnd(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if !strings.Contains(script, "git push") {
		t.Error("expected git push at end of script")
	}
}

func TestPolishCommand_LogBeforeCrashHandler(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// log() must be defined BEFORE the crash handler that calls it
	logIdx := strings.Index(script, "log() {")
	trapIdx := strings.Index(script, "trap _polish_cleanup EXIT")
	if logIdx < 0 {
		t.Fatal("missing log function definition")
	}
	if trapIdx < 0 {
		t.Fatal("missing EXIT trap")
	}
	if logIdx > trapIdx {
		t.Error("log() must be defined before the crash handler trap")
	}
}

func TestPolishCommand_CrashHandlerPreservesExitCode(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Crash handler must preserve exit code so callers see failure
	if !strings.Contains(script, "exit $exit_code") {
		t.Error("crash handler must preserve original exit code with 'exit $exit_code'")
	}
}

func TestPolishCommand_PolishEpicsInitializedPerCycle(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "2",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// POLISH_EPICS must be initialized in the main loop body (before mini-architect)
	forIdx := strings.Index(script, "for ((cycle=1")
	if forIdx < 0 {
		t.Fatal("missing for loop")
	}
	loopBody := script[forIdx:]
	if !strings.Contains(loopBody, `POLISH_EPICS=""`) {
		t.Error("POLISH_EPICS must be reset to empty at start of each cycle")
	}
}

func TestPolishCommand_SpecFileExistenceCheck(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Script must check spec file exists at runtime (fail fast)
	if !strings.Contains(script, "SPEC_FILE") && !strings.Contains(script, "spec") {
		t.Error("expected spec file reference")
	}
	// Must have a file existence check
	if !strings.Contains(script, `[ -f "$SPEC_FILE" ]`) && !strings.Contains(script, `[ ! -f "$SPEC_FILE" ]`) {
		t.Error("expected spec file existence check at runtime")
	}
}

func TestPolishCommand_ReviewerPromptUsesStdin(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Claude reviewer should pipe prompt via stdin, not command substitution
	// to avoid ARG_MAX issues with large specs
	if strings.Contains(script, `-p "$(cat "$prompt_file")"`) {
		t.Error("reviewer prompt should use stdin piping, not -p with command substitution (ARG_MAX risk)")
	}
}

func TestPolishCommand_GitCommitBeforePush(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	_, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	commitIdx := strings.Index(script, "git commit")
	pushIdx := strings.Index(script, "git push")
	if commitIdx < 0 {
		t.Fatal("expected git commit in post-loop")
	}
	if pushIdx < 0 {
		t.Fatal("expected git push in post-loop")
	}
	if commitIdx > pushIdx {
		t.Error("git commit must come before git push")
	}
}

func TestPolishCommand_NoDeadOutputFallback(t *testing.T) {
	// The cobra default for --output means o.output is never empty.
	// Verify no dead code fallback exists in runPolish.
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(polishCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "polish.sh")

	out, err := executeCommand(root, "polish",
		"-o", outPath,
		"--cycles", "1",
		"--meta-epic", "E1",
		"--spec", "spec.md",
		"--reviewers", "claude-opus",
	)
	if err != nil {
		t.Fatalf("command failed: %v\nOutput: %s", err, out)
	}
	// Just verify it works — the dead code removal is a code review item
}

func TestPolishCommand_ArchitectHeredocQuoted(t *testing.T) {
	architect := polishScriptMiniArchitect()
	// The architect prompt must use a quoted heredoc for the static header
	// to prevent shell expansion of report content containing $ or backticks
	if !strings.Contains(architect, "<<'ARCHITECT_HEADER_EOF'") {
		t.Error("architect prompt must use quoted heredoc <<'ARCHITECT_HEADER_EOF' to prevent shell expansion")
	}
	// Report content should be injected via cat (file-based), not heredoc expansion
	if !strings.Contains(architect, `cat "$report_file"`) {
		t.Error("architect prompt should inject report via cat, not heredoc expansion")
	}
}
