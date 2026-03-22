package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// lessonSelectCols is the explicit column list for lessons queries (no table alias).
// Matches the scan order in scanRowWithRank.
const lessonSelectCols = `id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count, last_retrieved, embedding, content_hash, embedding_insight, content_hash_insight, invalidated_at, invalidation_reason, citation_file, citation_line, citation_commit, compaction_level, compacted_at, pattern_bad, pattern_good`

// lessonSelectColsAliased is the same column list with "l." table alias prefix for JOIN queries.
const lessonSelectColsAliased = `l.id, l.type, l.trigger, l.insight, l.evidence, l.severity, l.tags, l.source, l.context, l.supersedes, l.related, l.created, l.confirmed, l.deleted, l.retrieval_count, l.last_retrieved, l.embedding, l.content_hash, l.embedding_insight, l.content_hash_insight, l.invalidated_at, l.invalidation_reason, l.citation_file, l.citation_line, l.citation_commit, l.compaction_level, l.compacted_at, l.pattern_bad, l.pattern_good`

// ftsOperators are FTS5 special tokens to strip from queries.
var ftsOperators = map[string]bool{
	"AND": true, "OR": true, "NOT": true, "NEAR": true,
}

// SearchDB wraps a sql.DB with search operations.
type SearchDB struct {
	db *sql.DB
}

// NewSearchDB creates a SearchDB from an open database.
func NewSearchDB(db *sql.DB) *SearchDB {
	return &SearchDB{db: db}
}

// Close closes the underlying database.
func (s *SearchDB) Close() error {
	return s.db.Close()
}

// ScoredResult pairs a MemoryItem with a BM25-normalized score.
type ScoredResult struct {
	memory.MemoryItem
	Score float64
}

// SanitizeFtsQuery strips FTS5 special characters and operators.
func SanitizeFtsQuery(query string) string {
	stripped := strings.Map(func(r rune) rune {
		switch r {
		case '"', '*', '^', '+', '-', '(', ')', ':', '{', '}':
			return -1
		default:
			return r
		}
	}, query)

	tokens := strings.Fields(stripped)
	var filtered []string
	for _, t := range tokens {
		if !ftsOperators[t] {
			filtered = append(filtered, t)
		}
	}
	return strings.Join(filtered, " ")
}

// SearchKeyword searches using FTS5 MATCH.
func (s *SearchDB) SearchKeyword(query string, limit int, typeFilter memory.MemoryItemType) ([]memory.MemoryItem, error) {
	sanitized := SanitizeFtsQuery(query)
	if sanitized == "" {
		return nil, nil
	}

	rows, err := s.executeFts(sanitized, limit, typeFilter, false)
	if err != nil {
		return nil, err
	}

	var items []memory.MemoryItem
	for _, r := range rows {
		items = append(items, r.MemoryItem)
	}
	return items, nil
}

// SearchKeywordScored searches using FTS5 with normalized BM25 scores.
func (s *SearchDB) SearchKeywordScored(query string, limit int, typeFilter memory.MemoryItemType) ([]ScoredResult, error) {
	sanitized := SanitizeFtsQuery(query)
	if sanitized == "" {
		return nil, nil
	}

	return s.executeFts(sanitized, limit, typeFilter, true)
}

// ReadAll reads all non-invalidated memory items from SQLite.
func (s *SearchDB) ReadAll() ([]memory.MemoryItem, error) {
	rows, err := s.db.Query(`SELECT ` + lessonSelectCols + `
		FROM lessons WHERE invalidated_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []memory.MemoryItem
	for rows.Next() {
		item, err := scanRow(rows)
		if err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SearchDB) executeFts(sanitized string, limit int, typeFilter memory.MemoryItemType, withRank bool) ([]ScoredResult, error) {
	selectCols := lessonSelectColsAliased
	orderClause := ""
	if withRank {
		selectCols = lessonSelectColsAliased + ", fts.rank"
		orderClause = "ORDER BY fts.rank"
	}

	typeClause := ""
	args := []interface{}{sanitized}
	if typeFilter != "" {
		typeClause = "AND l.type = ?"
		args = append(args, string(typeFilter))
	}
	args = append(args, limit)

	query := `SELECT ` + selectCols + `
		FROM lessons l
		JOIN lessons_fts fts ON l.rowid = fts.rowid
		WHERE lessons_fts MATCH ?
		  AND l.invalidated_at IS NULL
		  ` + typeClause + `
		` + orderClause + `
		LIMIT ?`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("FTS search: %w", err)
	}
	defer rows.Close()

	var results []ScoredResult
	for rows.Next() {
		item, rank, err := scanRowWithRank(rows, withRank)
		if err != nil {
			continue
		}
		score := 0.0
		if withRank {
			score = normalizeBm25Rank(rank)
		}
		results = append(results, ScoredResult{MemoryItem: item, Score: score})
	}
	return results, rows.Err()
}

// normalizeBm25Rank converts FTS5's negative rank to [0, 1].
// Uses |rank| / (1 + |rank|) for a bounded monotonic transformation.
func normalizeBm25Rank(rank float64) float64 {
	if math.IsInf(rank, 0) || math.IsNaN(rank) {
		return 0
	}
	abs := math.Abs(rank)
	return abs / (1 + abs)
}

// scanRow scans a lessons row into a MemoryItem.
func scanRow(rows *sql.Rows) (memory.MemoryItem, error) {
	item, _, err := scanRowWithRank(rows, false)
	return item, err
}

// scanRowWithRank scans a lessons row, optionally including FTS5 rank.
func scanRowWithRank(rows *sql.Rows, withRank bool) (memory.MemoryItem, float64, error) {
	var (
		id, typ, trigger, insight string
		evidence, severity        sql.NullString
		tags, source, context     string
		supersedes, related       string
		created                   string
		confirmed, deleted        int
		retrievalCount            int
		lastRetrieved             sql.NullString
		embedding                 sql.RawBytes
		contentHash               sql.NullString
		embeddingInsight          sql.RawBytes
		contentHashInsight        sql.NullString
		invalidatedAt             sql.NullString
		invalidationReason        sql.NullString
		citFile                   sql.NullString
		citLine                   sql.NullInt64
		citCommit                 sql.NullString
		compactionLevel           sql.NullInt64
		compactedAt               sql.NullString
		patternBad                sql.NullString
		patternGood               sql.NullString
		rank                      float64
	)

	dest := []interface{}{
		&id, &typ, &trigger, &insight, &evidence, &severity,
		&tags, &source, &context, &supersedes, &related,
		&created, &confirmed, &deleted, &retrievalCount, &lastRetrieved,
		&embedding, &contentHash, &embeddingInsight, &contentHashInsight,
		&invalidatedAt, &invalidationReason,
		&citFile, &citLine, &citCommit,
		&compactionLevel, &compactedAt,
		&patternBad, &patternGood,
	}
	if withRank {
		dest = append(dest, &rank)
	}

	if err := rows.Scan(dest...); err != nil {
		return memory.MemoryItem{}, 0, err
	}

	item := memory.MemoryItem{
		ID:        id,
		Type:      memory.MemoryItemType(typ),
		Trigger:   trigger,
		Insight:   insight,
		Source:    memory.Source(source),
		Created:   created,
		Confirmed: confirmed == 1,
	}

	// Tags: comma-separated
	if tags != "" {
		item.Tags = strings.Split(tags, ",")
	} else {
		item.Tags = []string{}
	}

	// JSON fields — log but don't fail on corrupt data
	if err := json.Unmarshal([]byte(context), &item.Context); err != nil {
		fmt.Fprintf(os.Stderr, "[ca] warning: corrupt context JSON for %s: %v\n", id, err)
	}
	if err := json.Unmarshal([]byte(supersedes), &item.Supersedes); err != nil {
		fmt.Fprintf(os.Stderr, "[ca] warning: corrupt supersedes JSON for %s: %v\n", id, err)
	}
	if err := json.Unmarshal([]byte(related), &item.Related); err != nil {
		fmt.Fprintf(os.Stderr, "[ca] warning: corrupt related JSON for %s: %v\n", id, err)
	}
	if item.Supersedes == nil {
		item.Supersedes = []string{}
	}
	if item.Related == nil {
		item.Related = []string{}
	}

	// Optional fields
	if evidence.Valid {
		item.Evidence = &evidence.String
	}
	if severity.Valid {
		sev := memory.Severity(severity.String)
		item.Severity = &sev
	}
	if deleted == 1 {
		b := true
		item.Deleted = &b
	}
	if retrievalCount > 0 {
		item.RetrievalCount = &retrievalCount
	}
	if lastRetrieved.Valid {
		item.LastRetrieved = &lastRetrieved.String
	}
	if invalidatedAt.Valid {
		item.InvalidatedAt = &invalidatedAt.String
	}
	if invalidationReason.Valid {
		item.InvalidationReason = &invalidationReason.String
	}
	if citFile.Valid {
		cit := memory.Citation{File: citFile.String}
		if citLine.Valid {
			l := int(citLine.Int64)
			cit.Line = &l
		}
		if citCommit.Valid {
			cit.Commit = &citCommit.String
		}
		item.Citation = &cit
	}
	if compactionLevel.Valid && compactionLevel.Int64 != 0 {
		cl := int(compactionLevel.Int64)
		item.CompactionLevel = &cl
	}
	if compactedAt.Valid {
		item.CompactedAt = &compactedAt.String
	}
	if patternBad.Valid && patternGood.Valid {
		item.Pattern = &memory.Pattern{Bad: patternBad.String, Good: patternGood.String}
	}

	return item, rank, nil
}
