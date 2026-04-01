// Package cli provides cobra command implementations for the ca CLI.
package cli

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/embed"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/retrieval"
	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

const (
	DefaultSearchLimit    = 10
	DefaultListLimit      = 20
	DefaultCheckPlanLimit = 5
	ISODatePrefixLength   = 10
	LessonCountWarning    = 20
	AgeFlagThresholdDays  = 90
)

// isQuiet returns true if the --quiet/-q global flag is set.
func isQuiet(cmd *cobra.Command) bool {
	q, _ := cmd.Root().PersistentFlags().GetBool("quiet")
	return q
}

// RegisterCommands registers all CLI subcommands on the root cobra command.
func RegisterCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(searchCmd())
	rootCmd.AddCommand(listCmd())
	rootCmd.AddCommand(loadSessionCmd())
	rootCmd.AddCommand(checkPlanCmd())
	registerCrudCommands(rootCmd)
	registerCaptureCommands(rootCmd)
	registerMaintenanceCommands(rootCmd)
	registerKnowledgeCommands(rootCmd)
	registerInfoCommands(rootCmd)
	registerSetupCommands(rootCmd)
	registerAdvancedCommands(rootCmd)
	registerScriptCommands(rootCmd)
	registerMigrateCommands(rootCmd)
	registerPhaseCommands(rootCmd)
	registerHealthCommands(rootCmd)
}

// --- search command ---

func searchCmd() *cobra.Command {
	var limit int
	cmd := &cobra.Command{
		Use:   "search <query>",
		Short: "Search lessons by keyword or semantic similarity",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if limit < 1 {
				limit = DefaultSearchLimit
			}
			return runSearch(cmd, args, limit)
		},
	}
	cmd.Flags().IntVarP(&limit, "limit", "n", DefaultSearchLimit, "maximum results to return")
	return cmd
}

// runSearch executes the search command logic.
func runSearch(cmd *cobra.Command, args []string, limit int) error {
	query := strings.Join(args, " ")
	repoRoot := util.GetRepoRoot()

	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if _, err := storage.SyncIfNeeded(db, repoRoot, false); err != nil {
		return fmt.Errorf("sync: %w", err)
	}

	embedder, closeEmbedder := getOrStartEmbedder(repoRoot)
	defer closeEmbedder()

	items, err := executeSearch(db, embedder, query, limit, repoRoot)
	if err != nil {
		return err
	}

	cmd.Print(formatSearchResults(items))
	return nil
}

// executeSearch performs hybrid or keyword-only search depending on embedder availability.
func executeSearch(db *sql.DB, embedder search.Embedder, query string, limit int, repoRoot string) ([]memory.Item, error) {
	if embedder != nil {
		return executeHybridSearch(db, embedder, query, limit, repoRoot)
	}
	sdb := storage.NewSearchDB(db)
	items, err := sdb.SearchKeyword(query, limit, "")
	if err != nil {
		return nil, fmt.Errorf("keyword search: %w", err)
	}
	return items, nil
}

// executeHybridSearch runs vector + keyword search and merges results.
func executeHybridSearch(db *sql.DB, embedder search.Embedder, query string, limit int, repoRoot string) ([]memory.Item, error) {
	candidateLimit := limit * search.CandidateMultiplier

	vecResults, vecErr := search.Vector(db, embedder, query, candidateLimit, repoRoot)

	sdb := storage.NewSearchDB(db)
	kwScored, kwErr := sdb.SearchKeywordScored(query, candidateLimit, "")
	if kwErr != nil {
		return nil, fmt.Errorf("keyword search: %w", kwErr)
	}

	kwItems := make([]search.ScoredItem, len(kwScored))
	for i, r := range kwScored {
		kwItems[i] = search.ScoredItem{Item: r.Item, Score: r.Score}
	}

	var merged []search.ScoredItem
	if vecErr != nil {
		merged = kwItems
	} else {
		merged = search.MergeHybridScores(vecResults, kwItems, &search.HybridMergeOptions{
			MinScore: search.MinHybridScore,
		})
	}

	ranked := search.RankItems(merged)
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}

	items := make([]memory.Item, len(ranked))
	for i, r := range ranked {
		items[i] = r.Item
	}
	return items, nil
}

// --- list command ---

func listCmd() *cobra.Command {
	var (
		limit       int
		invalidated bool
	)
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}

			var filtered []memory.Item
			for _, item := range result.Items {
				isInvalidated := item.InvalidatedAt != nil
				if invalidated == isInvalidated {
					filtered = append(filtered, item)
				}
			}

			total := len(filtered)
			if limit > 0 && len(filtered) > limit {
				filtered = filtered[:limit]
			}

			cmd.Print(formatListResults(filtered, total, result.SkippedCount))
			return nil
		},
	}
	cmd.Flags().IntVarP(&limit, "limit", "n", DefaultListLimit, "maximum items to show")
	cmd.Flags().BoolVar(&invalidated, "invalidated", false, "show only invalidated lessons")
	return cmd
}

// --- load-session command ---

func loadSessionCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:   "load-session",
		Short: "Load high-severity lessons for session context",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			lessons, err := retrieval.LoadSessionLessons(repoRoot, 5)
			if err != nil {
				return fmt.Errorf("load session lessons: %w", err)
			}

			allResult, err := memory.ReadItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read all lessons: %w", err)
			}
			totalCount := len(allResult.Items)

			if jsonOut {
				out, err := formatSessionJSON(lessons, totalCount)
				if err != nil {
					return err
				}
				cmd.Println(out)
			} else {
				cmd.Print(formatSessionHuman(lessons, totalCount))
				if setup.ShouldShowHint(repoRoot) {
					cmd.Printf("\n%s", setup.WorkflowHint())
					_ = setup.MarkHintShown(repoRoot)
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

// --- check-plan command ---

func checkPlanCmd() *cobra.Command {
	var (
		planText string
		jsonOut  bool
		limit    int
	)
	cmd := &cobra.Command{
		Use:   "check-plan",
		Short: "Check a plan against learned lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			if limit < 1 {
				limit = DefaultCheckPlanLimit
			}
			resolved, err := resolvePlanText(planText)
			if err != nil {
				return err
			}
			return runCheckPlan(cmd, resolved, jsonOut, limit)
		},
	}
	cmd.Flags().StringVar(&planText, "plan", "", "plan text to check")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	cmd.Flags().IntVarP(&limit, "limit", "n", DefaultCheckPlanLimit, "maximum lessons to return")
	return cmd
}

// resolvePlanText returns the plan text from the flag or stdin.
func resolvePlanText(planText string) (string, error) {
	if planText == "" {
		fi, _ := os.Stdin.Stat()
		if fi != nil && (fi.Mode()&os.ModeCharDevice) == 0 {
			text, err := util.ReadStdinFrom(os.Stdin, 5*time.Second, 1024*1024)
			if err != nil {
				return "", fmt.Errorf("read stdin: %w", err)
			}
			planText = strings.TrimSpace(text)
		}
	}
	if planText == "" {
		return "", fmt.Errorf("no plan provided; use --plan <text> or pipe text to stdin")
	}
	return planText, nil
}

// runCheckPlan executes the check-plan command logic.
func runCheckPlan(cmd *cobra.Command, planText string, jsonOut bool, limit int) error {
	repoRoot := util.GetRepoRoot()

	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if _, err := storage.SyncIfNeeded(db, repoRoot, false); err != nil {
		return fmt.Errorf("sync: %w", err)
	}

	embedder, closeEmbedder := getOrStartEmbedder(repoRoot)
	defer closeEmbedder()

	result, err := retrieval.RetrieveForPlan(db, repoRoot, embedder, planText, limit)
	if err != nil {
		return fmt.Errorf("retrieve: %w", err)
	}

	if jsonOut {
		out, err := formatCheckPlanJSON(result.Lessons)
		if err != nil {
			return err
		}
		cmd.Println(out)
	} else {
		cmd.Print(formatCheckPlanHuman(result.Lessons))
	}
	return nil
}

// --- embedder adapter ---

type embedderAdapter struct {
	client *embed.Client
}

func (a *embedderAdapter) Embed(texts []string) ([][]float64, error) {
	resp, err := a.client.Embed(texts)
	if err != nil {
		return nil, err
	}
	if resp.IsError() {
		return nil, fmt.Errorf("daemon error: %s", resp.Error)
	}
	return resp.Vectors, nil
}

// noopClose is a no-op cleanup function for when no embedder was started.
func noopClose() {}

// getOrStartEmbedder connects to the embed daemon, starting it if needed.
// Returns (nil, noopClose) if the daemon binary or model files are unavailable.
// The caller should defer the returned closer to release the connection.
func getOrStartEmbedder(repoRoot string) (search.Embedder, func()) {
	// Fast path: try connecting to an already-running daemon
	sockPath := embed.SocketPath(repoRoot)
	client, err := embed.NewClient(sockPath, 500*time.Millisecond)
	if err == nil {
		resp, err := client.Health()
		if err == nil && resp.Status == "ok" {
			return &embedderAdapter{client: client}, func() { client.Close() }
		}
		client.Close()
	}

	// Slow path: find model files and start daemon via EnsureDaemon
	modelPath, tokenizerPath := embed.FindModelFiles(repoRoot)
	if modelPath == "" || tokenizerPath == "" {
		return nil, noopClose
	}

	client, err = embed.EnsureDaemon(repoRoot, modelPath, tokenizerPath)
	if err != nil {
		slog.Warn("embed daemon failed, falling back to keyword search", "error", err)
		return nil, noopClose
	}
	return &embedderAdapter{client: client}, func() { client.Close() }
}

// --- formatting helpers ---

func formatSource(s memory.Source) string {
	return strings.ReplaceAll(string(s), "_", " ")
}

func datePrefix(created string) string {
	if len(created) >= ISODatePrefixLength {
		return created[:ISODatePrefixLength]
	}
	return created
}

func formatSearchResults(items []memory.Item) string {
	if len(items) == 0 {
		return "No lessons match your search. Try a different query or use \"list\" to see all lessons.\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "[info] Found %d lesson(s):\n", len(items))

	for _, item := range items {
		fmt.Fprintf(&b, "\n[%s] %s\n", item.ID, item.Insight)
		fmt.Fprintf(&b, "  Trigger: %s\n", item.Trigger)
		if len(item.Tags) > 0 {
			fmt.Fprintf(&b, "  Tags: %s\n", strings.Join(item.Tags, ", "))
		}
	}
	return b.String()
}

func formatListResults(items []memory.Item, total int, skippedCount int) string {
	var b strings.Builder

	if len(items) == 0 {
		b.WriteString("No lessons found. Get started with: learn \"Your first lesson\"\n")
	} else {
		fmt.Fprintf(&b, "[info] Showing %d of %d item(s):\n", len(items), total)
		for _, item := range items {
			fmt.Fprintf(&b, "\n[%s] %s\n", item.ID, item.Insight)
			fmt.Fprintf(&b, "  Type: %s | Source: %s\n", item.Type, formatSource(item.Source))
			if len(item.Tags) > 0 {
				fmt.Fprintf(&b, "  Tags: %s\n", strings.Join(item.Tags, ", "))
			}
		}
	}

	if skippedCount > 0 {
		fmt.Fprintf(&b, "\n[warn] %d corrupted lesson(s) skipped.\n", skippedCount)
	}
	return b.String()
}

func formatSessionHuman(items []memory.Item, totalCount int) string {
	if len(items) == 0 {
		return "No high-severity lessons found. Run `ca learn \"<insight>\"` to capture your first lesson.\n"
	}

	var b strings.Builder
	b.WriteString("## Lessons from Past Sessions\n\n")
	b.WriteString("These lessons were captured from previous corrections and should inform your work:\n\n")

	for i, item := range items {
		tags := ""
		if len(item.Tags) > 0 {
			tags = " (" + strings.Join(item.Tags, ", ") + ")"
		}
		fmt.Fprintf(&b, "%d. **%s**%s\n", i+1, item.Insight, tags)
		fmt.Fprintf(&b, "   Learned: %s via %s\n\n", datePrefix(item.Created), formatSource(item.Source))
	}

	if totalCount > LessonCountWarning {
		fmt.Fprintf(&b, "[info] %d lessons in index. Consider `ca compact` to reduce context pollution.\n", totalCount)
	}

	oldCount := countOldLessons(items)
	if oldCount > 0 {
		fmt.Fprintf(&b, "[warn] %d lesson(s) are over 90 days old. Review for continued validity.\n", oldCount)
	}

	return b.String()
}

func formatSessionJSON(items []memory.Item, totalCount int) (string, error) {
	data := struct {
		Lessons    []memory.Item `json:"lessons"`
		Count      int           `json:"count"`
		TotalCount int           `json:"totalCount"`
	}{
		Lessons:    items,
		Count:      len(items),
		TotalCount: totalCount,
	}
	if data.Lessons == nil {
		data.Lessons = []memory.Item{}
	}
	out, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshal session JSON: %w", err)
	}
	return string(out), nil
}

func formatCheckPlanHuman(ranked []search.RankedItem) string {
	if len(ranked) == 0 {
		return "No relevant lessons found for this plan.\n"
	}

	var b strings.Builder
	b.WriteString("## Lessons Check\n\n")
	b.WriteString("Relevant to your plan:\n\n")

	for i, r := range ranked {
		fmt.Fprintf(&b, "%d. [%s] %s\n", i+1, r.Item.ID, r.Item.Insight)
		fmt.Fprintf(&b, "   - Source: %s\n\n", formatSource(r.Item.Source))
	}

	b.WriteString("---\nConsider these lessons while implementing.\n")
	return b.String()
}

func formatCheckPlanJSON(ranked []search.RankedItem) (string, error) {
	type lessonJSON struct {
		ID        string  `json:"id"`
		Insight   string  `json:"insight"`
		RankScore float64 `json:"rankScore"`
		Source    string  `json:"source"`
	}
	lessons := make([]lessonJSON, len(ranked))
	for i, r := range ranked {
		lessons[i] = lessonJSON{
			ID:        r.Item.ID,
			Insight:   r.Item.Insight,
			RankScore: r.FinalScore,
			Source:    string(r.Item.Source),
		}
	}
	data := struct {
		Lessons []lessonJSON `json:"lessons"`
		Count   int          `json:"count"`
	}{
		Lessons: lessons,
		Count:   len(lessons),
	}
	out, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshal check-plan JSON: %w", err)
	}
	return string(out), nil
}

func countOldLessons(items []memory.Item) int {
	threshold := time.Now().AddDate(0, 0, -AgeFlagThresholdDays)
	count := 0
	for _, item := range items {
		created, err := time.Parse(time.RFC3339, item.Created)
		if err != nil {
			continue
		}
		if created.Before(threshold) {
			count++
		}
	}
	return count
}
