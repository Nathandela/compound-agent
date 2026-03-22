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
		skipHooks bool
		skipModel bool
		jsonOut   bool
		repoRoot  string
	)

	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize compound-agent in this repository",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoRoot == "" {
				repoRoot = util.GetRepoRoot()
			}

			result, err := setup.InitRepo(repoRoot, setup.InitOptions{
				SkipHooks:  skipHooks,
				SkipModel:  skipModel,
				BinaryPath: resolveBinaryPath(),
			})
			if err != nil {
				return fmt.Errorf("init: %w", err)
			}

			if jsonOut {
				data, _ := json.Marshal(map[string]any{
					"success":           result.Success,
					"hooksInstalled":    result.HooksInstalled,
					"dirsCreated":       len(result.DirsCreated),
					"filesCreated":      len(result.FilesCreated),
					"agentsInstalled":   result.AgentsInstalled,
					"commandsInstalled": result.CommandsInstalled,
					"skillsInstalled":   result.SkillsInstalled,
					"roleSkillsInstalled": result.RoleSkillsInstalled,
					"docsInstalled":     result.DocsInstalled,
				})
				cmd.Println(string(data))
			} else {
				cmd.Printf("[ok] Compound agent initialized in %s\n", repoRoot)
				if result.HooksInstalled {
					cmd.Println("  Hooks: installed")
				}
				cmd.Printf("  Directories: %d created\n", len(result.DirsCreated))
				totalTemplates := result.AgentsInstalled + result.CommandsInstalled +
					result.SkillsInstalled + result.RoleSkillsInstalled + result.DocsInstalled
				if totalTemplates > 0 {
					cmd.Printf("  Templates: %d installed (agents:%d commands:%d skills:%d roles:%d docs:%d)\n",
						totalTemplates, result.AgentsInstalled, result.CommandsInstalled,
						result.SkillsInstalled, result.RoleSkillsInstalled, result.DocsInstalled)
				}
				if result.AgentsMdUpdated {
					cmd.Println("  AGENTS.md: updated")
				}
				if result.ClaudeMdUpdated {
					cmd.Println("  CLAUDE.md: reference added")
				}
			}
			return nil
		},
	}

	cmd.Flags().BoolVar(&skipHooks, "skip-hooks", false, "Skip installing Claude Code hooks")
	cmd.Flags().BoolVar(&skipModel, "skip-model", false, "Skip downloading embedding model")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root (defaults to git root)")
	return cmd
}

func setupCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Setup compound-agent",
	}

	registerSetupClaudeCmd(cmd)

	// Default setup action (no subcommand): runs init + claude hooks
	var (
		skipModel bool
		skipHooks bool
		jsonOut   bool
		repoRoot  string
	)

	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		if repoRoot == "" {
			repoRoot = util.GetRepoRoot()
		}

		result, err := setup.InitRepo(repoRoot, setup.InitOptions{
			SkipHooks:  skipHooks,
			SkipModel:  skipModel,
			BinaryPath: resolveBinaryPath(),
		})
		if err != nil {
			return fmt.Errorf("setup: %w", err)
		}

		if jsonOut {
			data, _ := json.Marshal(map[string]any{
				"success":             result.Success,
				"hooksInstalled":      result.HooksInstalled,
				"agentsInstalled":     result.AgentsInstalled,
				"commandsInstalled":   result.CommandsInstalled,
				"skillsInstalled":     result.SkillsInstalled,
				"roleSkillsInstalled": result.RoleSkillsInstalled,
				"docsInstalled":       result.DocsInstalled,
			})
			cmd.Println(string(data))
		} else {
			cmd.Println("[ok] Compound agent setup complete")
			if result.HooksInstalled {
				cmd.Println("  Hooks: installed to .claude/settings.json")
			}
			totalTemplates := result.AgentsInstalled + result.CommandsInstalled +
				result.SkillsInstalled + result.RoleSkillsInstalled + result.DocsInstalled
			if totalTemplates > 0 {
				cmd.Printf("  Templates: %d installed\n", totalTemplates)
			}
		}
		return nil
	}

	cmd.Flags().BoolVar(&skipModel, "skip-model", false, "Skip downloading embedding model")
	cmd.Flags().BoolVar(&skipHooks, "skip-hooks", false, "Skip installing hooks")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root")
	return cmd
}

func registerSetupClaudeCmd(parent *cobra.Command) {
	var (
		uninstall bool
		status    bool
		global    bool
		jsonOut   bool
		repoRoot  string
	)

	cmd := &cobra.Command{
		Use:   "claude",
		Short: "Install Claude Code hooks",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoRoot == "" {
				repoRoot = util.GetRepoRoot()
			}

			settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
			displayPath := ".claude/settings.json"
			if global {
				home, _ := os.UserHomeDir()
				settingsPath = filepath.Join(home, ".claude", "settings.json")
				displayPath = "~/.claude/settings.json"
			}

			settings, err := setup.ReadClaudeSettings(settingsPath)
			if err != nil {
				return fmt.Errorf("read settings: %w", err)
			}

			alreadyInstalled := setup.HasAllHooks(settings)

			if status {
				return handleClaudeStatus(cmd, alreadyInstalled, displayPath, settingsPath, jsonOut)
			}
			if uninstall {
				return handleClaudeUninstall(cmd, settings, settingsPath, alreadyInstalled, displayPath, jsonOut)
			}
			return handleClaudeInstall(cmd, settings, settingsPath, alreadyInstalled, displayPath, jsonOut)
		},
	}

	cmd.Flags().BoolVar(&uninstall, "uninstall", false, "Remove compound-agent hooks")
	cmd.Flags().BoolVar(&status, "status", false, "Check integration status")
	cmd.Flags().BoolVar(&global, "global", false, "Use global ~/.claude/ settings")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")
	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root")

	parent.AddCommand(cmd)
}

func handleClaudeStatus(cmd *cobra.Command, installed bool, displayPath, settingsPath string, jsonOut bool) error {
	if jsonOut {
		data, _ := json.Marshal(map[string]any{
			"settingsFile":  displayPath,
			"hookInstalled": installed,
			"status":        statusLabel(installed),
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
	if installed {
		cmd.Println("  [ok] Compound Agent hooks installed")
	} else {
		cmd.Println("  [warn] Compound Agent hooks not installed")
	}
	return nil
}

func handleClaudeInstall(cmd *cobra.Command, settings map[string]any, settingsPath string, installed bool, displayPath string, jsonOut bool) error {
	if installed {
		if jsonOut {
			data, _ := json.Marshal(map[string]any{
				"installed": true,
				"location":  displayPath,
				"action":    "unchanged",
			})
			cmd.Println(string(data))
		} else {
			cmd.Printf("[info] Compound agent hooks already installed at %s\n", displayPath)
		}
		return nil
	}

	setup.AddAllHooks(settings, resolveBinaryPath())
	if err := setup.WriteClaudeSettings(settingsPath, settings); err != nil {
		return fmt.Errorf("write settings: %w", err)
	}

	if jsonOut {
		data, _ := json.Marshal(map[string]any{
			"installed": true,
			"location":  displayPath,
			"action":    "installed",
		})
		cmd.Println(string(data))
	} else {
		cmd.Printf("[ok] Claude Code hooks installed to %s\n", displayPath)
		cmd.Println("  Hooks: SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse, PreToolUse, Stop")
	}
	return nil
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

func statusLabel(installed bool) string {
	if installed {
		return "connected"
	}
	return "disconnected"
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
		checks = append(checks, doctorCheck{Name: "Claude Code hooks installed", Status: "pass"})
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

func registerSetupCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(initCmd())
	rootCmd.AddCommand(setupCmd())
	rootCmd.AddCommand(doctorCmd())
}
