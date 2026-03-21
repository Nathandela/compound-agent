// Package main validates FTS5 parity between go-sqlite3 and better-sqlite3.
// It imports lessons from fts5-test-data.json, runs queries from fts5-reference.json,
// and compares results to verify identical behavior.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// Lesson represents a row from fts5-test-data.json.
// Only text fields needed for schema + FTS5 indexing are included.
type Lesson struct {
	ID                  string          `json:"id"`
	Type                string          `json:"type"`
	Trigger             string          `json:"trigger"`
	Insight             string          `json:"insight"`
	Evidence            *string         `json:"evidence"`
	Severity            *string         `json:"severity"`
	Tags                string          `json:"tags"`
	Source              string          `json:"source"`
	Context             string          `json:"context"`
	Supersedes          string          `json:"supersedes"`
	Related             string          `json:"related"`
	Created             string          `json:"created"`
	Confirmed           int             `json:"confirmed"`
	Deleted             int             `json:"deleted"`
	RetrievalCount      int             `json:"retrieval_count"`
	LastRetrieved       *string         `json:"last_retrieved"`
	Embedding           json.RawMessage `json:"embedding"`
	ContentHash         *string         `json:"content_hash"`
	EmbeddingInsight    json.RawMessage `json:"embedding_insight"`
	ContentHashInsight  *string         `json:"content_hash_insight"`
	InvalidatedAt       *string         `json:"invalidated_at"`
	InvalidationReason  *string         `json:"invalidation_reason"`
	CitationFile        *string         `json:"citation_file"`
	CitationLine        *int            `json:"citation_line"`
	CitationCommit      *string         `json:"citation_commit"`
	CompactionLevel     *int            `json:"compaction_level"`
	CompactedAt         *string         `json:"compacted_at"`
	PatternBad          *string         `json:"pattern_bad"`
	PatternGood         *string         `json:"pattern_good"`
}

// BufferJSON represents the Node.js Buffer serialization format: {"type":"Buffer","data":[...]}
type BufferJSON struct {
	Type string `json:"type"`
	Data []byte `json:"data"`
}

// ReferenceQuery represents an FTS5 query and its expected results.
type ReferenceQuery struct {
	Query   string           `json:"query"`
	Results []ReferenceResult `json:"results"`
	Error   string           `json:"error,omitempty"`
}

// ReferenceResult represents a single expected result (id + BM25 rank).
type ReferenceResult struct {
	ID   string  `json:"id"`
	Rank float64 `json:"rank"`
}

// ParityResult holds the comparison outcome for a single query.
type ParityResult struct {
	Query      string
	Pass       bool
	Expected   []ReferenceResult
	Got        []ReferenceResult
	HasError   bool
	GotError   string
	SkipReason string
}

const rankTolerance = 1e-6

func main() {
	results, err := RunParityCheck("..")
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}
	PrintResults(results)
	for _, r := range results {
		if !r.Pass {
			os.Exit(1)
		}
	}
}

// RunParityCheck runs the full FTS5 parity check. dataDir is the path to
// the directory containing fts5-test-data.json, fts5-reference.json, and fts5-schema.json.
func RunParityCheck(dataDir string) ([]ParityResult, error) {
	schemaPath := filepath.Join(dataDir, "fts5-schema.json")
	dataPath := filepath.Join(dataDir, "fts5-test-data.json")
	refPath := filepath.Join(dataDir, "fts5-reference.json")

	// Load schema
	schemaSQL, err := loadSchema(schemaPath)
	if err != nil {
		return nil, fmt.Errorf("load schema: %w", err)
	}

	// Load lessons
	lessons, err := loadLessons(dataPath)
	if err != nil {
		return nil, fmt.Errorf("load lessons: %w", err)
	}

	// Load reference queries
	refQueries, err := loadReference(refPath)
	if err != nil {
		return nil, fmt.Errorf("load reference: %w", err)
	}

	// Create in-memory DB with schema
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	if err := createSchema(db, schemaSQL); err != nil {
		return nil, fmt.Errorf("create schema: %w", err)
	}

	// Insert lessons
	if err := insertLessons(db, lessons); err != nil {
		return nil, fmt.Errorf("insert lessons: %w", err)
	}

	// Verify count
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count); err != nil {
		return nil, fmt.Errorf("count: %w", err)
	}
	fmt.Printf("Imported %d lessons\n", count)

	// Run queries and compare
	results := make([]ParityResult, 0, len(refQueries))
	for _, rq := range refQueries {
		pr := runQuery(db, rq)
		results = append(results, pr)
	}

	return results, nil
}

func loadSchema(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var stmts []string
	if err := json.Unmarshal(data, &stmts); err != nil {
		return nil, err
	}
	return stmts, nil
}

func loadLessons(path string) ([]Lesson, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var lessons []Lesson
	if err := json.Unmarshal(data, &lessons); err != nil {
		return nil, err
	}
	return lessons, nil
}

func loadReference(path string) ([]ReferenceQuery, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var queries []ReferenceQuery
	if err := json.Unmarshal(data, &queries); err != nil {
		return nil, err
	}
	return queries, nil
}

func createSchema(db *sql.DB, stmts []string) error {
	// Execute schema statements in correct order:
	// 1. Regular tables first (lessons, metadata)
	// 2. FTS5 virtual table
	// 3. Triggers
	// Skip the internal FTS5 tables (they're created automatically by FTS5)
	for _, stmt := range stmts {
		// Skip FTS5 internal tables -- they are auto-created
		if isInternalFTS5Table(stmt) {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec %q: %w", stmt[:min(80, len(stmt))], err)
		}
	}
	return nil
}

func isInternalFTS5Table(stmt string) bool {
	// FTS5 creates these internal tables automatically
	internals := []string{
		"lessons_fts_config",
		"lessons_fts_data",
		"lessons_fts_docsize",
		"lessons_fts_idx",
	}
	for _, name := range internals {
		if len(stmt) > 20 && containsSubstring(stmt, name) {
			return true
		}
	}
	return false
}

func containsSubstring(s, sub string) bool {
	return len(s) >= len(sub) && findSubstring(s, sub)
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func parseEmbeddingBlob(raw json.RawMessage) ([]byte, error) {
	if raw == nil || string(raw) == "null" {
		return nil, nil
	}
	var buf BufferJSON
	if err := json.Unmarshal(raw, &buf); err != nil {
		return nil, err
	}
	if buf.Type == "Buffer" {
		return buf.Data, nil
	}
	return nil, nil
}

func insertLessons(db *sql.DB, lessons []Lesson) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO lessons (
		id, type, trigger, insight, evidence, severity, tags, source,
		context, supersedes, related, created, confirmed, deleted,
		retrieval_count, last_retrieved, embedding, content_hash,
		embedding_insight, content_hash_insight, invalidated_at,
		invalidation_reason, citation_file, citation_line, citation_commit,
		compaction_level, compacted_at, pattern_bad, pattern_good
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, l := range lessons {
		emb, err := parseEmbeddingBlob(l.Embedding)
		if err != nil {
			return fmt.Errorf("parse embedding for %s: %w", l.ID, err)
		}
		embIns, err := parseEmbeddingBlob(l.EmbeddingInsight)
		if err != nil {
			return fmt.Errorf("parse embedding_insight for %s: %w", l.ID, err)
		}

		_, err = stmt.Exec(
			l.ID, l.Type, l.Trigger, l.Insight,
			l.Evidence, l.Severity, l.Tags, l.Source,
			l.Context, l.Supersedes, l.Related, l.Created,
			l.Confirmed, l.Deleted, l.RetrievalCount, l.LastRetrieved,
			emb, l.ContentHash,
			embIns, l.ContentHashInsight,
			l.InvalidatedAt, l.InvalidationReason,
			l.CitationFile, l.CitationLine, l.CitationCommit,
			l.CompactionLevel, l.CompactedAt,
			l.PatternBad, l.PatternGood,
		)
		if err != nil {
			return fmt.Errorf("insert %s: %w", l.ID, err)
		}
	}

	return tx.Commit()
}

func runQuery(db *sql.DB, rq ReferenceQuery) ParityResult {
	pr := ParityResult{
		Query:    rq.Query,
		Expected: rq.Results,
	}

	// The "*" query is expected to produce an error in better-sqlite3.
	// Check if go-sqlite3 also errors on it.
	if rq.Error != "" {
		pr.HasError = true
	}

	query := `SELECT l.id, rank
		FROM lessons_fts f
		JOIN lessons l ON l.rowid = f.rowid
		WHERE lessons_fts MATCH ?
		ORDER BY rank`

	rows, err := db.Query(query, rq.Query)
	if err != nil {
		if rq.Error != "" {
			// Both errored -- that's parity
			pr.Pass = true
			pr.GotError = err.Error()
			return pr
		}
		pr.Pass = false
		pr.GotError = err.Error()
		return pr
	}
	defer rows.Close()

	var got []ReferenceResult
	for rows.Next() {
		var r ReferenceResult
		if err := rows.Scan(&r.ID, &r.Rank); err != nil {
			pr.Pass = false
			pr.GotError = err.Error()
			return pr
		}
		got = append(got, r)
	}
	if err := rows.Err(); err != nil {
		if rq.Error != "" {
			pr.Pass = true
			pr.GotError = err.Error()
			return pr
		}
		pr.Pass = false
		pr.GotError = err.Error()
		return pr
	}

	// If reference expected an error but we got results, that's a mismatch
	if rq.Error != "" {
		pr.Pass = false
		pr.Got = got
		pr.GotError = "(no error)"
		return pr
	}

	pr.Got = got
	pr.Pass = compareResults(rq.Results, got)
	return pr
}

func compareResults(expected, got []ReferenceResult) bool {
	if len(expected) != len(got) {
		return false
	}
	for i := range expected {
		if expected[i].ID != got[i].ID {
			return false
		}
		if math.Abs(expected[i].Rank-got[i].Rank) > rankTolerance {
			return false
		}
	}
	return true
}

// PrintResults prints a formatted summary of parity check results.
func PrintResults(results []ParityResult) {
	passed := 0
	failed := 0
	fmt.Println()
	fmt.Println("=== FTS5 Parity Check Results ===")
	fmt.Println()

	for _, r := range results {
		status := "PASS"
		if !r.Pass {
			status = "FAIL"
			failed++
		} else {
			passed++
		}

		fmt.Printf("[%s] Query: %q\n", status, r.Query)

		if !r.Pass {
			if r.GotError != "" {
				fmt.Printf("       Error: %s\n", r.GotError)
			}
			fmt.Printf("       Expected %d results, got %d\n", len(r.Expected), len(r.Got))
			if len(r.Expected) > 0 && len(r.Got) > 0 {
				minLen := len(r.Expected)
				if len(r.Got) < minLen {
					minLen = len(r.Got)
				}
				for i := 0; i < minLen; i++ {
					e := r.Expected[i]
					g := r.Got[i]
					if e.ID != g.ID {
						fmt.Printf("       [%d] ID mismatch: expected %s, got %s\n", i, e.ID, g.ID)
					} else if math.Abs(e.Rank-g.Rank) > rankTolerance {
						fmt.Printf("       [%d] Rank mismatch for %s: expected %.15f, got %.15f (delta=%.2e)\n",
							i, e.ID, e.Rank, g.Rank, math.Abs(e.Rank-g.Rank))
					}
				}
			}
		} else if r.HasError {
			fmt.Printf("       (both errored as expected)\n")
		} else {
			fmt.Printf("       %d results matched\n", len(r.Expected))
		}
	}

	fmt.Println()
	fmt.Printf("=== Summary: %d/%d queries passed ===\n", passed, passed+failed)
	if failed > 0 {
		fmt.Printf("    %d queries FAILED\n", failed)
	} else {
		fmt.Println("    ALL QUERIES MATCH -- FTS5 parity confirmed!")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
