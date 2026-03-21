package knowledge

import (
	"fmt"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

const EmbedBatchSize = 16

// EmbedChunksOptions controls embedding behavior.
type EmbedChunksOptions struct {
	OnlyMissing bool
}

// EmbedChunksResult holds statistics about an embedding operation.
type EmbedChunksResult struct {
	ChunksEmbedded int
	ChunksSkipped  int
	DurationMs     int64
}

// EmbedChunks embeds knowledge chunks using the provided embedder.
// Processes in batches of EmbedBatchSize with transactional writes.
func EmbedChunks(kdb *storage.KnowledgeDB, embedder search.Embedder, opts *EmbedChunksOptions) (*EmbedChunksResult, error) {
	start := time.Now()

	onlyMissing := true
	if opts != nil {
		onlyMissing = opts.OnlyMissing
	}

	var chunks []storage.KnowledgeChunk
	if onlyMissing {
		chunks = kdb.GetUnembeddedChunks()
	} else {
		chunks = kdb.GetAllChunks()
	}

	totalCount := kdb.GetChunkCount()
	skipped := totalCount - len(chunks)

	result := &EmbedChunksResult{ChunksSkipped: skipped}

	for i := 0; i < len(chunks); i += EmbedBatchSize {
		end := i + EmbedBatchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		batch := chunks[i:end]

		texts := make([]string, len(batch))
		for j, c := range batch {
			texts[j] = c.Text
		}

		vectors, err := embedder.Embed(texts)
		if err != nil {
			return result, fmt.Errorf("embed batch: %w", err)
		}
		if len(vectors) != len(texts) {
			return result, fmt.Errorf("embedder returned %d vectors for %d inputs", len(vectors), len(texts))
		}

		embeddings := make([]storage.ChunkEmbedding, len(batch))
		for j, c := range batch {
			embeddings[j] = storage.ChunkEmbedding{
				ID:          c.ID,
				Vector:      vectors[j],
				ContentHash: c.ContentHash,
			}
		}

		if err := kdb.SetChunkEmbeddingBatch(embeddings); err != nil {
			return result, fmt.Errorf("write batch: %w", err)
		}

		result.ChunksEmbedded += len(batch)
	}

	result.DurationMs = time.Since(start).Milliseconds()
	return result, nil
}
