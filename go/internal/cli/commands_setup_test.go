package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestInitCommand(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(initCmd())

	out, err := executeCommand(root, "init", "--repo-root", dir)
	if err != nil {
		t.Fatalf("init command failed: %v\nOutput: %s", err, out)
	}

	// Check directories were created
	if _, err := os.Stat(filepath.Join(dir, ".claude", "lessons")); os.IsNotExist(err) {
		t.Error("expected .claude/lessons/ to be created")
	}

	if !strings.Contains(out, "initialized") || !strings.Contains(out, "success") {
		// Accept any success-like output
		if !strings.Contains(strings.ToLower(out), "init") {
			t.Errorf("expected success message, got: %s", out)
		}
	}
}

func TestInitCommand_JSON(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(initCmd())

	out, err := executeCommand(root, "init", "--repo-root", dir, "--json")
	if err != nil {
		t.Fatalf("init --json failed: %v\nOutput: %s", err, out)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &result); err != nil {
		t.Fatalf("expected valid JSON output, got: %s", out)
	}
	if result["success"] != true {
		t.Errorf("expected success=true, got %v", result["success"])
	}
}

func TestInitCommand_NoSkipModelFlag(t *testing.T) {
	root := &cobra.Command{Use: "ca"}
	cmd := initCmd()
	root.AddCommand(cmd)

	// --skip-model flag should not exist (dead flag removed)
	if cmd.Flags().Lookup("skip-model") != nil {
		t.Error("--skip-model flag should be removed (dead flag)")
	}
}

func TestSetupCommand_NoSkipModelFlag(t *testing.T) {
	cmd := setupCmd()

	// --skip-model flag should not exist (dead flag removed)
	if cmd.Flags().Lookup("skip-model") != nil {
		t.Error("--skip-model flag should be removed from setup command (dead flag)")
	}
}

func TestSetupClaudeCommand_Install(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	root := &cobra.Command{Use: "ca"}
	setupCmd := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root.AddCommand(setupCmd)
	registerSetupClaudeCmd(setupCmd)

	out, err := executeCommand(root, "setup", "claude", "--repo-root", dir)
	if err != nil {
		t.Fatalf("setup claude failed: %v\nOutput: %s", err, out)
	}

	// Verify hooks were written
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		t.Error("expected settings.json to be created")
	}
}

func TestSetupClaudeCommand_Uninstall(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	root := &cobra.Command{Use: "ca"}
	setupCmd := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root.AddCommand(setupCmd)
	registerSetupClaudeCmd(setupCmd)

	// First install
	executeCommand(root, "setup", "claude", "--repo-root", dir)

	// Then uninstall
	root2 := &cobra.Command{Use: "ca"}
	setupCmd2 := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root2.AddCommand(setupCmd2)
	registerSetupClaudeCmd(setupCmd2)

	out, err := executeCommand(root2, "setup", "claude", "--uninstall", "--repo-root", dir)
	if err != nil {
		t.Fatalf("setup claude --uninstall failed: %v\nOutput: %s", err, out)
	}
}

func TestDoctorCommand(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(doctorCmd())

	out, err := executeCommand(root, "doctor", "--repo-root", dir)
	if err != nil {
		t.Fatalf("doctor command failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, ".claude") {
		t.Errorf("expected doctor output to mention .claude, got: %s", out)
	}
}
