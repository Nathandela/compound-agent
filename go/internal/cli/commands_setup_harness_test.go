package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestSetupCommand_HarnessFlagExists(t *testing.T) {
	cmd := setupCmd()
	f := cmd.Flags().Lookup("harness")
	if f == nil {
		t.Fatal("expected --harness flag on setup command")
	}
}

func TestSetup_HarnessMultiple_Repeatable(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	out, err := executeCommand(root, "setup", "--repo-root", dir, "--skip-hooks",
		"--harness", "claude", "--harness", "gemini")
	if err != nil {
		t.Fatalf("setup --harness claude --harness gemini failed: %v\n%s", err, out)
	}

	if _, err := os.Stat(filepath.Join(dir, ".claude", "agents", "compound")); err != nil {
		t.Errorf("expected .claude templates: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "GEMINI.md")); err != nil {
		t.Errorf("expected GEMINI.md: %v", err)
	}
}

func TestSetup_HarnessUnknown_CLIRejected(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	out, err := executeCommand(root, "setup", "--repo-root", dir, "--skip-hooks", "--harness", "bogus")
	if err == nil {
		t.Fatalf("expected error for unknown harness, got success: %s", out)
	}
	// Nothing should have been written for the bad value.
	if _, statErr := os.Stat(filepath.Join(dir, ".claude")); statErr == nil {
		t.Error("unknown harness must be rejected before any writes")
	}
}

func TestSetup_HarnessJSON_ReportsTargets(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)
	t.Setenv("HOME", t.TempDir())

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	out, err := executeCommand(root, "setup", "--repo-root", dir, "--skip-hooks",
		"--harness", "goose", "--json")
	if err != nil {
		t.Fatalf("setup --harness goose --json failed: %v\n%s", err, out)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &result); err != nil {
		t.Fatalf("expected valid JSON, got: %s", out)
	}
	targets, ok := result["targets"].([]any)
	if !ok {
		t.Fatalf("expected targets array in JSON, got: %v", result["targets"])
	}
	if len(targets) != 1 || targets[0] != "goose" {
		t.Errorf("expected targets=[goose], got %v", targets)
	}
}
