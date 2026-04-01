package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/setup"
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

func TestInitCommand_SkipAgentsFlag(t *testing.T) {
	cmd := initCmd()

	flag := cmd.Flags().Lookup("skip-agents")
	if flag == nil {
		t.Fatal("expected --skip-agents flag to exist on init command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected default false, got %s", flag.DefValue)
	}
}

func TestInitCommand_SkipAgents_SkipsTemplates(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(initCmd())

	out, err := executeCommand(root, "init", "--repo-root", dir, "--skip-agents")
	if err != nil {
		t.Fatalf("init --skip-agents failed: %v\nOutput: %s", err, out)
	}

	// AGENTS.md should NOT be created when --skip-agents is set
	if _, err := os.Stat(filepath.Join(dir, "AGENTS.md")); err == nil {
		t.Error("expected AGENTS.md to NOT be created with --skip-agents")
	}
}

func TestInitCommand_SkipClaudeFlag(t *testing.T) {
	cmd := initCmd()

	flag := cmd.Flags().Lookup("skip-claude")
	if flag == nil {
		t.Fatal("expected --skip-claude flag to exist on init command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected default false, got %s", flag.DefValue)
	}
}

func TestInitCommand_SkipClaude_SkipsHooks(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(initCmd())

	out, err := executeCommand(root, "init", "--repo-root", dir, "--skip-claude")
	if err != nil {
		t.Fatalf("init --skip-claude failed: %v\nOutput: %s", err, out)
	}

	// settings.json should NOT have hooks when --skip-claude is set
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	if _, err := os.Stat(settingsPath); err == nil {
		settings, readErr := setup.ReadClaudeSettings(settingsPath)
		if readErr == nil && setup.HasAllHooks(settings) {
			t.Error("expected hooks to NOT be installed with --skip-claude")
		}
	}
}

func TestSetupClaudeCommand_DryRunFlag(t *testing.T) {
	cmd := setupCmd()
	claudeCmd, _, err := cmd.Find([]string{"claude"})
	if err != nil {
		t.Fatalf("could not find claude subcommand: %v", err)
	}

	flag := claudeCmd.Flags().Lookup("dry-run")
	if flag == nil {
		t.Fatal("expected --dry-run flag to exist on setup claude command")
	}
	if flag.DefValue != "false" {
		t.Errorf("expected default false, got %s", flag.DefValue)
	}
}

func TestSetupClaudeCommand_DryRun_NoWrite(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	root := &cobra.Command{Use: "ca"}
	setupC := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root.AddCommand(setupC)
	registerSetupClaudeCmd(setupC)

	out, err := executeCommand(root, "setup", "claude", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("setup claude --dry-run failed: %v\nOutput: %s", err, out)
	}

	// settings.json should NOT exist after --dry-run
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	if _, statErr := os.Stat(settingsPath); statErr == nil {
		t.Error("expected settings.json to NOT be written with --dry-run")
	}
}

func TestSetupClaudeCommand_DryRun_JSON(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	root := &cobra.Command{Use: "ca"}
	setupC := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root.AddCommand(setupC)
	registerSetupClaudeCmd(setupC)

	out, err := executeCommand(root, "setup", "claude", "--repo-root", dir, "--dry-run", "--json")
	if err != nil {
		t.Fatalf("setup claude --dry-run --json failed: %v\nOutput: %s", err, out)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &result); err != nil {
		t.Fatalf("expected valid JSON output, got: %s", out)
	}
	if result["dryRun"] != true {
		t.Errorf("expected dryRun=true in JSON output, got %v", result["dryRun"])
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

func TestSetupClaudeCommand_ReconcilesDuplicateHooks(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".claude"), 0755); err != nil {
		t.Fatalf("mkdir .claude: %v", err)
	}

	settings := map[string]any{}
	setup.AddAllHooks(settings, "/usr/local/bin/ca")
	hooks := settings["hooks"].(map[string]any)
	hooks["SessionStart"] = append(hooks["SessionStart"].([]any), setupHookEntryForTest("", "/usr/local/bin/ca prime 2>/dev/null || true"))

	if err := setup.WriteClaudeSettings(filepath.Join(dir, ".claude", "settings.json"), settings); err != nil {
		t.Fatalf("write settings: %v", err)
	}

	root := &cobra.Command{Use: "ca"}
	setupCmd := &cobra.Command{Use: "setup", Short: "Setup commands"}
	root.AddCommand(setupCmd)
	registerSetupClaudeCmd(setupCmd)

	out, err := executeCommand(root, "setup", "claude", "--repo-root", dir, "--json")
	if err != nil {
		t.Fatalf("setup claude --json failed: %v\nOutput: %s", err, out)
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &result); err != nil {
		t.Fatalf("expected valid JSON output, got: %s", out)
	}
	if result["action"] != "reconciled" {
		t.Fatalf("expected action=reconciled, got %v", result["action"])
	}

	updated, err := setup.ReadClaudeSettings(filepath.Join(dir, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read updated settings: %v", err)
	}
	if setup.HooksNeedDedupe(updated) {
		t.Error("expected duplicate hooks to be removed")
	}
	if got := len(updated["hooks"].(map[string]any)["SessionStart"].([]any)); got != 1 {
		t.Errorf("expected 1 SessionStart entry after reconcile, got %d", got)
	}
}

func setupHookEntryForTest(matcher, command string) map[string]any {
	return map[string]any{
		"matcher": matcher,
		"hooks": []any{
			map[string]any{
				"type":    "command",
				"command": command,
			},
		},
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

func TestDoctorWindowsPlatformCheck(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	checks := runDoctorChecks(dir)

	hasWindowsCheck := false
	for _, c := range checks {
		if c.Name == "Windows platform" {
			hasWindowsCheck = true
			if c.Status != "info" {
				t.Errorf("Windows platform check should be info, got %s", c.Status)
			}
		}
	}

	if runtime.GOOS == "windows" && !hasWindowsCheck {
		t.Error("expected Windows platform check on Windows")
	}
	if runtime.GOOS != "windows" && hasWindowsCheck {
		t.Error("Windows platform check should not appear on non-Windows platforms")
	}
}
