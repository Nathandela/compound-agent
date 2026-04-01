package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

// KnowledgeSchemaVersion is the current knowledge schema version for migration detection.
const KnowledgeSchemaVersion = 3

// KnowledgeDBPath is the relative path from repo root.
const KnowledgeDBPath = ".claude/.cache/knowledge.sqlite"

const knowledgeSchemaDDL = `
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB,
    model TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    content='chunks', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text)
    VALUES (new.rowid, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
    INSERT INTO chunks_fts(rowid, text)
    VALUES (new.rowid, new.text);
  END;

  CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

// KnowledgeChunk represents a documentation chunk stored in the knowledge DB.
type KnowledgeChunk struct {
	ID          string
	FilePath    string
	StartLine   int
	EndLine     int
	ContentHash string
	Text        string
	Model       string
	UpdatedAt   string
}

// ScoredKnowledgeChunk pairs a chunk with a relevance score.
type ScoredKnowledgeChunk struct {
	Chunk KnowledgeChunk
	Score float64
}

// ChunkEmbedding holds data for a batch embedding write.
type ChunkEmbedding struct {
	ID          string
	Vector      []float64
	ContentHash string
}

// KnowledgeDB wraps a sql.DB with knowledge-specific operations.
type KnowledgeDB struct {
	db *sql.DB
}

// NewKnowledgeDB wraps an open database connection.
func NewKnowledgeDB(db *sql.DB) *KnowledgeDB {
	return &KnowledgeDB{db: db}
}

// DB returns the underlying sql.DB.
func (k *KnowledgeDB) DB() *sql.DB {
	return k.db
}

// Close closes the underlying database.
func (k *KnowledgeDB) Close() error {
	return k.db.Close()
}

// OpenKnowledgeDB opens or creates a knowledge SQLite database.
// For on-disk databases, uses flock serialization during rebuild to prevent
// concurrent processes from racing on schema recreation.
func OpenKnowledgeDB(path string) (*sql.DB, error) {
	isMemory := path == ":memory:"

	if !isMemory {
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create dir: %w", err)
		}
		return lockedOpenKnowledgeDB(path)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	return initKnowledgeSchema(db)
}

// lockedOpenKnowledgeDB acquires a blocking flock for the rebuild cycle,
// mirroring lockedOpenDB for the lessons database.
func lockedOpenKnowledgeDB(path string) (*sql.DB, error) {
	lockPath := path + ".lock"
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	defer f.Close()

	if err := flockExclusive(f); err != nil {
		return nil, fmt.Errorf("flock: %w", err)
	}
	defer func() { _ = flockUnlock(f) }()

	if knowledgeNeedsRebuild(path) {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			if err := os.Remove(path + suffix); err != nil && !os.IsNotExist(err) {
				return nil, fmt.Errorf("remove stale knowledge db %s: %w", path+suffix, err)
			}
		}
	}

	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	return initKnowledgeSchema(db)
}

// initKnowledgeSchema applies the knowledge DDL and sets the version.
func initKnowledgeSchema(db *sql.DB) (*sql.DB, error) {
	if _, err := db.Exec(knowledgeSchemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("create schema: %w", err)
	}
	if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", KnowledgeSchemaVersion)); err != nil {
		db.Close()
		return nil, fmt.Errorf("set version: %w", err)
	}
	return db, nil
}

// OpenRepoKnowledgeDB opens the standard knowledge.sqlite for a repo.
func OpenRepoKnowledgeDB(repoRoot string) (*sql.DB, error) {
	return OpenKnowledgeDB(filepath.Join(repoRoot, KnowledgeDBPath))
}

func knowledgeNeedsRebuild(path string) bool {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return false
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return true
	}
	defer db.Close()

	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return true
	}

	return version != KnowledgeSchemaVersion
}

// --- CRUD operations ---

// UpsertChunks inserts or replaces chunks in a single transaction.
func (k *KnowledgeDB) UpsertChunks(chunks []KnowledgeChunk) error {
	if len(chunks) == 0 {
		return nil
	}

	tx, err := k.db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	stmt, err := tx.Prepare(`INSERT OR REPLACE INTO chunks
		(id, file_path, start_line, end_line, content_hash, text, embedding, model, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for _, c := range chunks {
		model := sql.NullString{String: c.Model, Valid: c.Model != ""}
		if _, err := stmt.Exec(c.ID, c.FilePath, c.StartLine, c.EndLine, c.ContentHash, c.Text, model, c.UpdatedAt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec: %w", err)
		}
	}

	return tx.Commit()
}

// DeleteChunksByFilePath deletes all chunks for the given file paths.
func (k *KnowledgeDB) DeleteChunksByFilePath(filePaths []string) error {
	if len(filePaths) == 0 {
		return nil
	}

	tx, err := k.db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	stmt, err := tx.Prepare("DELETE FROM chunks WHERE file_path = ?")
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for _, path := range filePaths {
		if _, err := stmt.Exec(path); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec delete %s: %w", path, err)
		}
	}
	return tx.Commit()
}

// GetChunkCount returns the total number of chunks.
func (k *KnowledgeDB) GetChunkCount() int {
	var count int
	_ = k.db.QueryRow("SELECT COUNT(*) FROM chunks").Scan(&count)
	return count
}

// GetChunkCountByFilePath returns the chunk count for a specific file.
func (k *KnowledgeDB) GetChunkCountByFilePath(filePath string) int {
	var count int
	_ = k.db.QueryRow("SELECT COUNT(*) FROM chunks WHERE file_path = ?", filePath).Scan(&count)
	return count
}

// GetIndexedFilePaths returns all distinct file paths in the chunks table.
func (k *KnowledgeDB) GetIndexedFilePaths() []string {
	rows, err := k.db.Query("SELECT DISTINCT file_path FROM chunks")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			continue
		}
		paths = append(paths, p)
	}
	if err := rows.Err(); err != nil {
		return nil
	}
	return paths
}

// --- Metadata operations ---

func fileHashKey(relativePath string) string {
	return "file_hash:" + relativePath
}

// GetFileHash retrieves the stored hash for a file path.
func (k *KnowledgeDB) GetFileHash(relativePath string) string {
	var value string
	err := k.db.QueryRow("SELECT value FROM metadata WHERE key = ?", fileHashKey(relativePath)).Scan(&value)
	if err != nil {
		return ""
	}
	return value
}

// SetFileHash stores the hash for a file path.
func (k *KnowledgeDB) SetFileHash(relativePath, hash string) error {
	_, err := k.db.Exec("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", fileHashKey(relativePath), hash)
	return err
}

// RemoveFileHash removes the stored hash for a file path.
func (k *KnowledgeDB) RemoveFileHash(relativePath string) error {
	_, err := k.db.Exec("DELETE FROM metadata WHERE key = ?", fileHashKey(relativePath))
	return err
}

// GetLastIndexTime retrieves the last index timestamp.
func (k *KnowledgeDB) GetLastIndexTime() string {
	var value string
	err := k.db.QueryRow("SELECT value FROM metadata WHERE key = 'last_index_time'").Scan(&value)
	if err != nil {
		return ""
	}
	return value
}

// SetLastIndexTime stores the last index timestamp.
func (k *KnowledgeDB) SetLastIndexTime(t string) error {
	_, err := k.db.Exec("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_index_time', ?)", t)
	return err
}

// --- FTS5 search ---

// SearchChunksKeywordScored performs FTS5 keyword search with BM25 scoring.
func (k *KnowledgeDB) SearchChunksKeywordScored(query string, limit int) []ScoredKnowledgeChunk {
	sanitized := SanitizeFtsQuery(query)
	if sanitized == "" {
		return nil
	}

	rows, err := k.db.Query(`SELECT c.id, c.file_path, c.start_line, c.end_line, c.content_hash, c.text, c.model, c.updated_at, fts.rank
		FROM chunks c
		JOIN chunks_fts fts ON c.rowid = fts.rowid
		WHERE chunks_fts MATCH ?
		ORDER BY fts.rank
		LIMIT ?`, sanitized, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []ScoredKnowledgeChunk
	for rows.Next() {
		var (
			id, fp, ch, text, updatedAt string
			startLine, endLine          int
			model                       sql.NullString
			rank                        float64
		)
		if err := rows.Scan(&id, &fp, &startLine, &endLine, &ch, &text, &model, &updatedAt, &rank); err != nil {
			continue
		}
		chunk := KnowledgeChunk{
			ID: id, FilePath: fp, StartLine: startLine, EndLine: endLine,
			ContentHash: ch, Text: text, UpdatedAt: updatedAt,
		}
		if model.Valid {
			chunk.Model = model.String
		}
		results = append(results, ScoredKnowledgeChunk{Chunk: chunk, Score: normalizeBm25Rank(rank)})
	}
	// rows.Err() is non-fatal for search results; return what we have
	return results
}

// --- Embedding operations ---

// GetAllEmbeddings reads all stored chunk embeddings.
func (k *KnowledgeDB) GetAllEmbeddings() map[string]CachedEmbeddingEntry {
	result := make(map[string]CachedEmbeddingEntry)

	rows, err := k.db.Query("SELECT id, embedding, content_hash FROM chunks WHERE embedding IS NOT NULL")
	if err != nil {
		return result
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var blob []byte
		var hash sql.NullString

		if err := rows.Scan(&id, &blob, &hash); err != nil {
			continue
		}
		if !hash.Valid || len(blob) == 0 {
			continue
		}

		vec := blobToFloat64(blob)
		result[id] = CachedEmbeddingEntry{Vector: vec, Hash: hash.String}
	}
	// rows.Err() is non-fatal for cache reads; return what we have
	return result
}

// SetChunkEmbedding stores an embedding vector for a single chunk.
func (k *KnowledgeDB) SetChunkEmbedding(id string, embedding []float64, contentHash string) error {
	blob := float64ToBlob(embedding)
	_, err := k.db.Exec("UPDATE chunks SET embedding = ?, content_hash = ? WHERE id = ?", blob, contentHash, id)
	return err
}

// SetChunkEmbeddingBatch stores embeddings for multiple chunks in a transaction.
func (k *KnowledgeDB) SetChunkEmbeddingBatch(batch []ChunkEmbedding) error {
	tx, err := k.db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}

	stmt, err := tx.Prepare("UPDATE chunks SET embedding = ?, content_hash = ? WHERE id = ?")
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for _, item := range batch {
		blob := float64ToBlob(item.Vector)
		if _, err := stmt.Exec(blob, item.ContentHash, item.ID); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec: %w", err)
		}
	}
	return tx.Commit()
}

// GetAllChunks returns all chunks (for re-embedding all).
func (k *KnowledgeDB) GetAllChunks() []KnowledgeChunk {
	rows, err := k.db.Query("SELECT id, text, content_hash FROM chunks")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var chunks []KnowledgeChunk
	for rows.Next() {
		var c KnowledgeChunk
		if err := rows.Scan(&c.ID, &c.Text, &c.ContentHash); err != nil {
			continue
		}
		chunks = append(chunks, c)
	}
	if rows.Err() != nil {
		return nil
	}
	return chunks
}

// GetUnembeddedChunks returns chunks that have no embedding stored.
func (k *KnowledgeDB) GetUnembeddedChunks() []KnowledgeChunk {
	rows, err := k.db.Query("SELECT id, text, content_hash FROM chunks WHERE embedding IS NULL")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var chunks []KnowledgeChunk
	for rows.Next() {
		var c KnowledgeChunk
		if err := rows.Scan(&c.ID, &c.Text, &c.ContentHash); err != nil {
			continue
		}
		chunks = append(chunks, c)
	}
	if rows.Err() != nil {
		return nil
	}
	return chunks
}

// HydrateChunks loads full chunk data for the given IDs.
func (k *KnowledgeDB) HydrateChunks(ids []string) []KnowledgeChunk {
	if len(ids) == 0 {
		return nil
	}

	// Build parameterized query
	placeholders := ""
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args[i] = id
	}

	rows, err := k.db.Query(
		"SELECT id, file_path, start_line, end_line, content_hash, text, model, updated_at FROM chunks WHERE id IN ("+placeholders+")",
		args...,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var chunks []KnowledgeChunk
	for rows.Next() {
		var (
			c     KnowledgeChunk
			model sql.NullString
		)
		if err := rows.Scan(&c.ID, &c.FilePath, &c.StartLine, &c.EndLine, &c.ContentHash, &c.Text, &model, &c.UpdatedAt); err != nil {
			continue
		}
		if model.Valid {
			c.Model = model.String
		}
		chunks = append(chunks, c)
	}
	if rows.Err() != nil {
		return nil
	}
	return chunks
}
