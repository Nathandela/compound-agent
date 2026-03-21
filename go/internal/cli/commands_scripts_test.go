package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestImproveCommand_GeneratesScript(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(improveCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "improvement-loop.sh")

	out, err := executeCommand(root, "improve", "-o", outPath, "--model", "claude-sonnet-4-6")
	if err != nil {
		t.Fatalf("improve command failed: %v\nOutput: %s", err, out)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}

	script := string(data)
	if !strings.HasPrefix(script, "#!/usr/bin/env bash") {
		t.Error("expected bash shebang")
	}
	if !strings.Contains(script, "MAX_ITERS") {
		t.Error("expected MAX_ITERS variable")
	}
	if !strings.Contains(script, "improve/") {
		t.Error("expected improve/ directory reference")
	}
}

func TestImproveCommand_ForceOverwrite(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(improveCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")
	os.WriteFile(outPath, []byte("old"), 0644)

	_, err := executeCommand(root, "improve", "-o", outPath, "--force")
	if err != nil {
		t.Fatalf("improve --force failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	if string(data) == "old" {
		t.Error("expected file to be overwritten")
	}
}

func TestLoopCommand_GeneratesScript(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "infinity-loop.sh")

	out, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v\nOutput: %s", err, out)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}

	script := string(data)
	if !strings.HasPrefix(script, "#!/usr/bin/env bash") {
		t.Error("expected bash shebang")
	}
	if !strings.Contains(script, "MAX_RETRIES") {
		t.Error("expected MAX_RETRIES variable")
	}
	if !strings.Contains(script, "EPIC_COMPLETE") {
		t.Error("expected EPIC_COMPLETE marker detection")
	}
}

func TestLoopCommand_WithEpics(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--epics", "epic-1,epic-2")
	if err != nil {
		t.Fatalf("loop --epics failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "epic-1") {
		t.Error("expected epic-1 in script")
	}
}

func TestWatchCommand_NoTraceFile(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(watchCmd())

	out, err := executeCommand(root, "watch", "--follow=false", "--log-dir", "/nonexistent/path")
	if err != nil {
		t.Fatalf("watch command failed: %v", err)
	}

	if !strings.Contains(out, "No active trace") && !strings.Contains(out, "No trace") {
		// It's OK if it just says nothing found
		if !strings.Contains(strings.ToLower(out), "no") {
			t.Errorf("expected 'no trace' message, got: %s", out)
		}
	}
}

func TestWatchCommand_ReadsTraceFile(t *testing.T) {
	dir := t.TempDir()
	logDir := filepath.Join(dir, "agent_logs")
	os.MkdirAll(logDir, 0755)

	// Create a trace file
	traceContent := `{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello world"}}
{"type":"result","result":"EPIC_COMPLETE"}
`
	os.WriteFile(filepath.Join(logDir, "trace_test-001.jsonl"), []byte(traceContent), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(watchCmd())

	out, err := executeCommand(root, "watch", "--follow=false", "--log-dir", logDir)
	if err != nil {
		t.Fatalf("watch command failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "TOOL") || !strings.Contains(out, "Read") {
		t.Errorf("expected TOOL Read in output, got: %s", out)
	}
}

func TestAuditCommand_BasicRun(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(auditCmd())

	out, err := executeCommand(root, "audit", "--repo-root", dir)
	if err != nil {
		t.Fatalf("audit command failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "Audit") || !strings.Contains(out, "finding") {
		t.Errorf("expected audit summary, got: %s", out)
	}
}

func TestAuditCommand_JSON(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(auditCmd())

	out, err := executeCommand(root, "audit", "--repo-root", dir, "--json")
	if err != nil {
		t.Fatalf("audit --json failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "findings") {
		t.Errorf("expected JSON with findings, got: %s", out)
	}
}

func TestImproveCommand_ShellInjection(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(improveCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `"; rm -rf /; #`
	_, err := executeCommand(root, "improve", "-o", outPath, "--force", "--model", payload)
	if err != nil {
		t.Fatalf("improve command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The payload must be inside single quotes, not bare double quotes
	if strings.Contains(script, `MODEL="`+payload) {
		t.Error("model flag is interpolated without escaping — shell injection possible")
	}
	if !strings.Contains(script, `MODEL='`) {
		t.Error("expected MODEL to be single-quoted for shell safety")
	}
}

func TestLoopCommand_ShellInjection(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `$(whoami)`
	_, err := executeCommand(root, "loop", "-o", outPath, "--force", "--epics", payload)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The payload must be inside single quotes, preventing command substitution
	if strings.Contains(script, `EPIC_IDS="`+payload) {
		t.Error("epics flag is interpolated without escaping — shell injection possible")
	}
	if !strings.Contains(script, `EPIC_IDS='`) {
		t.Error("expected EPIC_IDS to be single-quoted for shell safety")
	}
}

func TestImproveCommand_NoVerifyRemoved(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(improveCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	_, err := executeCommand(root, "improve", "-o", outPath, "--force")
	if err != nil {
		t.Fatalf("improve command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if strings.Contains(script, "--no-verify") {
		t.Error("generated script must not use --no-verify (bypasses pre-commit hooks)")
	}
}

func TestFindTraceForEpic_PathTraversal(t *testing.T) {
	dir := t.TempDir()
	logDir := filepath.Join(dir, "agent_logs")
	os.MkdirAll(logDir, 0755)

	// Attempting path traversal via epic ID should return empty
	result := findTraceForEpic(logDir, "../other_dir/trace_")
	if result != "" {
		t.Errorf("expected empty for path traversal attempt, got: %s", result)
	}

	result = findTraceForEpic(logDir, "normal-epic")
	// No trace file exists, should just return empty
	if result != "" {
		t.Errorf("expected empty for non-existent trace, got: %s", result)
	}
}

func TestImproveInitSubcommand(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(improveCmd())

	dir := t.TempDir()

	out, err := executeCommand(root, "improve", "init", "--dir", dir)
	if err != nil {
		t.Fatalf("improve init failed: %v\nOutput: %s", err, out)
	}

	// Check that example file was created
	files, _ := filepath.Glob(filepath.Join(dir, "*.md"))
	if len(files) == 0 {
		t.Error("expected at least one .md file to be created")
	}
}
