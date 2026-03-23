package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

func migrateFromTSCmd() *cobra.Command {
	var (
		repoRoot   string
		binaryPath string
		dryRun     bool
	)

	cmd := &cobra.Command{
		Use:   "migrate-from-ts",
		Short: "Migrate from TypeScript compound-agent to Go binary",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoRoot == "" {
				repoRoot = util.GetRepoRoot()
			}
			if binaryPath == "" {
				binaryPath = resolveBinaryPath()
			}

			return runMigration(cmd, repoRoot, binaryPath, dryRun)
		},
	}

	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root (defaults to git root)")
	cmd.Flags().StringVar(&binaryPath, "binary-path", "", "Path to Go binary (defaults to current executable)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Report what would be migrated without making changes")
	return cmd
}

// runMigration performs the TS-to-Go migration.
func runMigration(cmd *cobra.Command, repoRoot, binaryPath string, dryRun bool) error {
	indexPath := filepath.Join(repoRoot, ".claude", "lessons", "index.jsonl")

	// Step 1: Detect TS installation
	_, err := os.Stat(indexPath)
	if os.IsNotExist(err) {
		cmd.Println("No TS compound-agent installation found.")
		cmd.Println("  Missing: .claude/lessons/index.jsonl")
		cmd.Println("  Run 'ca init' to start fresh.")
		return nil
	}
	if err != nil {
		return fmt.Errorf("check index.jsonl: %w", err)
	}

	// Step 2: Validate JSONL and count lessons
	validCount, invalidCount, err := validateJSONL(indexPath)
	if err != nil {
		return fmt.Errorf("validate JSONL: %w", err)
	}

	// Step 3: Check for npx-based hooks in settings
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	npxHookCount := countNpxHooks(settingsPath)

	// Step 4: Report findings
	cmd.Println("Migration Report")
	cmd.Println("----------------------------------------")
	cmd.Printf("  Lessons: %d lesson(s) found\n", validCount)
	if invalidCount > 0 {
		cmd.Printf("  Warnings: %d invalid line(s) in JSONL (will be skipped on read)\n", invalidCount)
	}
	if npxHookCount > 0 {
		cmd.Printf("  Hooks: %d npx-based hook(s) to update\n", npxHookCount)
	} else {
		cmd.Println("  Hooks: no npx hooks found")
	}

	if dryRun {
		cmd.Println()
		cmd.Println("[dry-run] No changes made. Remove --dry-run to apply migration.")
		return nil
	}

	// Step 5: Update hooks (replace npx with Go binary path)
	if npxHookCount > 0 {
		if err := migrateHooks(settingsPath, binaryPath); err != nil {
			return fmt.Errorf("update hooks: %w", err)
		}
		cmd.Printf("\n[ok] Hooks updated to use Go binary: %s\n", binaryPath)
	}

	// Lessons use the same JSONL format -- no conversion needed
	cmd.Println("[ok] Lessons validated (no format conversion needed)")
	cmd.Println("[ok] Migration complete")
	return nil
}

// validateJSONL reads a JSONL file and returns counts of valid and invalid lines.
func validateJSONL(path string) (valid, invalid int, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var obj map[string]any
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			invalid++
			continue
		}
		// Check it has at least an id field (minimal validation)
		if _, hasID := obj["id"]; !hasID {
			invalid++
			continue
		}
		valid++
	}

	if err := scanner.Err(); err != nil {
		return valid, invalid, err
	}
	return valid, invalid, nil
}

// countNpxHooks counts how many hook commands reference "npx ca" in settings.
func countNpxHooks(settingsPath string) int {
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		return 0
	}
	hooks, ok := settings["hooks"].(map[string]any)
	if !ok {
		return 0
	}

	count := 0
	for _, hookType := range setup.HookTypes {
		arr, ok := hooks[hookType].([]any)
		if !ok {
			continue
		}
		for _, entry := range arr {
			count += countNpxInEntry(entry)
		}
	}
	return count
}

// countNpxInEntry counts npx-based hook commands within a single hook entry.
func countNpxInEntry(entry any) int {
	entryMap, ok := entry.(map[string]any)
	if !ok {
		return 0
	}
	hooksList, ok := entryMap["hooks"].([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, h := range hooksList {
		if isNpxHook(h) {
			count++
		}
	}
	return count
}

// isNpxHook reports whether a hook map entry references an npx-based command.
func isNpxHook(h any) bool {
	hMap, ok := h.(map[string]any)
	if !ok {
		return false
	}
	cmd, _ := hMap["command"].(string)
	return strings.Contains(cmd, "npx ca ") || strings.Contains(cmd, "npx compound-agent")
}

// migrateHooks reads settings.json, replaces npx-based commands with Go binary, and writes back.
func migrateHooks(settingsPath, binaryPath string) error {
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil {
		return err
	}

	// Remove all existing compound-agent hooks, then re-add with Go binary path
	setup.RemoveAllHooks(settings)
	setup.AddAllHooks(settings, binaryPath)

	return setup.WriteClaudeSettings(settingsPath, settings)
}

func registerMigrateCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(migrateFromTSCmd())
}
