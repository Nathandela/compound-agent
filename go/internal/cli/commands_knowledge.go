package cli

import (
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/knowledge"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

const MaxDisplayText = 200

func knowledgeCmd() *cobra.Command {
	var limit int
	cmd := &cobra.Command{
		Use:   "knowledge <query>",
		Short: "Search indexed documentation",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if limit < 1 {
				limit = knowledge.DefaultKnowledgeLimit
			}
			query := strings.Join(args, " ")
			repoRoot := util.GetRepoRoot()

			db, err := storage.OpenRepoKnowledgeDB(repoRoot)
			if err != nil {
				return fmt.Errorf("open knowledge db: %w", err)
			}
			defer db.Close()

			kdb := storage.NewKnowledgeDB(db)

			// Auto-index if DB is empty
			if kdb.GetChunkCount() == 0 {
				_, indexErr := knowledge.IndexDocs(repoRoot, kdb, nil)
				if indexErr != nil {
					// Warn but continue
					cmd.PrintErrln("[warn] auto-index failed:", indexErr)
				}
			}

			embedder := tryGetEmbedder(repoRoot)

			results, err := knowledge.SearchKnowledge(kdb, embedder, query, &knowledge.KnowledgeSearchOptions{Limit: limit})
			if err != nil {
				return fmt.Errorf("search: %w", err)
			}

			cmd.Print(formatKnowledgeResults(results))
			return nil
		},
	}
	cmd.Flags().IntVarP(&limit, "limit", "n", knowledge.DefaultKnowledgeLimit, "maximum results to return")
	return cmd
}

func indexDocsCmd() *cobra.Command {
	var (
		force bool
		embed bool
	)
	cmd := &cobra.Command{
		Use:   "index-docs",
		Short: "Index documentation files for knowledge search",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			db, err := storage.OpenRepoKnowledgeDB(repoRoot)
			if err != nil {
				return fmt.Errorf("open knowledge db: %w", err)
			}
			defer db.Close()

			kdb := storage.NewKnowledgeDB(db)

			opts := &knowledge.IndexOptions{
				Force: force,
			}

			result, err := knowledge.IndexDocs(repoRoot, kdb, opts)
			if err != nil {
				return fmt.Errorf("index docs: %w", err)
			}

			cmd.Print(formatIndexResult(result))

			// Embed if requested
			if embed {
				embedder := tryGetEmbedder(repoRoot)
				if embedder != nil {
					embedResult, embedErr := knowledge.EmbedChunks(kdb, embedder, nil)
					if embedErr != nil {
						cmd.PrintErrln("[warn] embedding failed:", embedErr)
					} else {
						cmd.Printf("Embedded %d chunk(s).\n", embedResult.ChunksEmbedded)
					}
				} else {
					cmd.PrintErrln("[warn] embedding daemon not available, skipping embedding.")
				}
			}

			return nil
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "force re-index all files")
	cmd.Flags().BoolVar(&embed, "embed", false, "embed chunks after indexing")
	return cmd
}

// registerKnowledgeCommands adds knowledge-related commands to the root.
func registerKnowledgeCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(knowledgeCmd())
	rootCmd.AddCommand(indexDocsCmd())
}

// --- formatting helpers ---

func formatKnowledgeResults(results []knowledge.ScoredChunkResult) string {
	if len(results) == 0 {
		return "No knowledge chunks match your query. Try indexing first: index-docs\n"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "[info] Found %d result(s):\n", len(results))

	for _, r := range results {
		text := r.Chunk.Text
		if len(text) > MaxDisplayText {
			text = text[:MaxDisplayText] + "..."
		}
		// Replace newlines with spaces for compact display
		text = strings.ReplaceAll(text, "\n", " ")

		fmt.Fprintf(&b, "\n[%s:L%d-L%d] %s\n", r.Chunk.FilePath, r.Chunk.StartLine, r.Chunk.EndLine, text)
	}
	return b.String()
}

func formatIndexResult(result *knowledge.IndexResult) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Indexed %d file(s), %d chunk(s) created", result.FilesIndexed, result.ChunksCreated)
	if result.FilesSkipped > 0 {
		fmt.Fprintf(&b, ", %d file(s) unchanged", result.FilesSkipped)
	}
	if result.ChunksDeleted > 0 {
		fmt.Fprintf(&b, ", %d stale chunk(s) removed", result.ChunksDeleted)
	}
	if result.FilesErrored > 0 {
		fmt.Fprintf(&b, ", %d file(s) errored", result.FilesErrored)
	}
	fmt.Fprintf(&b, " (%.1fs)\n", float64(result.DurationMs)/1000.0)
	return b.String()
}
