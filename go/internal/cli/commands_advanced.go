package cli

import (
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/compound"
	"github.com/nathandelacretaz/compound-agent/internal/embed"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

func compoundCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "compound",
		Short: "Synthesize cross-cutting patterns from lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runCompound(cmd)
		},
	}
}

// runCompound executes the compound command logic.
func runCompound(cmd *cobra.Command) error {
	repoRoot := util.GetRepoRoot()

	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read lessons: %w", err)
	}
	items := result.Items
	if len(items) == 0 {
		cmd.Println("Synthesized 0 patterns from 0 lessons.")
		return nil
	}

	embedder, closeEmbedder := getOrStartEmbedder(repoRoot)
	defer closeEmbedder()
	if embedder == nil {
		cmd.Println("[warn] Embedding daemon not available. Using keyword-based clustering is not supported.")
		cmd.Println("Start the daemon or run: ca download-model")
		return compoundFromCache(cmd, repoRoot, items)
	}

	return compoundWithEmbedder(cmd, repoRoot, items, embedder)
}

// compoundWithEmbedder uses a live embedder to compute vectors and synthesize patterns.
func compoundWithEmbedder(cmd *cobra.Command, repoRoot string, items []memory.Item, embedder search.Embedder) error {
	texts := make([]string, len(items))
	for i, item := range items {
		texts[i] = item.Trigger + " " + item.Insight
	}

	vecs, err := embedder.Embed(texts)
	if err != nil {
		cmd.Printf("[warn] Batch embedding failed: %v\n", err)
		return compoundFromCache(cmd, repoRoot, items)
	}

	filtered, filteredEmbeddings := filterValidEmbeddings(items, vecs)
	if skipped := len(items) - len(filtered); skipped > 0 {
		cmd.Printf("[warn] %d lesson(s) skipped (embedding failed).\n", skipped)
	}

	return synthesizeAndWrite(cmd, repoRoot, filtered, filteredEmbeddings)
}

// filterValidEmbeddings pairs items with their non-nil embedding vectors.
func filterValidEmbeddings(items []memory.Item, vecs [][]float64) ([]memory.Item, [][]float64) {
	var filtered []memory.Item
	var filteredEmbeddings [][]float64
	for i, item := range items {
		if i < len(vecs) && vecs[i] != nil {
			filtered = append(filtered, item)
			filteredEmbeddings = append(filteredEmbeddings, vecs[i])
		}
	}
	return filtered, filteredEmbeddings
}

func compoundFromCache(cmd *cobra.Command, repoRoot string, items []memory.Item) error {
	db, err := storage.OpenRepoDB(repoRoot)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if _, err := storage.SyncIfNeeded(db, repoRoot, false); err != nil {
		return fmt.Errorf("sync: %w", err)
	}

	// Try to read cached embeddings
	cache := storage.GetCachedEmbeddingsBulk(db)
	embeddings := make([][]float64, len(items))
	hasEmbeddings := false
	for i, item := range items {
		entry, ok := cache[item.ID]
		if ok && len(entry.Vector) > 0 {
			embeddings[i] = entry.Vector
			hasEmbeddings = true
		}
	}

	if !hasEmbeddings {
		cmd.Println("No cached embeddings found. Run search commands first to populate the cache.")
		cmd.Println("Synthesized 0 patterns from 0 lessons.")
		return nil
	}

	// Filter to items with embeddings
	var filtered []memory.Item
	var filteredEmbeddings [][]float64
	for i, item := range items {
		if embeddings[i] != nil {
			filtered = append(filtered, item)
			filteredEmbeddings = append(filteredEmbeddings, embeddings[i])
		}
	}

	if skipped := len(items) - len(filtered); skipped > 0 {
		cmd.Printf("[warn] %d lesson(s) skipped (no cached embeddings). Run the embedding daemon to include them.\n", skipped)
	}

	return synthesizeAndWrite(cmd, repoRoot, filtered, filteredEmbeddings)
}

func synthesizeAndWrite(cmd *cobra.Command, repoRoot string, items []memory.Item, embeddings [][]float64) error {
	result := compound.ClusterBySimilarity(items, embeddings, compound.DefaultThreshold)

	// Synthesize patterns from multi-item clusters
	var patterns []compound.CctPattern
	for _, cluster := range result.Clusters {
		ids := make([]string, len(cluster))
		for i, item := range cluster {
			ids[i] = item.ID
		}
		clusterID := strings.Join(ids, "-")
		patterns = append(patterns, compound.SynthesizePattern(cluster, clusterID))
	}

	if len(patterns) > 0 {
		if err := compound.WriteCctPatterns(repoRoot, patterns); err != nil {
			return fmt.Errorf("write patterns: %w", err)
		}
	}

	cmd.Printf("Synthesized %d pattern(s) from %d lessons.\n", len(patterns), len(items))
	return nil
}

// downloadModelCmd downloads the ONNX embedding model and tokenizer.
func downloadModelCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "download-model",
		Short: "Download the embedding model",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			// Check if model files already exist
			modelPath, tokenizerPath := embed.FindModelFiles(repoRoot)
			if modelPath != "" && tokenizerPath != "" {
				cmd.Println("[ok] Model files already present:")
				cmd.Printf("  Model:     %s\n", modelPath)
				cmd.Printf("  Tokenizer: %s\n", tokenizerPath)
				return nil
			}

			result, err := embed.DownloadModel(repoRoot, func(msg string) {
				cmd.Println("[info] " + msg)
			})
			if err != nil {
				return fmt.Errorf("download model: %w", err)
			}

			if result.AlreadyExists {
				cmd.Println("[ok] Model already downloaded.")
			} else {
				cmd.Println("[ok] Model downloaded successfully.")
			}
			cmd.Printf("  Model:     %s\n", result.ModelPath)
			cmd.Printf("  Tokenizer: %s\n", result.TokenizerPath)
			return nil
		},
	}
}

func registerAdvancedCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(compoundCmd())
	rootCmd.AddCommand(downloadModelCmd())
}
