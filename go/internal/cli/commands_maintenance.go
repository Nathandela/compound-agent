// Package cli — maintenance commands: compact, rebuild, stats, export, import, prime, clean-lessons.
package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/retrieval"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// registerMaintenanceCommands registers compact, rebuild, stats, export, import, prime, clean-lessons.
func registerMaintenanceCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(compactCmd())
	rootCmd.AddCommand(rebuildCmd())
	rootCmd.AddCommand(statsCmd())
	rootCmd.AddCommand(exportCmd())
	rootCmd.AddCommand(importCmd())
	rootCmd.AddCommand(primeCmd())
	rootCmd.AddCommand(cleanLessonsCmd())
}

// --- compact command ---

func compactCmd() *cobra.Command {
	var (
		force  bool
		dryRun bool
	)
	cmd := &cobra.Command{
		Use:   "compact",
		Short: "Remove tombstones and rewrite JSONL",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			count, err := memory.CountTombstones(repoRoot)
			if err != nil {
				return fmt.Errorf("count tombstones: %w", err)
			}

			if dryRun {
				needed := count >= memory.TombstoneThreshold
				status := "needed"
				if !needed {
					status = "not needed"
				}
				cmd.Printf("Compaction %s (%d tombstones, threshold is %d).\n", status, count, memory.TombstoneThreshold)
				return nil
			}

			if !force && count < memory.TombstoneThreshold {
				cmd.Printf("Compaction not needed (%d tombstones, threshold is %d).\n", count, memory.TombstoneThreshold)
				return nil
			}

			result, err := memory.Compact(repoRoot)
			if err != nil {
				return fmt.Errorf("compact: %w", err)
			}

			cmd.Printf("Compacted: %d tombstones removed, %d lessons remaining", result.TombstonesRemoved, result.LessonsRemaining)
			if result.DroppedInvalid > 0 {
				cmd.Printf(", %d invalid dropped", result.DroppedInvalid)
			}
			cmd.Println(".")

			db, err := storage.OpenRepoDB(repoRoot)
			if err != nil {
				return fmt.Errorf("open database: %w", err)
			}
			defer db.Close()

			if err := storage.RebuildIndex(db, repoRoot); err != nil {
				return fmt.Errorf("rebuild index: %w", err)
			}
			cmd.Println("SQLite index rebuilt.")

			return nil
		},
	}
	cmd.Flags().BoolVarP(&force, "force", "f", false, "force compaction even below threshold")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "show tombstone count without compacting")
	return cmd
}

// --- rebuild command ---

func rebuildCmd() *cobra.Command {
	var force bool
	cmd := &cobra.Command{
		Use:   "rebuild",
		Short: "Rebuild SQLite index from JSONL",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			db, err := storage.OpenRepoDB(repoRoot)
			if err != nil {
				return fmt.Errorf("open database: %w", err)
			}
			defer db.Close()

			if force {
				if err := storage.RebuildIndex(db, repoRoot); err != nil {
					return fmt.Errorf("rebuild: %w", err)
				}
				cmd.Println("Rebuilt SQLite index from JSONL.")
			} else {
				rebuilt, err := storage.SyncIfNeeded(db, repoRoot, false)
				if err != nil {
					return fmt.Errorf("sync: %w", err)
				}
				if rebuilt {
					cmd.Println("Rebuilt SQLite index from JSONL.")
				} else {
					cmd.Println("SQLite index is up to date.")
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVarP(&force, "force", "f", false, "force rebuild even if up to date")
	return cmd
}

// --- stats command ---

func statsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stats",
		Short: "Show database health and statistics",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			tombstones, err := memory.CountTombstones(repoRoot)
			if err != nil {
				return fmt.Errorf("count tombstones: %w", err)
			}

			items := result.Items
			totalItems := len(items)

			// Type breakdown
			typeCounts := make(map[memory.MemoryItemType]int)
			for _, item := range items {
				typeCounts[item.Type]++
			}

			// Age breakdown
			now := time.Now()
			var under30, between30_90, over90 int
			for _, item := range items {
				created, parseErr := time.Parse(time.RFC3339, item.Created)
				if parseErr != nil {
					over90++
					continue
				}
				days := int(now.Sub(created).Hours() / 24)
				switch {
				case days < 30:
					under30++
				case days <= 90:
					between30_90++
				default:
					over90++
				}
			}

			// Total retrieval count
			totalRetrievals := 0
			for _, item := range items {
				if item.RetrievalCount != nil {
					totalRetrievals += *item.RetrievalCount
				}
			}

			// File sizes
			jsonlPath := filepath.Join(repoRoot, memory.LessonsPath)
			jsonlSize := fileSize(jsonlPath)
			sqlitePath := filepath.Join(repoRoot, storage.DBPath)
			sqliteSize := fileSize(sqlitePath)

			var b strings.Builder
			fmt.Fprintf(&b, "Lessons:     %d\n", totalItems)
			fmt.Fprintf(&b, "Tombstones:  %d\n", tombstones)
			if result.SkippedCount > 0 {
				fmt.Fprintf(&b, "Corrupted:   %d\n", result.SkippedCount)
			}

			// Show type breakdown only if multiple types or non-lesson types
			if len(typeCounts) > 1 || (len(typeCounts) == 1 && typeCounts[memory.TypeLesson] == 0) {
				fmt.Fprintf(&b, "\nType breakdown:\n")
				for typ, count := range typeCounts {
					fmt.Fprintf(&b, "  %s: %d\n", typ, count)
				}
			}

			fmt.Fprintf(&b, "\nAge breakdown:\n")
			fmt.Fprintf(&b, "  <30d:   %d\n", under30)
			fmt.Fprintf(&b, "  30-90d: %d\n", between30_90)
			fmt.Fprintf(&b, "  >90d:   %d\n", over90)

			fmt.Fprintf(&b, "\nRetrievals:  %d total\n", totalRetrievals)

			fmt.Fprintf(&b, "\nStorage:\n")
			fmt.Fprintf(&b, "  JSONL:  %s\n", formatBytes(jsonlSize))
			fmt.Fprintf(&b, "  SQLite: %s\n", formatBytes(sqliteSize))

			cmd.Print(b.String())
			return nil
		},
	}
	return cmd
}

// --- export command ---

func exportCmd() *cobra.Command {
	var (
		since string
		tags  string
	)
	cmd := &cobra.Command{
		Use:   "export",
		Short: "Export lessons as JSONL to stdout",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			var sinceTime time.Time
			hasSince := since != ""
			if hasSince {
				sinceTime, err = time.Parse(time.RFC3339, since)
				if err != nil {
					sinceTime, err = time.Parse("2006-01-02", since)
					if err != nil {
						return fmt.Errorf("invalid --since date %q (use ISO8601 format)", since)
					}
				}
			}

			var tagFilter []string
			hasTags := tags != ""
			if hasTags {
				for _, t := range strings.Split(tags, ",") {
					tag := strings.TrimSpace(t)
					if tag != "" {
						tagFilter = append(tagFilter, tag)
					}
				}
			}

			for _, item := range result.Items {
				if hasSince {
					created, parseErr := time.Parse(time.RFC3339, item.Created)
					if parseErr != nil {
						continue
					}
					if created.Before(sinceTime) {
						continue
					}
				}

				if hasTags && !matchesAnyTag(item.Tags, tagFilter) {
					continue
				}

				data, marshalErr := json.Marshal(item)
				if marshalErr != nil {
					continue
				}
				cmd.Println(string(data))
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&since, "since", "", "only export items created after this date (ISO8601)")
	cmd.Flags().StringVar(&tags, "tags", "", "filter by tags (comma-separated, OR logic)")
	return cmd
}

// --- import command ---

func importCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "import <file>",
		Short: "Import lessons from a JSONL file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			filePath := args[0]
			repoRoot := util.GetRepoRoot()

			f, err := os.Open(filePath)
			if err != nil {
				return fmt.Errorf("open import file: %w", err)
			}
			defer f.Close()

			existing, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read existing: %w", err)
			}
			existingIDs := make(map[string]bool, len(existing.Items))
			for _, item := range existing.Items {
				existingIDs[item.ID] = true
			}

			var imported, skipped, invalid int

			scanner := bufio.NewScanner(f)
			scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" {
					continue
				}

				var item memory.MemoryItem
				if err := json.Unmarshal([]byte(line), &item); err != nil {
					invalid++
					continue
				}

				if err := memory.ValidateMemoryItem(&item); err != nil {
					invalid++
					continue
				}

				if existingIDs[item.ID] {
					skipped++
					continue
				}

				if err := memory.AppendMemoryItem(repoRoot, item); err != nil {
					return fmt.Errorf("write item %s: %w", item.ID, err)
				}
				existingIDs[item.ID] = true
				imported++
			}

			if err := scanner.Err(); err != nil {
				return fmt.Errorf("read import file: %w", err)
			}

			cmd.Printf("Imported %d lessons (%d skipped, %d invalid).\n", imported, skipped, invalid)
			return nil
		},
	}
	return cmd
}

// --- prime command ---

const trustLanguage = `# Compound Agent Active

> **Context Recovery**: Run ` + "`npx ca prime`" + ` after compaction, clear, or new session

## CLI Commands (ALWAYS USE THESE)

**You MUST use CLI commands for lesson management:**

| Command | Purpose |
|---------|---------|
| ` + "`npx ca search \"query\"`" + ` | Search lessons - MUST call before architectural decisions; use anytime you need context |
| ` + "`npx ca knowledge \"query\"`" + ` | Semantic search over project docs - MUST call before architectural decisions; use keyword phrases, not questions |
| ` + "`npx ca learn \"insight\"`" + ` | Capture lessons - call AFTER corrections or discoveries |

## Core Constraints

**Default**: Use CLI commands for lesson management
**Prohibited**: NEVER edit .claude/lessons/ files directly

**Default**: Propose lessons freely after corrections
**Prohibited**: NEVER propose without quality gate (novel + specific; prefer actionable)

## Retrieval Protocol

You MUST call ` + "`npx ca search`" + ` and ` + "`npx ca knowledge`" + ` BEFORE:
- Architectural decisions or complex planning
- Implementing patterns you've done before in this repo

**NEVER skip search for complex decisions.** Past mistakes will repeat.

Beyond mandatory triggers, use these commands freely — they are lightweight queries, not heavyweight operations. Uncertain about a pattern? ` + "`ca search`" + `. Need a detail from the docs? ` + "`ca knowledge`" + `. The cost of an unnecessary search is near-zero; the cost of a missed one can be hours.

## Capture Protocol

Run ` + "`npx ca learn`" + ` AFTER:
- User corrects you ("no", "wrong", "actually...")
- You self-correct after iteration failures
- Test fails then you fix it

**Quality gate** (must pass before capturing):
- Novel (not already stored)
- Specific (clear guidance)
- Actionable (preferred, not mandatory)

**Workflow**: Search BEFORE deciding, capture AFTER learning.
`

func primeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "prime",
		Short: "Context recovery output for Claude Code",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			cmd.Print(trustLanguage)

			lessons, err := retrieval.LoadSessionLessons(repoRoot, 5)
			if err != nil {
				return fmt.Errorf("load session lessons: %w", err)
			}

			if len(lessons) > 0 {
				cmd.Print("\n# [CRITICAL] Mandatory Recall\n\n")
				for _, item := range lessons {
					tags := ""
					if len(item.Tags) > 0 {
						tags = strings.Join(item.Tags, ", ")
					}
					cmd.Printf("- **%s** (%s)\n  Learned: %s via %s\n", item.Insight, tags, datePrefix(item.Created), formatSource(item.Source))
				}
			}

			return nil
		},
	}
	return cmd
}

// --- clean-lessons command ---

func cleanLessonsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "clean-lessons",
		Short: "Detect semantic duplicates among lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.Println("Embedding model not available. Cannot check for semantic duplicates.")
			return nil
		},
	}
	return cmd
}

// --- helpers ---

func formatBytes(b int64) string {
	const (
		KB = 1024
		MB = KB * 1024
	)
	switch {
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func matchesAnyTag(itemTags, filterTags []string) bool {
	tagSet := make(map[string]bool, len(itemTags))
	for _, t := range itemTags {
		tagSet[t] = true
	}
	for _, ft := range filterTags {
		if tagSet[ft] {
			return true
		}
	}
	return false
}
