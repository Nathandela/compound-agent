package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Profile flag ---

func TestSetupCommand_ProfileFlagExists(t *testing.T) {
	cmd := setupCmd()
	if cmd.Flags().Lookup("profile") == nil {
		t.Error("--profile flag should exist on setup command")
	}
	if cmd.Flags().Lookup("confirm-prune") == nil {
		t.Error("--confirm-prune flag should exist on setup command")
	}
}

func TestSetupCommand_InvalidProfileErrors(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	_, err := executeCommand(root, "setup", "--repo-root", dir, "--profile", "bogus")
	if err == nil {
		t.Fatal("expected error for --profile=bogus")
	}
	if !strings.Contains(err.Error(), "profile") {
		t.Errorf("error should mention profile: %v", err)
	}
	// No .claude should be created
	if _, statErr := os.Stat(filepath.Join(dir, ".claude")); statErr == nil {
		t.Error("invalid profile should not create .claude/")
	}
}

func TestSetupCommand_ProfileMinimalWorks(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	out, err := executeCommand(root, "setup", "--repo-root", dir, "--profile", "minimal")
	if err != nil {
		t.Fatalf("setup --profile=minimal failed: %v\noutput: %s", err, out)
	}
	// Minimal → no commands installed
	commandsDir := filepath.Join(dir, ".claude", "commands", "compound")
	entries, _ := os.ReadDir(commandsDir)
	mdCount := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			mdCount++
		}
	}
	if mdCount != 0 {
		t.Errorf("minimal profile: expected 0 command .md files, got %d", mdCount)
	}
}

func TestSetupCommand_DowngradeWithoutConfirmErrors(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())

	// Full install first
	_, err := executeCommand(root, "setup", "--repo-root", dir, "--profile", "full")
	if err != nil {
		t.Fatalf("seed full setup failed: %v", err)
	}

	// Downgrade without --confirm-prune should error
	_, err = executeCommand(root, "setup", "--repo-root", dir, "--profile", "minimal")
	if err == nil {
		t.Fatal("downgrade without --confirm-prune should error")
	}
	if !strings.Contains(err.Error(), "confirm-prune") {
		t.Errorf("error should mention --confirm-prune: %v", err)
	}
}

// --- Uninstall command ---

func TestUninstallCommand_Exists(t *testing.T) {
	cmd := uninstallCmd()
	// cobra.Command.<fields> below would panic on nil, so fail fast.
	if cmd == nil {
		t.Fatal("uninstallCmd() returned nil")
		return
	}
	if cmd.Use == "" || !strings.HasPrefix(cmd.Use, "uninstall") {
		t.Errorf("uninstall command Use should start with 'uninstall', got %q", cmd.Use)
	}
	for _, f := range []string{"yes", "templates", "all", "repo-root"} {
		if cmd.Flags().Lookup(f) == nil {
			t.Errorf("uninstall should have --%s flag", f)
		}
	}
}

func TestUninstallCommand_NothingToRemove(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(uninstallCmd())

	out, err := executeCommand(root, "uninstall", "--repo-root", dir, "--yes")
	if err != nil {
		t.Fatalf("uninstall on empty dir failed: %v\nout: %s", err, out)
	}
	if !strings.Contains(strings.ToLower(out), "nothing") {
		t.Errorf("expected 'nothing' notice, got: %s", out)
	}
}

func TestUninstallCommand_HooksOnlyPreservesTemplates(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	// Seed full install
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())
	root.AddCommand(uninstallCmd())

	if _, err := executeCommand(root, "setup", "--repo-root", dir); err != nil {
		t.Fatalf("seed setup: %v", err)
	}

	skillsBefore, _ := os.ReadDir(filepath.Join(dir, ".claude", "skills", "compound"))
	if len(skillsBefore) == 0 {
		t.Fatal("seed: skills should exist after setup")
	}

	// Uninstall (hooks only)
	if _, err := executeCommand(root, "uninstall", "--repo-root", dir, "--yes"); err != nil {
		t.Fatalf("uninstall: %v", err)
	}

	// Templates preserved
	skillsAfter, _ := os.ReadDir(filepath.Join(dir, ".claude", "skills", "compound"))
	if len(skillsAfter) != len(skillsBefore) {
		t.Errorf("templates should be preserved on --hooks-only uninstall: before=%d after=%d",
			len(skillsBefore), len(skillsAfter))
	}
}

func TestUninstallCommand_TemplatesRemovesCompoundDirs(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())
	root.AddCommand(uninstallCmd())

	if _, err := executeCommand(root, "setup", "--repo-root", dir); err != nil {
		t.Fatalf("seed setup: %v", err)
	}
	if _, err := executeCommand(root, "uninstall", "--repo-root", dir, "--templates", "--yes"); err != nil {
		t.Fatalf("uninstall --templates: %v", err)
	}

	for _, rel := range []string{
		".claude/agents/compound",
		".claude/commands/compound",
		".claude/skills/compound",
		"docs/compound",
	} {
		if _, statErr := os.Stat(filepath.Join(dir, rel)); statErr == nil {
			t.Errorf("--templates uninstall: %s should be removed", rel)
		}
	}
}

func TestUninstallCommand_PreservesLessons(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())
	root.AddCommand(uninstallCmd())

	if _, err := executeCommand(root, "setup", "--repo-root", dir); err != nil {
		t.Fatalf("seed setup: %v", err)
	}
	// Put a user lesson into index.jsonl
	indexPath := filepath.Join(dir, ".claude", "lessons", "index.jsonl")
	if err := os.WriteFile(indexPath, []byte(`{"id":"user-lesson","insight":"keep me"}`+"\n"), 0644); err != nil {
		t.Fatalf("write lesson: %v", err)
	}

	if _, err := executeCommand(root, "uninstall", "--repo-root", dir, "--all", "--yes"); err != nil {
		t.Fatalf("uninstall --all: %v", err)
	}

	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("lessons/index.jsonl should be preserved: %v", err)
	}
	if !strings.Contains(string(data), "user-lesson") {
		t.Errorf("user lesson data should be intact: got %q", data)
	}
}

func TestUninstallCommand_AllRemovesRuntimeAndMarkers(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())
	root.AddCommand(uninstallCmd())

	if _, err := executeCommand(root, "setup", "--repo-root", dir); err != nil {
		t.Fatalf("seed setup: %v", err)
	}

	// Before: .compound-agent/ should exist
	if _, err := os.Stat(filepath.Join(dir, ".compound-agent")); err != nil {
		t.Fatalf("seed: .compound-agent/ should exist: %v", err)
	}

	if _, err := executeCommand(root, "uninstall", "--repo-root", dir, "--all", "--yes"); err != nil {
		t.Fatalf("uninstall --all: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, ".compound-agent")); err == nil {
		t.Error("--all uninstall should remove .compound-agent/")
	}

	// AGENTS.md should no longer contain the compound-agent block
	if data, err := os.ReadFile(filepath.Join(dir, "AGENTS.md")); err == nil {
		if strings.Contains(string(data), "<!-- compound-agent:start -->") {
			t.Error("--all uninstall should strip compound-agent block from AGENTS.md")
		}
	}
}

func TestUninstallCommand_RequiresConfirmationWithoutYes(t *testing.T) {
	// Without --yes AND no stdin, uninstall should print plan and abort.
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(setupCmd())
	root.AddCommand(uninstallCmd())

	if _, err := executeCommand(root, "setup", "--repo-root", dir); err != nil {
		t.Fatalf("seed setup: %v", err)
	}

	// Execute without --yes; we expect the plan printed and no changes.
	// Stdin in test is empty, so interactive read returns immediately.
	out, _ := executeCommand(root, "uninstall", "--repo-root", dir)
	if !strings.Contains(strings.ToLower(out), "would remove") && !strings.Contains(strings.ToLower(out), "plan") {
		t.Errorf("expected plan/summary in output without --yes, got: %s", out)
	}

	// Hooks should still be present (no destructive changes).
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	if _, err := os.Stat(settingsPath); err != nil {
		t.Fatalf("settings.json should still exist: %v", err)
	}
}
