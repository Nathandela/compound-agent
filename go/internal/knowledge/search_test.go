package knowledge

import (
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// vecEmbedder returns vectors based on text length for deterministic testing.
type vecEmbedder struct{}

func (v *vecEmbedder) Embed(texts []string) ([][]float64, error) {
	results := make([][]float64, len(texts))
	for i, text := range texts {
		// Create a simple but distinct vector per text
		n := float64(len(text))
		results[i] = []float64{n / 100.0, 0.5, 1.0 - n/100.0}
	}
	return results, nil
}

func setupSearchTest(t *testing.T) *storage.KnowledgeDB {
	t.Helper()
	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	kdb := storage.NewKnowledgeDB(db)
	now := time.Now().UTC().Format(time.RFC3339)

	chunks := []storage.KnowledgeChunk{
		{ID: "c1", FilePath: "docs/go.md", StartLine: 1, EndLine: 10, ContentHash: "h1", Text: "Go programming language tutorial with goroutines", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/python.md", StartLine: 1, EndLine: 10, ContentHash: "h2", Text: "Python data science and machine learning guide", UpdatedAt: now},
		{ID: "c3", FilePath: "docs/rust.md", StartLine: 1, EndLine: 10, ContentHash: "h3", Text: "Rust systems programming and memory safety", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)
	return kdb
}

func TestSearchKnowledge_KeywordOnly(t *testing.T) {
	kdb := setupSearchTest(t)

	// No embedder = keyword-only
	results, err := SearchKnowledge(kdb, nil, "programming", nil)
	if err != nil {
		t.Fatalf("search: %v", err)
	}

	if len(results) < 2 {
		t.Errorf("expected at least 2 results for 'programming', got %d", len(results))
	}
}

func TestSearchKnowledge_KeywordOnly_NoResults(t *testing.T) {
	kdb := setupSearchTest(t)

	results, err := SearchKnowledge(kdb, nil, "nonexistent_query_xyz", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

func TestSearchKnowledge_WithEmbedder(t *testing.T) {
	kdb := setupSearchTest(t)
	embedder := &vecEmbedder{}

	// Embed all chunks first
	EmbedChunks(kdb, embedder, nil)

	results, err := SearchKnowledge(kdb, embedder, "programming", nil)
	if err != nil {
		t.Fatalf("search: %v", err)
	}

	if len(results) == 0 {
		t.Error("expected results from hybrid search")
	}
}

func TestSearchKnowledge_Limit(t *testing.T) {
	kdb := setupSearchTest(t)

	results, err := SearchKnowledge(kdb, nil, "programming", &SearchOptions{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) > 1 {
		t.Errorf("expected at most 1 result, got %d", len(results))
	}
}

func TestSearchKnowledge_FallbackWhenNoEmbeddings(t *testing.T) {
	kdb := setupSearchTest(t)
	embedder := &vecEmbedder{}

	// Don't embed chunks, so vector search returns empty
	// Should fall back to keyword-only results
	results, err := SearchKnowledge(kdb, embedder, "programming", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Should still get keyword results
	if len(results) < 2 {
		t.Errorf("expected keyword fallback results, got %d", len(results))
	}
}

func TestSearchKnowledgeVector_TwoPhase(t *testing.T) {
	kdb := setupSearchTest(t)
	embedder := &vecEmbedder{}

	// Embed chunks
	EmbedChunks(kdb, embedder, nil)

	results, err := SearchKnowledgeVector(kdb, embedder, "Go programming", 2)
	if err != nil {
		t.Fatalf("vector search: %v", err)
	}

	if len(results) == 0 {
		t.Error("expected results from vector search")
	}
	if len(results) > 2 {
		t.Errorf("expected at most 2 results, got %d", len(results))
	}

	// Results should have full chunk data (hydrated)
	for _, r := range results {
		if r.Chunk.FilePath == "" {
			t.Error("expected hydrated chunk with filePath")
		}
		if r.Chunk.Text == "" {
			t.Error("expected hydrated chunk with text")
		}
	}
}

func TestSearchKnowledgeVector_NoEmbeddings(t *testing.T) {
	kdb := setupSearchTest(t)
	embedder := &vecEmbedder{}

	// No embeddings stored
	results, err := SearchKnowledgeVector(kdb, embedder, "query", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results when no embeddings, got %d", len(results))
	}
}
