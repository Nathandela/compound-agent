//go:build sqlite_fts5

package search

import (
	"database/sql"
	"math"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
	_ "github.com/mattn/go-sqlite3"
)

// mockEmbedder returns pre-configured vectors or a deterministic hash.
type mockEmbedder struct {
	vectors map[string][]float64
}

func (m *mockEmbedder) Embed(texts []string) ([][]float64, error) {
	result := make([][]float64, len(texts))
	for i, text := range texts {
		if v, ok := m.vectors[text]; ok {
			result[i] = v
		} else {
			result[i] = simpleHash(text)
		}
	}
	return result, nil
}

// simpleHash produces a deterministic 4-dimensional vector from text.
func simpleHash(text string) []float64 {
	var sum float64
	for _, c := range text {
		sum += float64(c)
	}
	return []float64{
		math.Sin(sum),
		math.Cos(sum),
		math.Sin(sum * 2),
		math.Cos(sum * 2),
	}
}

// setupTestDB creates a fresh in-memory DB and inserts test items.
func setupTestDB(t *testing.T, items []memory.MemoryItem) *sql.DB {
	t.Helper()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}

	for _, item := range items {
		tags := strings.Join(item.Tags, ",")

		confirmed := 0
		if item.Confirmed {
			confirmed = 1
		}

		var invalidatedAt interface{}
		if item.InvalidatedAt != nil {
			invalidatedAt = *item.InvalidatedAt
		}

		var invalidationReason interface{}
		if item.InvalidationReason != nil {
			invalidationReason = *item.InvalidationReason
		}

		_, err := db.Exec(`INSERT INTO lessons (
			id, type, trigger, insight, evidence, severity,
			tags, source, context, supersedes, related,
			created, confirmed, deleted, retrieval_count, last_retrieved,
			invalidated_at, invalidation_reason,
			citation_file, citation_line, citation_commit,
			compaction_level, compacted_at, pattern_bad, pattern_good
		) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, '{}', '[]', '[]', ?, ?, 0, 0, NULL, ?, ?, NULL, NULL, NULL, 0, NULL, NULL, NULL)`,
			item.ID, string(item.Type), item.Trigger, item.Insight,
			tags, string(item.Source), item.Created, confirmed,
			invalidatedAt, invalidationReason,
		)
		if err != nil {
			t.Fatalf("insert test item %s: %v", item.ID, err)
		}
	}

	return db
}

// --- CosineSimilarity tests ---

func TestCosineSimilarity_IdenticalVectors(t *testing.T) {
	v := []float64{1, 2, 3}
	got := CosineSimilarity(v, v)
	if !approxEqual(got, 1.0, 1e-9) {
		t.Errorf("identical vectors: want 1.0, got %f", got)
	}
}

func TestCosineSimilarity_OrthogonalVectors(t *testing.T) {
	a := []float64{1, 0}
	b := []float64{0, 1}
	got := CosineSimilarity(a, b)
	if !approxEqual(got, 0.0, 1e-9) {
		t.Errorf("orthogonal vectors: want 0.0, got %f", got)
	}
}

func TestCosineSimilarity_ZeroVector(t *testing.T) {
	a := []float64{0, 0, 0}
	b := []float64{1, 2, 3}
	got := CosineSimilarity(a, b)
	if got != 0.0 {
		t.Errorf("zero vector: want 0.0, got %f", got)
	}
}

func TestCosineSimilarity_PanicsOnLengthMismatch(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on length mismatch, got none")
		}
	}()
	CosineSimilarity([]float64{1, 2}, []float64{1, 2, 3})
}

// --- SearchVector tests ---

func TestSearchVector_EmptyDB(t *testing.T) {
	db := setupTestDB(t, nil)
	defer db.Close()

	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	result, err := SearchVector(db, embedder, "test query", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Errorf("expected nil for empty db, got %v", result)
	}
}

func TestSearchVector_ReturnsSortedByScore(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "go error", Insight: "handle errors", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L002", Type: memory.TypeLesson, Trigger: "rust error", Insight: "use Result type", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L003", Type: memory.TypeLesson, Trigger: "python error", Insight: "try except blocks", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	queryVec := []float64{0.9, 0.1, 0.0, 0.0}
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"go error":                       queryVec,                   // query
		"go error handle errors":         queryVec,                   // L001 combined -- same as query, score ~1.0
		"rust error use Result type":     {0.1, 0.9, 0.0, 0.0},      // L002 -- orthogonal-ish
		"python error try except blocks": {0.0, 0.0, 0.9, 0.1},      // L003 -- different
	}}

	result, err := SearchVector(db, embedder, "go error", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}

	// Verify descending sort
	for i := 1; i < len(result); i++ {
		if result[i].Score > result[i-1].Score {
			t.Errorf("result[%d].Score (%f) > result[%d].Score (%f): not descending",
				i, result[i].Score, i-1, result[i-1].Score)
		}
	}

	// Highest score should be L001 (same vector as query)
	if result[0].Item.ID != "L001" {
		t.Errorf("expected L001 first, got %s", result[0].Item.ID)
	}
}

func TestSearchVector_UsesCachedEmbeddings(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "trigger1", Insight: "insight1", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	// Pre-cache the embedding with the correct content hash
	cachedVec := []float64{1.0, 0.0, 0.0, 0.0}
	hash := storage.ContentHash("trigger1", "insight1")
	storage.SetCachedEmbedding(db, "L001", cachedVec, hash)

	queryVec := []float64{1.0, 0.0, 0.0, 0.0}
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"test query": queryVec,
		// Do NOT provide "trigger1 insight1" -- if embedder is called for it,
		// it would get simpleHash (different vector). Cache hit means cachedVec is used.
	}}

	result, err := SearchVector(db, embedder, "test query", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 result, got %d", len(result))
	}
	// Cached vector [1,0,0,0] dot query [1,0,0,0] = 1.0
	if !approxEqual(result[0].Score, 1.0, 1e-6) {
		t.Errorf("expected score ~1.0 from cached embedding, got %f", result[0].Score)
	}
}

func TestSearchVector_SkipsInvalidatedItems(t *testing.T) {
	inv := "2025-06-01T00:00:00Z"
	reason := "outdated"
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "valid", Insight: "still good", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L002", Type: memory.TypeLesson, Trigger: "invalid", Insight: "outdated", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z", InvalidatedAt: &inv, InvalidationReason: &reason},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	result, err := SearchVector(db, embedder, "test", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// ReadAll filters invalidated items, so only L001 should appear
	if len(result) != 1 {
		t.Fatalf("expected 1 result (invalidated skipped), got %d", len(result))
	}
	if result[0].Item.ID != "L001" {
		t.Errorf("expected L001, got %s", result[0].Item.ID)
	}
}

func TestSearchVector_RespectsLimit(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "a", Insight: "a", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L002", Type: memory.TypeLesson, Trigger: "b", Insight: "b", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L003", Type: memory.TypeLesson, Trigger: "c", Insight: "c", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	result, err := SearchVector(db, embedder, "test", 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 results with limit=2, got %d", len(result))
	}
}

// --- FindSimilarLessons tests ---

func TestFindSimilarLessons_FiltersByThreshold(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "t1", Insight: "very similar insight", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L002", Type: memory.TypeLesson, Trigger: "t2", Insight: "completely different", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	queryVec := []float64{1.0, 0.0, 0.0, 0.0}
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"find similar text":    queryVec,                   // query
		"very similar insight": queryVec,                   // score = 1.0 (above threshold)
		"completely different": {0.0, 1.0, 0.0, 0.0},      // score = 0.0 (below threshold)
	}}

	result, err := FindSimilarLessons(db, embedder, "find similar text", 0.80, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 result above threshold, got %d", len(result))
	}
	if result[0].Item.ID != "L001" {
		t.Errorf("expected L001 (high similarity), got %s", result[0].Item.ID)
	}
}

func TestFindSimilarLessons_ExcludesSpecifiedID(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L001", Type: memory.TypeLesson, Trigger: "t1", Insight: "insight A", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
		{ID: "L002", Type: memory.TypeLesson, Trigger: "t2", Insight: "insight B", Tags: []string{}, Source: memory.SourceManual, Created: "2025-01-01T00:00:00Z"},
	}
	db := setupTestDB(t, items)
	defer db.Close()

	sameVec := []float64{1.0, 0.0, 0.0, 0.0}
	embedder := &mockEmbedder{vectors: map[string][]float64{
		"search text": sameVec,
		"insight A":   sameVec,
		"insight B":   sameVec,
	}}

	result, err := FindSimilarLessons(db, embedder, "search text", 0.80, "L001")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// L001 excluded, only L002 should appear
	if len(result) != 1 {
		t.Fatalf("expected 1 result (L001 excluded), got %d", len(result))
	}
	if result[0].Item.ID != "L002" {
		t.Errorf("expected L002, got %s", result[0].Item.ID)
	}
}

func TestFindSimilarLessons_EmptyDB(t *testing.T) {
	db := setupTestDB(t, nil)
	defer db.Close()

	embedder := &mockEmbedder{vectors: map[string][]float64{}}
	result, err := FindSimilarLessons(db, embedder, "test", 0.80, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Errorf("expected nil for empty db, got %v", result)
	}
}
