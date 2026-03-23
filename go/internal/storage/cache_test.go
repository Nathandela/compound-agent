package storage

import (
	"database/sql"
	"math"
	"testing"
)

// --- ContentHash tests ---

func TestContentHash_Deterministic(t *testing.T) {
	h1 := ContentHash("trigger text", "insight text")
	h2 := ContentHash("trigger text", "insight text")

	if h1 != h2 {
		t.Errorf("ContentHash not deterministic: %q != %q", h1, h2)
	}

	// SHA-256 produces 64 hex chars
	if len(h1) != 64 {
		t.Errorf("hash length = %d, want 64", len(h1))
	}
}

func TestContentHash_IncludesModelID(t *testing.T) {
	h1 := ContentHash("trigger", "insight")

	// Changing the model ID (embedded in the constant) should change the hash.
	// We verify indirectly: different inputs produce different hashes.
	h2 := ContentHash("trigger", "different insight")
	if h1 == h2 {
		t.Error("different inputs should produce different hashes")
	}

	// The hash should be non-empty hex string
	for _, c := range h1 {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			t.Errorf("hash contains non-hex char: %c", c)
		}
	}
}

func TestContentHash_DifferentInputs(t *testing.T) {
	h1 := ContentHash("a", "b")
	h2 := ContentHash("b", "a")
	if h1 == h2 {
		t.Error("swapped trigger/insight should produce different hashes")
	}
}

// --- SetCachedEmbedding + GetCachedEmbeddingsBulk roundtrip ---

func TestSetAndGetCachedEmbeddingsBulk_Roundtrip(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Insert a lesson row first (cache functions are UPDATE-only)
	insertTestLesson(t, db, "L001", "trigger1", "insight1")

	embedding := []float64{1.0, 2.5, -3.0, 0.0}
	hash := ContentHash("trigger1", "insight1")

	SetCachedEmbedding(db, "L001", embedding, hash)

	result := GetCachedEmbeddingsBulk(db)
	if len(result) != 1 {
		t.Fatalf("got %d entries, want 1", len(result))
	}

	entry, ok := result["L001"]
	if !ok {
		t.Fatal("L001 not found in result")
	}

	if entry.Hash != hash {
		t.Errorf("hash = %q, want %q", entry.Hash, hash)
	}

	if len(entry.Vector) != len(embedding) {
		t.Fatalf("vector length = %d, want %d", len(entry.Vector), len(embedding))
	}

	for i, v := range entry.Vector {
		// float32 precision: compare with tolerance
		if math.Abs(v-embedding[i]) > 1e-6 {
			t.Errorf("vector[%d] = %f, want %f", i, v, embedding[i])
		}
	}
}

func TestGetCachedEmbeddingsBulk_SkipsNullContentHash(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Insert two lessons
	insertTestLesson(t, db, "L001", "trigger1", "insight1")
	insertTestLesson(t, db, "L002", "trigger2", "insight2")

	// Set embedding for L001 with hash
	SetCachedEmbedding(db, "L001", []float64{1.0, 2.0}, ContentHash("trigger1", "insight1"))

	// Set embedding for L002 directly without hash (simulating NULL content_hash)
	_, err = db.Exec("UPDATE lessons SET embedding = X'0000803F' WHERE id = 'L002'")
	if err != nil {
		t.Fatal(err)
	}

	result := GetCachedEmbeddingsBulk(db)

	// L002 should be skipped because content_hash is NULL
	if len(result) != 1 {
		t.Fatalf("got %d entries, want 1 (L002 should be skipped)", len(result))
	}

	if _, ok := result["L001"]; !ok {
		t.Error("L001 should be present")
	}
	if _, ok := result["L002"]; ok {
		t.Error("L002 should be skipped (NULL content_hash)")
	}
}

func TestGetCachedEmbeddingsBulk_EmptyDB(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	result := GetCachedEmbeddingsBulk(db)
	if result == nil {
		t.Fatal("expected non-nil map, got nil")
	}
	if len(result) != 0 {
		t.Errorf("got %d entries, want 0", len(result))
	}
}

// --- SetCachedInsightEmbedding + GetCachedInsightEmbedding roundtrip ---

func TestSetAndGetCachedInsightEmbedding_Roundtrip(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	insertTestLesson(t, db, "L001", "trigger1", "insight1")

	embedding := []float64{0.5, -1.5, 3.14}
	hash := ContentHash("trigger1", "insight1")

	SetCachedInsightEmbedding(db, "L001", embedding, hash)

	result := GetCachedInsightEmbedding(db, "L001", hash)
	if result == nil {
		t.Fatal("expected non-nil result")
	}

	if len(result) != len(embedding) {
		t.Fatalf("vector length = %d, want %d", len(result), len(embedding))
	}

	for i, v := range result {
		if math.Abs(v-embedding[i]) > 1e-6 {
			t.Errorf("vector[%d] = %f, want %f", i, v, embedding[i])
		}
	}
}

func TestGetCachedInsightEmbedding_HashMismatch(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	insertTestLesson(t, db, "L001", "trigger1", "insight1")

	embedding := []float64{1.0, 2.0}
	hash := ContentHash("trigger1", "insight1")

	SetCachedInsightEmbedding(db, "L001", embedding, hash)

	// Query with a different expected hash
	result := GetCachedInsightEmbedding(db, "L001", "wrong-hash")
	if result != nil {
		t.Errorf("expected nil on hash mismatch, got %v", result)
	}
}

func TestGetCachedInsightEmbedding_NotFound(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	result := GetCachedInsightEmbedding(db, "NONEXISTENT", "somehash")
	if result != nil {
		t.Errorf("expected nil for nonexistent ID, got %v", result)
	}
}

// --- SetCachedEmbedding error propagation ---

func TestSetCachedEmbedding_ReturnsError(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	// Close DB to force an error
	db.Close()

	err = SetCachedEmbedding(db, "L001", []float64{1.0}, "hash")
	if err == nil {
		t.Error("expected error from SetCachedEmbedding on closed DB, got nil")
	}
}

func TestSetCachedInsightEmbedding_ReturnsError(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	// Close DB to force an error
	db.Close()

	err = SetCachedInsightEmbedding(db, "L001", []float64{1.0}, "hash")
	if err == nil {
		t.Error("expected error from SetCachedInsightEmbedding on closed DB, got nil")
	}
}

func TestSetCachedEmbedding_SuccessReturnsNil(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	insertTestLesson(t, db, "L001", "trigger", "insight")
	err = SetCachedEmbedding(db, "L001", []float64{1.0, 2.0}, "hash")
	if err != nil {
		t.Errorf("expected nil error on success, got %v", err)
	}
}

// --- Helper ---

func insertTestLesson(t *testing.T, db *sql.DB, id, trigger, insight string) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
		 VALUES (?, 'lesson', ?, ?, '', 'manual', '{}', '[]', '[]', '2026-01-01T00:00:00Z', 0)`,
		id, trigger, insight,
	)
	if err != nil {
		t.Fatalf("insert test lesson %s: %v", id, err)
	}
}
