package cli

import (
	"fmt"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/compound"
	"github.com/nathandelacretaz/compound-agent/internal/embed"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

func compoundCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "compound",
		Short: "Synthesize cross-cutting patterns from lessons",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()

			result, err := memory.ReadMemoryItems(repoRoot)
			if err != nil {
				return fmt.Errorf("read lessons: %w", err)
			}
			items := result.Items
			if len(items) == 0 {
				cmd.Println("Synthesized 0 patterns from 0 lessons.")
				return nil
			}

			// Try to get embeddings via daemon
			embedder := tryGetEmbedder(repoRoot)
			if embedder == nil {
				cmd.Println("[warn] Embedding daemon not available. Using keyword-based clustering is not supported.")
				cmd.Println("Start the daemon or run: ca download-model")
				// Fall back to a basic approach: compute embeddings from DB cache
				return compoundFromCache(cmd, repoRoot, items)
			}

			// Compute embeddings for all items, filtering out failures
			var filtered []memory.MemoryItem
			var filteredEmbeddings [][]float64
			for _, item := range items {
				text := item.Trigger + " " + item.Insight
				vecs, err := embedder.Embed([]string{text})
				if err != nil {
					cmd.Printf("[warn] Could not embed item %s, skipping: %v\n", item.ID, err)
					continue
				}
				if len(vecs) > 0 && vecs[0] != nil {
					filtered = append(filtered, item)
					filteredEmbeddings = append(filteredEmbeddings, vecs[0])
				}
			}

			if skipped := len(items) - len(filtered); skipped > 0 {
				cmd.Printf("[warn] %d lesson(s) skipped (embedding failed).\n", skipped)
			}

			return synthesizeAndWrite(cmd, repoRoot, filtered, filteredEmbeddings)
		},
	}
}

func compoundFromCache(cmd *cobra.Command, repoRoot string, items []memory.MemoryItem) error {
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
	var filtered []memory.MemoryItem
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

func synthesizeAndWrite(cmd *cobra.Command, repoRoot string, items []memory.MemoryItem, embeddings [][]float64) error {
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

// downloadModelCmd provides a placeholder for model download.
func downloadModelCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "download-model",
		Short: "Download the embedding model",
		RunE: func(cmd *cobra.Command, args []string) error {
			repoRoot := util.GetRepoRoot()
			sockPath := embed.SocketPath(repoRoot)

			// Check if daemon is running (model would already be loaded)
			client, err := embed.NewClient(sockPath, 500*time.Millisecond)
			if err == nil {
				resp, err := client.Health()
				if err == nil && resp.Status == "ok" {
					cmd.Println("[ok] Embedding model is loaded (daemon running)")
					client.Close()
					return nil
				}
				client.Close()
			}

			cmd.Println("[info] Model download is handled by the Rust embed daemon.")
			cmd.Println("The model will be downloaded on first use when the daemon starts.")
			return nil
		},
	}
}

func registerAdvancedCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(compoundCmd())
	rootCmd.AddCommand(downloadModelCmd())
}
