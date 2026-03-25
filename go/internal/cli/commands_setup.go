package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

func initCmd() *cobra.Command {
	var (
		skipHooks  bool
		skipAgents bool
		skipClaude bool
		jsonOut    bool
		repoRoot   string
	)

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize compound-agent in this repository",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runInit(cmd, resolveRoot(repoRoot), skipHooks || skipClaude, skipAgents, jsonOut)
		},
	}

	cmd.Flags().BoolVar(&skipHooks, "skip-hooks", false, "Skip installing Claude Code hooks")
	cmd.Flags().BoolVar(&skipAgents, "skip-agents", false, "Skip template installation (AGENTS.md, skills, commands, docs)")
	cmd.Flags().BoolVar(&skipClaude, "skip-claude", false, "Skip Claude Code hooks installation")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root (defaults to git root)")
	return cmd
}

// runInit performs the init command logic.
func runInit(cmd *cobra.Command, repoRoot string, skipHooks, skipAgents, jsonOut bool) error {
	result, err := setup.InitRepo(repoRoot, setup.InitOptions{
		SkipHooks:     skipHooks,
		SkipTemplates: skipAgents,
		BinaryPath:    resolveBinaryPath(),
	})
	if err != nil {
		return fmt.Errorf("init: %w", err)
	}

	if jsonOut {
		printInitResultJSON(cmd, result)
		return nil
	}

	if !isQuiet(cmd) {
		cmd.Printf("[ok] Compound agent initialized in %s\n", repoRoot)
		printInitResultText(cmd, result)
		printBeadsStatus(cmd, repoRoot)
	}
	return nil
}

func setupCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Setup compound-agent",
	}

	registerSetupClaudeCmd(cmd)

	var (
		skipHooks bool
		jsonOut   bool
		repoRoot  string
	)

	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		return runSetup(cmd, resolveRoot(repoRoot), skipHooks, jsonOut)
	}

	cmd.Flags().BoolVar(&skipHooks, "skip-hooks", false, "Skip installing hooks")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root")
	return cmd
}

// runSetup performs the setup command logic.
func runSetup(cmd *cobra.Command, repoRoot string, skipHooks, jsonOut bool) error {
	result, err := setup.InitRepo(repoRoot, setup.InitOptions{
		SkipHooks:  skipHooks,
		BinaryPath: resolveBinaryPath(),
	})
	if err != nil {
		return fmt.Errorf("setup: %w", err)
	}

	if jsonOut {
		printInitResultJSON(cmd, result)
		return nil
	}

	if !isQuiet(cmd) {
		cmd.Println("[ok] Compound agent setup complete")
		printSetupResultText(cmd, result)
		printBeadsStatus(cmd, repoRoot)
	}
	return nil
}

// resolveRoot returns repoRoot if non-empty, otherwise detects the git root.
func resolveRoot(repoRoot string) string {
	if repoRoot != "" {
		return repoRoot
	}
	return util.GetRepoRoot()
}

// printInitResultJSON prints the InitResult as JSON (shared by init and setup).
func printInitResultJSON(cmd *cobra.Command, result *setup.InitResult) {
	data, _ := json.Marshal(map[string]any{
		"success":             result.Success,
		"hooksInstalled":      result.HooksInstalled,
		"hooksUpgraded":       result.HooksUpgraded,
		"pluginUpdated":       result.PluginUpdated,
		"dirsCreated":         len(result.DirsCreated),
		"filesCreated":        len(result.FilesCreated),
		"agentsInstalled":     result.AgentsInstalled,
		"agentsUpdated":       result.AgentsUpdated,
		"commandsInstalled":   result.CommandsInstalled,
		"commandsUpdated":     result.CommandsUpdated,
		"skillsInstalled":     result.SkillsInstalled,
		"skillsUpdated":       result.SkillsUpdated,
		"roleSkillsInstalled": result.RoleSkillsInstalled,
		"roleSkillsUpdated":   result.RoleSkillsUpdated,
		"docsInstalled":       result.DocsInstalled,
		"docsUpdated":         result.DocsUpdated,
		"researchInstalled":   result.ResearchInstalled,
		"researchUpdated":     result.ResearchUpdated,
		"templatesPruned":     result.TemplatesPruned,
	})
	cmd.Println(string(data))
}

// printInitResultText prints the text summary for the init command.
func printInitResultText(cmd *cobra.Command, result *setup.InitResult) {
	if result.HooksUpgraded {
		cmd.Println("  Hooks: upgraded (npx → binary)")
	} else if result.HooksInstalled {
		cmd.Println("  Hooks: installed")
	}
	if result.PluginUpdated {
		cmd.Println("  Plugin: version updated")
	}
	cmd.Printf("  Directories: %d created\n", len(result.DirsCreated))
	printTemplatesSummary(cmd, result)
	printMdUpdates(cmd, result)
}

// printSetupResultText prints the text summary for the setup command.
func printSetupResultText(cmd *cobra.Command, result *setup.InitResult) {
	if result.HooksUpgraded {
		cmd.Println("  Hooks: upgraded (npx → binary) in .claude/settings.json")
	} else if result.HooksInstalled {
		cmd.Println("  Hooks: installed to .claude/settings.json")
	}
	if result.PluginUpdated {
		cmd.Println("  Plugin: version updated in .claude/plugin.json")
	}
	cmd.Printf("  Directories: %d created\n", len(result.DirsCreated))
	printTemplatesSummary(cmd, result)
	printMdUpdates(cmd, result)
}

// printMdUpdates prints AGENTS.md and CLAUDE.md update status.
func printMdUpdates(cmd *cobra.Command, result *setup.InitResult) {
	if result.AgentsMdUpdated {
		cmd.Println("  AGENTS.md: updated")
	}
	if result.ClaudeMdUpdated {
		cmd.Println("  CLAUDE.md: reference added")
	}
}

// setupClaudeOpts holds the parsed flags for setup claude.
type setupClaudeOpts struct {
	uninstall, status, global, dryRun, jsonOut bool
	repoRoot                                   string
}

// runSetupClaude executes the setup claude command logic.
func runSetupClaude(cmd *cobra.Command, opts *setupClaudeOpts) error {
	if opts.repoRoot == "" {
		opts.repoRoot = util.GetRepoRoot()
	}

	settingsPath := filepath.Join(opts.repoRoot, ".claude", "settings.json")
	displayPath := ".claude/settings.json"
	if opts.global {
		home, _ := os.UserHomeDir()
		settingsPath = filepath.Join(home, ".claude", "settings.json")
		displayPath = "~/.claude/settings.json"
	}

	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}

	installed := setup.HasAllHooks(settings)
	binaryPath := resolveBinaryPath()
	needsUpgrade := setup.HooksNeedUpgrade(settings, binaryPath)
	needsDedupe := setup.HooksNeedDedupe(settings)

	if opts.status {
		return handleClaudeStatus(cmd, installed, needsUpgrade, needsDedupe, displayPath, settingsPath, opts.jsonOut)
	}
	if opts.uninstall {
		return handleClaudeUninstall(cmd, settings, settingsPath, installed, displayPath, opts.jsonOut)
	}
	if opts.dryRun {
		return handleClaudeDryRun(cmd, installed, needsUpgrade, needsDedupe, displayPath, opts.jsonOut)
	}
	return handleClaudeInstall(cmd, settings, settingsPath, installed, needsUpgrade, needsDedupe, binaryPath, displayPath, opts.jsonOut)
}

func registerSetupClaudeCmd(parent *cobra.Command) {
	opts := &setupClaudeOpts{}

	cmd := &cobra.Command{
		Use:   "claude",
		Short: "Install Claude Code hooks",
		RunE:  func(cmd *cobra.Command, args []string) error { return runSetupClaude(cmd, opts) },
	}

	cmd.Flags().BoolVar(&opts.uninstall, "uninstall", false, "Remove compound-agent hooks")
	cmd.Flags().BoolVar(&opts.status, "status", false, "Check integration status")
	cmd.Flags().BoolVar(&opts.global, "global", false, "Use global ~/.claude/ settings")
	cmd.Flags().BoolVar(&opts.dryRun, "dry-run", false, "Show what would change without writing")
	cmd.Flags().BoolVar(&opts.jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&opts.repoRoot, "repo-root", "", "Repository root")

	parent.AddCommand(cmd)
}

func handleClaudeStatus(cmd *cobra.Command, installed bool, stale bool, duplicated bool, displayPath, settingsPath string, jsonOut bool) error {
	if jsonOut {
		data, _ := json.Marshal(map[string]any{
			"settingsFile":   displayPath,
			"hookInstalled":  installed,
			"hookStale":      stale,
			"hookDuplicated": duplicated,
			"status":         statusLabel(installed, stale, duplicated),
		})
		cmd.Println(string(data))
		return nil
	}

	cmd.Println("Claude Code Integration Status")
	cmd.Println("----------------------------------------")
	cmd.Printf("Hooks file: %s\n", displayPath)
	if _, err := os.Stat(settingsPath); err == nil {
		cmd.Println("  [ok] File exists")
	} else {
		cmd.Println("  [missing] File not found")
	}
	if installed && !stale && !duplicated {
		cmd.Println("  [ok] Compound Agent hooks installed")
	} else if installed && stale {
		cmd.Println("  [warn] Compound Agent hooks installed but stale (using npx instead of binary)")
		cmd.Println("         Fix: ca setup claude")
	} else if installed && duplicated {
		cmd.Println("  [warn] Compound Agent hooks installed but duplicated")
		cmd.Println("         Fix: ca setup claude")
	} else {
		cmd.Println("  [warn] Compound Agent hooks not installed")
	}
	return nil
}

// hookAction classifies the action to take based on hook state.
// Returns a present-tense verb ("install", "upgrade", "reconcile", "unchanged").
func hookAction(installed, needsUpgrade, needsDedupe bool) string {
	if installed && !needsUpgrade && !needsDedupe {
		return "unchanged"
	}
	if needsUpgrade && needsDedupe {
		return "reconcile"
	}
	if needsUpgrade {
		return "upgrade"
	}
	if needsDedupe {
		return "reconcile"
	}
	return "install"
}

// hookActionPastTense maps present-tense actions to past-tense for output messages.
var hookActionPastTense = map[string]string{
	"install":   "installed",
	"upgrade":   "upgraded",
	"reconcile": "reconciled",
	"unchanged": "unchanged",
}

func handleClaudeDryRun(cmd *cobra.Command, installed bool, needsUpgrade bool, needsDedupe bool, displayPath string, jsonOut bool) error {
	action := hookAction(installed, needsUpgrade, needsDedupe)

	if jsonOut {
		data, _ := json.Marshal(map[string]any{
			"dryRun":       true,
			"location":     displayPath,
			"action":       action,
			"installed":    installed,
			"needsUpgrade": needsUpgrade,
			"needsDedupe":  needsDedupe,
		})
		cmd.Println(string(data))
		return nil
	}

	cmd.Println("[dry-run] Claude Code hooks analysis:")
	cmd.Printf("  Settings file: %s\n", displayPath)
	cmd.Printf("  Currently installed: %v\n", installed)
	if action == "unchanged" {
		cmd.Println("  Action: no changes needed")
	} else {
		cmd.Printf("  Action would: %s\n", action)
	}
	if needsUpgrade {
		cmd.Println("  Upgrade: npx hooks would be upgraded to binary path")
	}
	if needsDedupe {
		cmd.Println("  Deduplicate: duplicate hook entries would be removed")
	}
	return nil
}

func handleClaudeInstall(cmd *cobra.Command, settings map[string]any, settingsPath string, installed bool, needsUpgrade bool, needsDedupe bool, binaryPath string, displayPath string, jsonOut bool) error {
	if installed && !needsUpgrade && !needsDedupe {
		printClaudeResult(cmd, displayPath, "unchanged", jsonOut)
		return nil
	}

	setup.AddAllHooks(settings, binaryPath)
	if err := setup.WriteClaudeSettings(settingsPath, settings); err != nil {
		return fmt.Errorf("write settings: %w", err)
	}

	action := hookActionPastTense[hookAction(installed, needsUpgrade, needsDedupe)]
	printClaudeResult(cmd, displayPath, action, jsonOut)
	return nil
}

func printClaudeResult(cmd *cobra.Command, displayPath string, action string, jsonOut bool) {
	if jsonOut {
		data, _ := json.Marshal(map[string]any{
			"installed": true,
			"location":  displayPath,
			"action":    action,
		})
		cmd.Println(string(data))
		return
	}

	messages := map[string]string{
		"unchanged":  fmt.Sprintf("[info] Compound agent hooks already installed at %s", displayPath),
		"installed":  fmt.Sprintf("[ok] Claude Code hooks installed to %s", displayPath),
		"upgraded":   fmt.Sprintf("[ok] Claude Code hooks upgraded in %s (npx → binary)", displayPath),
		"reconciled": fmt.Sprintf("[ok] Claude Code hooks reconciled in %s (upgraded + deduplicated)", displayPath),
	}
	if msg, ok := messages[action]; ok {
		cmd.Println(msg)
	} else {
		cmd.Printf("[ok] Claude Code hooks %s in %s\n", action, displayPath)
	}
	if action != "unchanged" {
		cmd.Println("  Hooks: SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse, PreToolUse, Stop")
	}
}

func handleClaudeUninstall(cmd *cobra.Command, settings map[string]any, settingsPath string, installed bool, displayPath string, jsonOut bool) error {
	removed := setup.RemoveAllHooks(settings)
	if removed {
		if err := setup.WriteClaudeSettings(settingsPath, settings); err != nil {
			return fmt.Errorf("write settings: %w", err)
		}
	}

	if jsonOut {
		action := "unchanged"
		if removed {
			action = "removed"
		}
		data, _ := json.Marshal(map[string]any{
			"installed": false,
			"location":  displayPath,
			"action":    action,
		})
		cmd.Println(string(data))
	} else {
		if removed {
			cmd.Printf("[ok] Compound agent hooks removed from %s\n", displayPath)
		} else {
			cmd.Println("[info] No compound agent hooks to remove")
		}
	}
	return nil
}

func statusLabel(installed bool, stale bool, duplicated bool) string {
	if installed && stale {
		return "stale"
	}
	if installed && duplicated {
		return "duplicated"
	}
	if installed {
		return "connected"
	}
	return "disconnected"
}

// printTemplatesSummary prints installed/updated template counts.
func printTemplatesSummary(cmd *cobra.Command, result *setup.InitResult) {
	totalInstalled := result.AgentsInstalled + result.CommandsInstalled +
		result.SkillsInstalled + result.RoleSkillsInstalled + result.DocsInstalled +
		result.ResearchInstalled
	totalUpdated := result.AgentsUpdated + result.CommandsUpdated +
		result.SkillsUpdated + result.RoleSkillsUpdated + result.DocsUpdated +
		result.ResearchUpdated

	if totalInstalled > 0 {
		cmd.Printf("  Templates: %d installed (agents:%d commands:%d skills:%d roles:%d docs:%d research:%d)\n",
			totalInstalled, result.AgentsInstalled, result.CommandsInstalled,
			result.SkillsInstalled, result.RoleSkillsInstalled, result.DocsInstalled,
			result.ResearchInstalled)
	}
	if totalUpdated > 0 {
		cmd.Printf("  Templates: %d updated (agents:%d commands:%d skills:%d roles:%d docs:%d research:%d)\n",
			totalUpdated, result.AgentsUpdated, result.CommandsUpdated,
			result.SkillsUpdated, result.RoleSkillsUpdated, result.DocsUpdated,
			result.ResearchUpdated)
	}
	if result.TemplatesPruned > 0 {
		cmd.Printf("  Templates: %d retired files removed\n", result.TemplatesPruned)
	}
}

// resolveBinaryPath finds the current Go binary path for hook commands.
func resolveBinaryPath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return exe
}

// --- doctor command ---

type doctorCheck struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "pass", "fail", "warn"
	Fix    string `json:"fix,omitempty"`
}

func doctorCmd() *cobra.Command {
	var (
		repoRoot string
		jsonOut  bool
	)
	cmd := &cobra.Command{
		Use:   "doctor",
		Short: "Check compound-agent health",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoRoot == "" {
				repoRoot = util.GetRepoRoot()
			}

			checks := runDoctorChecks(repoRoot)

			if jsonOut {
				data, _ := json.Marshal(map[string]any{"checks": checks})
				cmd.Println(string(data))
				return nil
			}

			passCount, failCount, warnCount := 0, 0, 0
			for _, c := range checks {
				icon := "[ok]"
				switch c.Status {
				case "fail":
					icon = "[FAIL]"
					failCount++
				case "warn":
					icon = "[WARN]"
					warnCount++
				default:
					passCount++
				}
				cmd.Printf("  %s %s\n", icon, c.Name)
				if c.Fix != "" {
					cmd.Printf("       Fix: %s\n", c.Fix)
				}
			}

			cmd.Println()
			cmd.Printf("Results: %d passed, %d failed, %d warnings\n", passCount, failCount, warnCount)
			return nil
		},
	}
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	return cmd
}

func runDoctorChecks(repoRoot string) []doctorCheck {
	var checks []doctorCheck

	// 1. .claude/ directory exists
	claudeDir := filepath.Join(repoRoot, ".claude")
	if _, err := os.Stat(claudeDir); err == nil {
		checks = append(checks, doctorCheck{Name: ".claude/ directory exists", Status: "pass"})
	} else {
		checks = append(checks, doctorCheck{Name: ".claude/ directory exists", Status: "fail", Fix: "Run: ca init"})
	}

	// 2. Lessons index exists
	indexPath := filepath.Join(repoRoot, ".claude", "lessons", "index.jsonl")
	if _, err := os.Stat(indexPath); err == nil {
		checks = append(checks, doctorCheck{Name: "Lessons index present", Status: "pass"})
	} else {
		checks = append(checks, doctorCheck{Name: "Lessons index present", Status: "fail", Fix: "Run: ca init"})
	}

	// 3. Claude hooks configured
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err == nil && setup.HasAllHooks(settings) {
		binaryPath := resolveBinaryPath()
		if setup.HooksNeedUpgrade(settings, binaryPath) {
			checks = append(checks, doctorCheck{Name: "Claude Code hooks installed", Status: "warn", Fix: "Hooks are stale (npx). Run: ca setup claude"})
		} else if setup.HooksNeedDedupe(settings) {
			checks = append(checks, doctorCheck{Name: "Claude Code hooks installed", Status: "warn", Fix: "Hooks are duplicated. Run: ca setup claude"})
		} else {
			checks = append(checks, doctorCheck{Name: "Claude Code hooks installed", Status: "pass"})
		}
	} else {
		checks = append(checks, doctorCheck{Name: "Claude Code hooks installed", Status: "warn", Fix: "Run: ca setup claude"})
	}

	// 4. .gitignore health
	gitignorePath := filepath.Join(repoRoot, ".claude", ".gitignore")
	if _, err := os.Stat(gitignorePath); err == nil {
		checks = append(checks, doctorCheck{Name: ".claude/.gitignore present", Status: "pass"})
	} else {
		checks = append(checks, doctorCheck{Name: ".claude/.gitignore present", Status: "warn", Fix: "Run: ca init"})
	}

	// 5. Go binary healthy (always pass since we're running)
	checks = append(checks, doctorCheck{Name: "Go binary healthy", Status: "pass"})

	// 6. Beads CLI available
	if _, err := os.Stat(filepath.Join(repoRoot, ".beads")); err == nil {
		checks = append(checks, doctorCheck{Name: "Beads initialized", Status: "pass"})
	} else {
		checks = append(checks, doctorCheck{Name: "Beads initialized", Status: "warn", Fix: "Run: bd init"})
	}

	return checks
}

// printBeadsStatus reports beads CLI and repo initialization status.
func printBeadsStatus(cmd *cobra.Command, repoRoot string) {
	// Check if bd CLI is in PATH
	bdInstalled := false
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if _, err := os.Stat(filepath.Join(dir, "bd")); err == nil {
			bdInstalled = true
			break
		}
	}

	if !bdInstalled {
		cmd.Println("  Beads: not installed")
		cmd.Println("         Install: curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash")
		return
	}

	// Check if .beads/ is initialized in this repo
	if _, err := os.Stat(filepath.Join(repoRoot, ".beads")); err == nil {
		cmd.Println("  Beads: initialized")
	} else {
		cmd.Println("  Beads: installed but not initialized in this repo")
		cmd.Println("         Run: bd init")
	}
}

func registerSetupCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(initCmd())
	rootCmd.AddCommand(setupCmd())
	rootCmd.AddCommand(doctorCmd())
}
