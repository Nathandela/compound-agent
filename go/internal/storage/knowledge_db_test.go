package storage

import (
	"database/sql"
	"testing"
	"time"
)

func openTestKnowledgeDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatalf("open knowledge db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestOpenKnowledgeDB_InMemory(t *testing.T) {
	db := openTestKnowledgeDB(t)

	// Verify schema version
	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != KnowledgeSchemaVersion {
		t.Errorf("schema version = %d, want %d", version, KnowledgeSchemaVersion)
	}

	// Verify chunks table exists
	var name string
	err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'").Scan(&name)
	if err != nil {
		t.Fatalf("chunks table not found: %v", err)
	}

	// Verify metadata table exists
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'").Scan(&name)
	if err != nil {
		t.Fatalf("metadata table not found: %v", err)
	}
}

func TestOpenKnowledgeDB_FileBusyTimeout(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	dbPath := dir + "/knowledge.sqlite"

	db, err := OpenKnowledgeDB(dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	// Verify busy_timeout is set to 5000ms
	var timeout int
	if err := db.QueryRow("PRAGMA busy_timeout").Scan(&timeout); err != nil {
		t.Fatalf("query busy_timeout: %v", err)
	}
	if timeout != 5000 {
		t.Errorf("busy_timeout = %d, want 5000", timeout)
	}
}

func TestUpsertAndReadChunks(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "chunk1", FilePath: "docs/README.md", StartLine: 1, EndLine: 10, ContentHash: "abc", Text: "Hello world", UpdatedAt: now},
		{ID: "chunk2", FilePath: "docs/README.md", StartLine: 11, EndLine: 20, ContentHash: "def", Text: "Second chunk", UpdatedAt: now},
	}

	if err := kdb.UpsertChunks(chunks); err != nil {
		t.Fatalf("upsert chunks: %v", err)
	}

	count := kdb.GetChunkCount()
	if count != 2 {
		t.Errorf("chunk count = %d, want 2", count)
	}

	countByFile := kdb.GetChunkCountByFilePath("docs/README.md")
	if countByFile != 2 {
		t.Errorf("chunk count by file = %d, want 2", countByFile)
	}
}

func TestUpsertChunks_Replace(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "chunk1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "v1", Text: "original", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	// Replace with new content
	chunks[0].Text = "updated"
	chunks[0].ContentHash = "v2"
	kdb.UpsertChunks(chunks)

	count := kdb.GetChunkCount()
	if count != 1 {
		t.Errorf("chunk count = %d, want 1 (upsert should replace)", count)
	}
}

func TestDeleteChunksByFilePath(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "chunk a", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "chunk b", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	if err := kdb.DeleteChunksByFilePath([]string{"docs/a.md"}); err != nil {
		t.Fatalf("delete chunks: %v", err)
	}

	count := kdb.GetChunkCount()
	if count != 1 {
		t.Errorf("chunk count = %d, want 1 after delete", count)
	}
}

func TestGetIndexedFilePaths(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "text", UpdatedAt: now},
		{ID: "c3", FilePath: "docs/a.md", StartLine: 6, EndLine: 10, ContentHash: "h3", Text: "text", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	paths := kdb.GetIndexedFilePaths()
	if len(paths) != 2 {
		t.Errorf("indexed paths = %d, want 2 (distinct)", len(paths))
	}
}

func TestMetadata_FileHash(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	// No stored hash initially
	hash := kdb.GetFileHash("docs/a.md")
	if hash != "" {
		t.Errorf("expected empty hash, got %q", hash)
	}

	if err := kdb.SetFileHash("docs/a.md", "abc123"); err != nil {
		t.Fatalf("SetFileHash: %v", err)
	}
	hash = kdb.GetFileHash("docs/a.md")
	if hash != "abc123" {
		t.Errorf("hash = %q, want %q", hash, "abc123")
	}

	// Update
	if err := kdb.SetFileHash("docs/a.md", "def456"); err != nil {
		t.Fatalf("SetFileHash update: %v", err)
	}
	hash = kdb.GetFileHash("docs/a.md")
	if hash != "def456" {
		t.Errorf("hash = %q, want %q", hash, "def456")
	}

	// Remove
	if err := kdb.RemoveFileHash("docs/a.md"); err != nil {
		t.Fatalf("RemoveFileHash: %v", err)
	}
	hash = kdb.GetFileHash("docs/a.md")
	if hash != "" {
		t.Errorf("expected empty hash after remove, got %q", hash)
	}
}

func TestMetadata_LastIndexTime(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	ts := kdb.GetLastIndexTime()
	if ts != "" {
		t.Errorf("expected empty last index time, got %q", ts)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if err := kdb.SetLastIndexTime(now); err != nil {
		t.Fatalf("SetLastIndexTime: %v", err)
	}
	ts = kdb.GetLastIndexTime()
	if ts != now {
		t.Errorf("last index time = %q, want %q", ts, now)
	}
}

func TestSearchChunksKeyword(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "Go programming language tutorial", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "Python data science guide", UpdatedAt: now},
		{ID: "c3", FilePath: "docs/c.md", StartLine: 1, EndLine: 5, ContentHash: "h3", Text: "Rust systems programming", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	results := kdb.SearchChunksKeywordScored("programming", 10)
	if len(results) < 2 {
		t.Errorf("expected at least 2 results for 'programming', got %d", len(results))
	}

	// Verify scores are normalized to [0, 1]
	for _, r := range results {
		if r.Score < 0 || r.Score > 1 {
			t.Errorf("score %f out of [0, 1] range", r.Score)
		}
	}
}

func TestSearchChunksKeyword_EmptyQuery(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	results := kdb.SearchChunksKeywordScored("", 10)
	if len(results) != 0 {
		t.Errorf("expected 0 results for empty query, got %d", len(results))
	}
}

func TestSearchChunksKeyword_SpecialChars(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "testing special characters", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	// Should not crash with FTS5 special characters
	// After sanitization "testing AND NOT (special)" -> "testing special" which matches
	results := kdb.SearchChunksKeywordScored("testing AND NOT (special)", 10)
	if len(results) != 1 {
		t.Errorf("expected 1 result, got %d", len(results))
	}
}

func TestGetAllEmbeddings(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text one", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "text two", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	// Set embedding for c1 only
	vec := []float64{0.1, 0.2, 0.3}
	if err := kdb.SetChunkEmbedding("c1", vec, "h1"); err != nil {
		t.Fatalf("SetChunkEmbedding: %v", err)
	}

	entries := kdb.GetAllEmbeddings()
	if len(entries) != 1 {
		t.Errorf("expected 1 embedding, got %d", len(entries))
	}
	if _, ok := entries["c1"]; !ok {
		t.Error("expected c1 embedding in results")
	}
}

func TestGetUnembeddedChunks(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text one", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "text two", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	// Set embedding for c1
	if err := kdb.SetChunkEmbedding("c1", []float64{0.1, 0.2}, "h1"); err != nil {
		t.Fatalf("SetChunkEmbedding: %v", err)
	}

	unembedded := kdb.GetUnembeddedChunks()
	if len(unembedded) != 1 {
		t.Fatalf("expected 1 unembedded chunk, got %d", len(unembedded))
	}
	if unembedded[0].ID != "c2" {
		t.Errorf("expected c2, got %s", unembedded[0].ID)
	}
}

func TestSetChunkEmbeddingBatch(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text one", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "text two", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	batch := []ChunkEmbedding{
		{ID: "c1", Vector: []float64{0.1, 0.2}, ContentHash: "h1"},
		{ID: "c2", Vector: []float64{0.3, 0.4}, ContentHash: "h2"},
	}
	if err := kdb.SetChunkEmbeddingBatch(batch); err != nil {
		t.Fatalf("batch set: %v", err)
	}

	entries := kdb.GetAllEmbeddings()
	if len(entries) != 2 {
		t.Errorf("expected 2 embeddings, got %d", len(entries))
	}
}

func TestGetIndexedFilePaths_ChecksRowsErr(t *testing.T) {
	// GetIndexedFilePaths should check rows.Err() after iteration.
	// We verify correct behavior by checking normal operation returns expected paths.
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	paths := kdb.GetIndexedFilePaths()
	if len(paths) != 1 || paths[0] != "docs/a.md" {
		t.Errorf("GetIndexedFilePaths() = %v, want [docs/a.md]", paths)
	}
}

func TestGetAllChunks_ChecksRowsErr(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text1", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 1, EndLine: 5, ContentHash: "h2", Text: "text2", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	all := kdb.GetAllChunks()
	if len(all) != 2 {
		t.Errorf("GetAllChunks() returned %d chunks, want 2", len(all))
	}
}

func TestHydrateChunks(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	chunks := []KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "chunk one", UpdatedAt: now},
		{ID: "c2", FilePath: "docs/b.md", StartLine: 6, EndLine: 10, ContentHash: "h2", Text: "chunk two", UpdatedAt: now},
	}
	kdb.UpsertChunks(chunks)

	hydrated := kdb.HydrateChunks([]string{"c1", "c2"})
	if len(hydrated) != 2 {
		t.Errorf("expected 2 hydrated chunks, got %d", len(hydrated))
	}
}

func TestSetFileHash_ReturnsError(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)
	db.Close() // force error

	err := kdb.SetFileHash("docs/a.md", "hash")
	if err == nil {
		t.Error("expected error from SetFileHash on closed DB, got nil")
	}
}

func TestRemoveFileHash_ReturnsError(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)
	db.Close()

	err := kdb.RemoveFileHash("docs/a.md")
	if err == nil {
		t.Error("expected error from RemoveFileHash on closed DB, got nil")
	}
}

func TestSetLastIndexTime_ReturnsError(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)
	db.Close()

	err := kdb.SetLastIndexTime("2026-01-01T00:00:00Z")
	if err == nil {
		t.Error("expected error from SetLastIndexTime on closed DB, got nil")
	}
}

func TestSetChunkEmbedding_ReturnsError(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)
	db.Close()

	err := kdb.SetChunkEmbedding("c1", []float64{0.1}, "h1")
	if err == nil {
		t.Error("expected error from SetChunkEmbedding on closed DB, got nil")
	}
}

func TestSetFileHash_SuccessReturnsNil(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	if err := kdb.SetFileHash("docs/a.md", "hash"); err != nil {
		t.Errorf("expected nil error on success, got %v", err)
	}
}

func TestSetChunkEmbedding_SuccessReturnsNil(t *testing.T) {
	db := openTestKnowledgeDB(t)
	kdb := NewKnowledgeDB(db)

	now := time.Now().UTC().Format(time.RFC3339)
	kdb.UpsertChunks([]KnowledgeChunk{
		{ID: "c1", FilePath: "docs/a.md", StartLine: 1, EndLine: 5, ContentHash: "h1", Text: "text", UpdatedAt: now},
	})

	if err := kdb.SetChunkEmbedding("c1", []float64{0.1, 0.2}, "h1"); err != nil {
		t.Errorf("expected nil error on success, got %v", err)
	}
}
