package knowledge

import (
	"fmt"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// mockEmbedder returns deterministic vectors for testing.
type mockEmbedder struct {
	callCount int
}

func (m *mockEmbedder) Embed(texts []string) ([][]float64, error) {
	m.callCount++
	results := make([][]float64, len(texts))
	for i := range texts {
		// Simple deterministic vector based on text length
		results[i] = []float64{float64(len(texts[i])) / 100.0, 0.5, 0.3}
	}
	return results, nil
}

func setupEmbeddingTest(t *testing.T) *storage.KnowledgeDB {
	t.Helper()
	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	kdb := storage.NewKnowledgeDB(db)
	now := time.Now().UTC().Format(time.RFC3339)

	chunks := []storage.KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "Go programming tutorial", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "Python data science", UpdatedAt: now},
		{ID: "c3", FilePath: "docs/c.md", StartLine: 1, EndLine: 5, ContentHash: "h3", Text: "Rust systems programming", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)
	return kdb
}

func TestEmbedChunks_EmbedsAllUnembedded(t *testing.T) {
	kdb := setupEmbeddingTest(t)
	embedder := &mockEmbedder{}

	result, err := EmbedChunks(kdb, embedder, nil)
	if err != nil {
		t.Fatalf("embedChunks: %v", err)
	}

	if result.ChunksEmbedded != 3 {
		t.Errorf("chunksEmbedded = %d, want 3", result.ChunksEmbedded)
	}
	if result.ChunksSkipped != 0 {
		t.Errorf("chunksSkipped = %d, want 0", result.ChunksSkipped)
	}
	if result.DurationMs < 0 {
		t.Error("durationMs should be non-negative")
	}
}

func TestEmbedChunks_SkipsAlreadyEmbedded(t *testing.T) {
	kdb := setupEmbeddingTest(t)
	embedder := &mockEmbedder{}

	// Embed one chunk manually
	if err := kdb.SetChunkEmbedding("c1", []float64{0.1, 0.2, 0.3}, "h1"); err != nil {
		t.Fatalf("SetChunkEmbedding: %v", err)
	}

	result, err := EmbedChunks(kdb, embedder, nil)
	if err != nil {
		t.Fatalf("embedChunks: %v", err)
	}

	if result.ChunksEmbedded != 2 {
		t.Errorf("chunksEmbedded = %d, want 2", result.ChunksEmbedded)
	}
	if result.ChunksSkipped != 1 {
		t.Errorf("chunksSkipped = %d, want 1", result.ChunksSkipped)
	}
}

func TestEmbedChunks_OnlyMissingFalse(t *testing.T) {
	kdb := setupEmbeddingTest(t)
	embedder := &mockEmbedder{}

	// Embed one chunk manually
	if err := kdb.SetChunkEmbedding("c1", []float64{0.1, 0.2, 0.3}, "h1"); err != nil {
		t.Fatalf("SetChunkEmbedding: %v", err)
	}

	result, err := EmbedChunks(kdb, embedder, &EmbedChunksOptions{OnlyMissing: false})
	if err != nil {
		t.Fatalf("embedChunks: %v", err)
	}

	// Should re-embed all chunks
	if result.ChunksEmbedded != 3 {
		t.Errorf("chunksEmbedded = %d, want 3", result.ChunksEmbedded)
	}
}

func TestEmbedChunks_BatchesRequests(t *testing.T) {
	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	kdb := storage.NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)

	// Create more chunks than batch size (16)
	var chunks []storage.KnowledgeChunk
	for i := 0; i < 20; i++ {
		chunks = append(chunks, storage.KnowledgeChunk{
			ID: fmt.Sprintf("c%d", i), FilePath: "docs/a.md",
			StartLine: i, EndLine: i + 1, ContentHash: fmt.Sprintf("h%d", i),
			Text: fmt.Sprintf("chunk number %d", i), UpdatedAt: now,
		})
	}
	kdb.UpsertChunks(chunks)

	embedder := &mockEmbedder{}

	result, err := EmbedChunks(kdb, embedder, nil)
	if err != nil {
		t.Fatalf("embedChunks: %v", err)
	}

	if result.ChunksEmbedded != 20 {
		t.Errorf("chunksEmbedded = %d, want 20", result.ChunksEmbedded)
	}

	// Should have been called twice (16 + 4)
	if embedder.callCount != 2 {
		t.Errorf("embedder called %d times, want 2 (batched)", embedder.callCount)
	}
}

func TestEmbedChunks_NoChunks(t *testing.T) {
	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	kdb := storage.NewKnowledgeDB(db)
	embedder := &mockEmbedder{}

	result, err := EmbedChunks(kdb, embedder, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ChunksEmbedded != 0 {
		t.Errorf("chunksEmbedded = %d, want 0", result.ChunksEmbedded)
	}
}
