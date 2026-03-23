package storage

import (
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"fmt"
	"log/slog"
	"math"
)

// EmbeddingModelID is the model identifier included in content hashes
// so that a model change automatically invalidates all cached embeddings.
const EmbeddingModelID = "nomic-embed-text-v1.5-q8"

// CachedEmbeddingEntry holds a cached embedding vector and its content hash.
type CachedEmbeddingEntry struct {
	Vector []float64
	Hash   string
}

// ContentHash computes a SHA-256 hex digest of trigger+insight prefixed by
// the embedding model ID. Used to detect content or model changes for
// cache invalidation.
func ContentHash(trigger, insight string) string {
	h := sha256.Sum256([]byte(EmbeddingModelID + ":" + trigger + " " + insight))
	return fmt.Sprintf("%x", h)
}

// GetCachedEmbeddingsBulk reads all cached embeddings in a single query.
// Returns a map keyed by lesson ID. Rows without a content_hash are skipped.
func GetCachedEmbeddingsBulk(db *sql.DB) map[string]CachedEmbeddingEntry {
	result := make(map[string]CachedEmbeddingEntry)

	rows, err := db.Query("SELECT id, embedding, content_hash FROM lessons WHERE embedding IS NOT NULL")
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
		if !hash.Valid {
			continue
		}

		vec := blobToFloat64(blob)
		result[id] = CachedEmbeddingEntry{Vector: vec, Hash: hash.String}
	}
	// rows.Err() is non-fatal for cache reads; log and return what we have
	if err := rows.Err(); err != nil {
		slog.Warn("cache iteration error", "error", err)
	}

	return result
}

// SetCachedEmbedding stores an embedding vector and content hash for a lesson.
// UPDATE-only: the lesson row must already exist.
func SetCachedEmbedding(db *sql.DB, id string, embedding []float64, hash string) error {
	blob := float64ToBlob(embedding)
	_, err := db.Exec("UPDATE lessons SET embedding = ?, content_hash = ? WHERE id = ?", blob, hash, id)
	return err
}

// GetCachedInsightEmbeddingsBulk reads all cached insight embeddings in a single query.
// Returns a map keyed by lesson ID. Rows without a content_hash_insight are skipped.
func GetCachedInsightEmbeddingsBulk(db *sql.DB) map[string]CachedEmbeddingEntry {
	result := make(map[string]CachedEmbeddingEntry)

	rows, err := db.Query("SELECT id, embedding_insight, content_hash_insight FROM lessons WHERE embedding_insight IS NOT NULL")
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
		if !hash.Valid {
			continue
		}

		vec := blobToFloat64(blob)
		result[id] = CachedEmbeddingEntry{Vector: vec, Hash: hash.String}
	}
	// rows.Err() is non-fatal for cache reads; log and return what we have
	if err := rows.Err(); err != nil {
		slog.Warn("cache iteration error", "error", err)
	}

	return result
}

// GetCachedInsightEmbedding retrieves the insight-only embedding for a lesson.
// Returns nil if no cached data exists or the hash doesn't match expectedHash.
func GetCachedInsightEmbedding(db *sql.DB, id string, expectedHash string) []float64 {
	var blob []byte
	var hash sql.NullString

	err := db.QueryRow("SELECT embedding_insight, content_hash_insight FROM lessons WHERE id = ?", id).Scan(&blob, &hash)
	if err != nil {
		return nil
	}

	if !hash.Valid || len(blob) == 0 {
		return nil
	}

	if hash.String != expectedHash {
		return nil
	}

	return blobToFloat64(blob)
}

// SetCachedInsightEmbedding stores an insight-only embedding and hash.
// UPDATE-only: the lesson row must already exist.
func SetCachedInsightEmbedding(db *sql.DB, id string, embedding []float64, hash string) error {
	blob := float64ToBlob(embedding)
	_, err := db.Exec("UPDATE lessons SET embedding_insight = ?, content_hash_insight = ? WHERE id = ?", blob, hash, id)
	return err
}

// float64ToBlob converts a []float64 to little-endian float32 bytes.
func float64ToBlob(vec []float64) []byte {
	buf := make([]byte, len(vec)*4)
	for i, v := range vec {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(float32(v)))
	}
	return buf
}

// blobToFloat64 converts little-endian float32 bytes to []float64.
func blobToFloat64(blob []byte) []float64 {
	n := len(blob) / 4
	vec := make([]float64, n)
	for i := 0; i < n; i++ {
		bits := binary.LittleEndian.Uint32(blob[i*4:])
		vec[i] = float64(math.Float32frombits(bits))
	}
	return vec
}
