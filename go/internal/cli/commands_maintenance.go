// Package cli — maintenance commands: compact, rebuild, stats, export, import, prime.
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

// registerMaintenanceCommands registers compact, rebuild, stats, export, import, prime.
func registerMaintenanceCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(compactCmd())
	rootCmd.AddCommand(rebuildCmd())
	rootCmd.AddCommand(statsCmd())
	rootCmd.AddCommand(exportCmd())
	rootCmd.AddCommand(importCmd())
	rootCmd.AddCommand(primeCmd())
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
			return runCompact(cmd, force, dryRun)
		},
	}
	cmd.Flags().BoolVarP(&force, "force", "f", false, "force compaction even below threshold")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "show tombstone count without compacting")
	return cmd
}

// runCompact executes the compact command logic.
func runCompact(cmd *cobra.Command, force, dryRun bool) error {
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

	return rebuildAfterCompact(cmd, repoRoot)
}

// rebuildAfterCompact opens the DB and rebuilds the index after compaction.
func rebuildAfterCompact(cmd *cobra.Command, repoRoot string) error {
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
			return runStats(cmd)
		},
	}
	return cmd
}

// statsData holds collected statistics for formatting.
type statsData struct {
	totalItems      int
	tombstones      int
	skippedCount    int
	typeCounts      map[memory.ItemType]int
	under30         int
	between30_90    int
	over90          int
	unknownAge      int
	totalRetrievals int
	jsonlSize       int64
	sqliteSize      int64
}

// runStats executes the stats command logic.
func runStats(cmd *cobra.Command) error {
	repoRoot := util.GetRepoRoot()

	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read lessons: %w", err)
	}

	tombstones, err := memory.CountTombstones(repoRoot)
	if err != nil {
		return fmt.Errorf("count tombstones: %w", err)
	}

	stats := collectStats(repoRoot, result.Items, tombstones, result.SkippedCount)
	cmd.Print(formatStats(stats))
	return nil
}

// collectStats gathers all statistics from items into a statsData struct.
func collectStats(repoRoot string, items []memory.Item, tombstones, skippedCount int) statsData {
	s := statsData{
		totalItems:   len(items),
		tombstones:   tombstones,
		skippedCount: skippedCount,
		typeCounts:   make(map[memory.ItemType]int),
	}

	now := time.Now()
	for _, item := range items {
		s.typeCounts[item.Type]++
		if item.RetrievalCount != nil {
			s.totalRetrievals += *item.RetrievalCount
		}
		created, parseErr := time.Parse(time.RFC3339, item.Created)
		if parseErr != nil {
			s.unknownAge++
			continue
		}
		days := int(now.Sub(created).Hours() / 24)
		switch {
		case days < 30:
			s.under30++
		case days <= 90:
			s.between30_90++
		default:
			s.over90++
		}
	}

	s.jsonlSize = fileSize(filepath.Join(repoRoot, memory.LessonsPath))
	s.sqliteSize = fileSize(filepath.Join(repoRoot, storage.DBPath))
	return s
}

// formatStats renders statsData into a human-readable string.
func formatStats(s statsData) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Lessons:     %d\n", s.totalItems)
	fmt.Fprintf(&b, "Tombstones:  %d\n", s.tombstones)
	if s.skippedCount > 0 {
		fmt.Fprintf(&b, "Corrupted:   %d\n", s.skippedCount)
	}

	if len(s.typeCounts) > 1 || (len(s.typeCounts) == 1 && s.typeCounts[memory.TypeLesson] == 0) {
		fmt.Fprintf(&b, "\nType breakdown:\n")
		for typ, count := range s.typeCounts {
			fmt.Fprintf(&b, "  %s: %d\n", typ, count)
		}
	}

	fmt.Fprintf(&b, "\nAge breakdown:\n")
	fmt.Fprintf(&b, "  <30d:   %d\n", s.under30)
	fmt.Fprintf(&b, "  30-90d: %d\n", s.between30_90)
	fmt.Fprintf(&b, "  >90d:   %d\n", s.over90)
	if s.unknownAge > 0 {
		fmt.Fprintf(&b, "  unknown: %d\n", s.unknownAge)
	}

	fmt.Fprintf(&b, "\nRetrievals:  %d total\n", s.totalRetrievals)
	fmt.Fprintf(&b, "\nStorage:\n")
	fmt.Fprintf(&b, "  JSONL:  %s\n", formatBytes(s.jsonlSize))
	fmt.Fprintf(&b, "  SQLite: %s\n", formatBytes(s.sqliteSize))
	return b.String()
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
			return runExport(cmd, since, tags)
		},
	}
	cmd.Flags().StringVar(&since, "since", "", "only export items created after this date (ISO8601)")
	cmd.Flags().StringVar(&tags, "tags", "", "filter by tags (comma-separated, OR logic)")
	return cmd
}

// runExport executes the export command logic.
func runExport(cmd *cobra.Command, since, tags string) error {
	repoRoot := util.GetRepoRoot()

	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read lessons: %w", err)
	}

	sinceTime, hasSince, err := parseSinceFlag(since)
	if err != nil {
		return err
	}

	tagFilter := parseTagFilter(tags)

	skippedDate, skippedMarshal := exportItems(cmd, result.Items, sinceTime, hasSince, tagFilter)
	if skippedDate > 0 || skippedMarshal > 0 {
		cmd.PrintErrln(fmt.Sprintf("[warn] Export skipped %d unparseable date(s), %d marshal error(s)", skippedDate, skippedMarshal))
	}
	return nil
}

// parseSinceFlag parses the --since flag value into a time, returning whether the flag was set.
func parseSinceFlag(since string) (time.Time, bool, error) {
	if since == "" {
		return time.Time{}, false, nil
	}
	t, err := time.Parse(time.RFC3339, since)
	if err != nil {
		t, err = time.Parse("2006-01-02", since)
		if err != nil {
			return time.Time{}, false, fmt.Errorf("invalid --since date %q (use ISO8601 format)", since)
		}
	}
	return t, true, nil
}

// parseTagFilter splits a comma-separated tag string into a slice.
func parseTagFilter(tags string) []string {
	if tags == "" {
		return nil
	}
	var result []string
	for _, t := range strings.Split(tags, ",") {
		tag := strings.TrimSpace(t)
		if tag != "" {
			result = append(result, tag)
		}
	}
	return result
}

// exportItems writes matching items as JSONL and returns counts of skipped items.
func exportItems(cmd *cobra.Command, items []memory.Item, sinceTime time.Time, hasSince bool, tagFilter []string) (skippedDate, skippedMarshal int) {
	hasTags := len(tagFilter) > 0
	for _, item := range items {
		if hasSince {
			created, parseErr := time.Parse(time.RFC3339, item.Created)
			if parseErr != nil {
				skippedDate++
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
			skippedMarshal++
			continue
		}
		cmd.Println(string(data))
	}
	return skippedDate, skippedMarshal
}

// --- import command ---

func importCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "import <file>",
		Short: "Import lessons from a JSONL file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runImport(cmd, args[0])
		},
	}
	return cmd
}

// runImport executes the import command logic.
func runImport(cmd *cobra.Command, filePath string) error {
	repoRoot := util.GetRepoRoot()

	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open import file: %w", err)
	}
	defer f.Close()

	existingIDs, err := loadExistingIDs(repoRoot)
	if err != nil {
		return err
	}

	imported, skipped, invalid, err := importItems(repoRoot, f, existingIDs)
	if err != nil {
		return err
	}

	cmd.Printf("Imported %d lessons (%d skipped, %d invalid).\n", imported, skipped, invalid)
	return nil
}

// loadExistingIDs reads existing items and returns a set of their IDs.
func loadExistingIDs(repoRoot string) (map[string]bool, error) {
	existing, err := memory.ReadItems(repoRoot)
	if err != nil {
		return nil, fmt.Errorf("read existing: %w", err)
	}
	ids := make(map[string]bool, len(existing.Items))
	for _, item := range existing.Items {
		ids[item.ID] = true
	}
	return ids, nil
}

// importItems reads JSONL lines from r, validates and appends new items, returning counts.
func importItems(repoRoot string, f *os.File, existingIDs map[string]bool) (imported, skipped, invalid int, err error) {
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var item memory.Item
		if jsonErr := json.Unmarshal([]byte(line), &item); jsonErr != nil {
			invalid++
			continue
		}

		if valErr := memory.ValidateItem(&item); valErr != nil {
			invalid++
			continue
		}

		if existingIDs[item.ID] {
			skipped++
			continue
		}

		if appendErr := memory.AppendItem(repoRoot, item); appendErr != nil {
			return imported, skipped, invalid, fmt.Errorf("write item %s: %w", item.ID, appendErr)
		}
		existingIDs[item.ID] = true
		imported++
	}

	if scanErr := scanner.Err(); scanErr != nil {
		return imported, skipped, invalid, fmt.Errorf("read import file: %w", scanErr)
	}

	return imported, skipped, invalid, nil
}

// --- prime command ---

const trustLanguage = `# Compound Agent Active

> **Context Recovery**: Run ` + "`ca prime`" + ` after compaction, clear, or new session

## CLI Commands (ALWAYS USE THESE)

**You MUST use CLI commands for lesson management:**

| Command | Purpose |
|---------|---------|
| ` + "`ca search \"query\"`" + ` | Search lessons - MUST call before architectural decisions; use anytime you need context |
| ` + "`ca learn \"insight\"`" + ` | Capture lessons - call AFTER corrections or discoveries |

## Core Constraints

**Default**: Use CLI commands for lesson management
**Prohibited**: NEVER edit .claude/lessons/ files directly

**Default**: Propose lessons freely after corrections
**Prohibited**: NEVER propose without quality gate (novel + specific; prefer actionable)

## Retrieval Protocol

You MUST call ` + "`ca search`" + ` BEFORE:
- Architectural decisions or complex planning
- Implementing patterns you've done before in this repo

**NEVER skip search for complex decisions.** Past mistakes will repeat.

Beyond mandatory triggers, use these commands freely — they are lightweight queries, not heavyweight operations. Uncertain about a pattern? ` + "`ca search`" + `. The cost of an unnecessary search is near-zero; the cost of a missed one can be hours.

## Capture Protocol

Run ` + "`ca learn`" + ` AFTER:
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
