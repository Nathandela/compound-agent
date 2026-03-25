package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
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

// ScoredResult pairs a Item with a BM25-normalized score.
type ScoredResult struct {
	memory.Item
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
func (s *SearchDB) SearchKeyword(query string, limit int, typeFilter memory.ItemType) ([]memory.Item, error) {
	sanitized := SanitizeFtsQuery(query)
	if sanitized == "" {
		return nil, nil
	}

	rows, err := s.executeFts(sanitized, limit, typeFilter, false)
	if err != nil {
		return nil, err
	}

	var items []memory.Item
	for _, r := range rows {
		items = append(items, r.Item)
	}
	return items, nil
}

// SearchKeywordScored searches using FTS5 with normalized BM25 scores.
func (s *SearchDB) SearchKeywordScored(query string, limit int, typeFilter memory.ItemType) ([]ScoredResult, error) {
	sanitized := SanitizeFtsQuery(query)
	if sanitized == "" {
		return nil, nil
	}

	return s.executeFts(sanitized, limit, typeFilter, true)
}

// SearchKeywordScoredOR searches using FTS5 with OR between tokens.
// Each token is sanitized individually. This provides broader matching than
// the default implicit-AND behavior, returning results that match any term.
func (s *SearchDB) SearchKeywordScoredOR(tokens []string, limit int, typeFilter memory.ItemType) ([]ScoredResult, error) {
	var sanitized []string
	for _, t := range tokens {
		clean := SanitizeFtsQuery(t)
		if clean != "" {
			sanitized = append(sanitized, clean)
		}
	}
	if len(sanitized) == 0 {
		return nil, nil
	}

	query := strings.Join(sanitized, " OR ")
	return s.executeFts(query, limit, typeFilter, true)
}

// ReadAll reads all non-invalidated memory items from SQLite.
func (s *SearchDB) ReadAll() ([]memory.Item, error) {
	rows, err := s.db.Query(`SELECT ` + lessonSelectCols + `
		FROM lessons WHERE invalidated_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []memory.Item
	for rows.Next() {
		item, err := scanRow(rows)
		if err != nil {
			continue
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SearchDB) executeFts(sanitized string, limit int, typeFilter memory.ItemType, withRank bool) ([]ScoredResult, error) {
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
		results = append(results, ScoredResult{Item: item, Score: score})
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

// scanRow scans a lessons row into a Item.
func scanRow(rows *sql.Rows) (memory.Item, error) {
	item, _, err := scanRowWithRank(rows, false)
	return item, err
}

// rawFields holds the raw scanned SQL values before conversion to memory.Item.
type rawFields struct {
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
}

// scanNullableFields scans a SQL row into rawFields and an optional rank value.
func scanNullableFields(rows *sql.Rows, withRank bool) (rawFields, float64, error) {
	var raw rawFields
	var rank float64

	dest := []interface{}{
		&raw.id, &raw.typ, &raw.trigger, &raw.insight, &raw.evidence, &raw.severity,
		&raw.tags, &raw.source, &raw.context, &raw.supersedes, &raw.related,
		&raw.created, &raw.confirmed, &raw.deleted, &raw.retrievalCount, &raw.lastRetrieved,
		&raw.embedding, &raw.contentHash, &raw.embeddingInsight, &raw.contentHashInsight,
		&raw.invalidatedAt, &raw.invalidationReason,
		&raw.citFile, &raw.citLine, &raw.citCommit,
		&raw.compactionLevel, &raw.compactedAt,
		&raw.patternBad, &raw.patternGood,
	}
	if withRank {
		dest = append(dest, &rank)
	}

	if err := rows.Scan(dest...); err != nil {
		return rawFields{}, 0, err
	}
	return raw, rank, nil
}

// convertToItem maps raw scanned fields to a memory.Item.
func convertToItem(raw rawFields) memory.Item {
	item := memory.Item{
		ID:        raw.id,
		Type:      memory.ItemType(raw.typ),
		Trigger:   raw.trigger,
		Insight:   raw.insight,
		Source:    memory.Source(raw.source),
		Created:   raw.created,
		Confirmed: raw.confirmed == 1,
	}

	// Tags: comma-separated
	if raw.tags != "" {
		item.Tags = strings.Split(raw.tags, ",")
	} else {
		item.Tags = []string{}
	}

	// JSON fields — log but don't fail on corrupt data
	if err := json.Unmarshal([]byte(raw.context), &item.Context); err != nil {
		slog.Warn("corrupt context JSON", "id", raw.id, "error", err)
	}
	if err := json.Unmarshal([]byte(raw.supersedes), &item.Supersedes); err != nil {
		slog.Warn("corrupt supersedes JSON", "id", raw.id, "error", err)
	}
	if err := json.Unmarshal([]byte(raw.related), &item.Related); err != nil {
		slog.Warn("corrupt related JSON", "id", raw.id, "error", err)
	}
	if item.Supersedes == nil {
		item.Supersedes = []string{}
	}
	if item.Related == nil {
		item.Related = []string{}
	}

	applyOptionalFields(&item, raw)
	return item
}

// applyOptionalFields sets optional/nullable fields on a memory.Item from raw scan data.
func applyOptionalFields(item *memory.Item, raw rawFields) {
	applyScalarFields(item, raw)
	applyCitationAndPattern(item, raw)
}

// applyScalarFields sets simple optional scalar fields from raw scan data.
func applyScalarFields(item *memory.Item, raw rawFields) {
	if raw.evidence.Valid {
		item.Evidence = &raw.evidence.String
	}
	if raw.severity.Valid {
		sev := memory.Severity(raw.severity.String)
		item.Severity = &sev
	}
	if raw.deleted == 1 {
		b := true
		item.Deleted = &b
	}
	if raw.retrievalCount > 0 {
		item.RetrievalCount = &raw.retrievalCount
	}
	applyTimestampFields(item, raw)
}

// applyTimestampFields sets time-related and compaction optional fields.
func applyTimestampFields(item *memory.Item, raw rawFields) {
	if raw.lastRetrieved.Valid {
		item.LastRetrieved = &raw.lastRetrieved.String
	}
	if raw.invalidatedAt.Valid {
		item.InvalidatedAt = &raw.invalidatedAt.String
	}
	if raw.invalidationReason.Valid {
		item.InvalidationReason = &raw.invalidationReason.String
	}
	if raw.compactionLevel.Valid && raw.compactionLevel.Int64 != 0 {
		cl := int(raw.compactionLevel.Int64)
		item.CompactionLevel = &cl
	}
	if raw.compactedAt.Valid {
		item.CompactedAt = &raw.compactedAt.String
	}
}

// applyCitationAndPattern sets the compound citation and pattern fields from raw scan data.
func applyCitationAndPattern(item *memory.Item, raw rawFields) {
	if raw.citFile.Valid {
		cit := memory.Citation{File: raw.citFile.String}
		if raw.citLine.Valid {
			l := int(raw.citLine.Int64)
			cit.Line = &l
		}
		if raw.citCommit.Valid {
			cit.Commit = &raw.citCommit.String
		}
		item.Citation = &cit
	}
	if raw.patternBad.Valid && raw.patternGood.Valid {
		item.Pattern = &memory.Pattern{Bad: raw.patternBad.String, Good: raw.patternGood.String}
	}
}

// scanRowWithRank scans a lessons row, optionally including FTS5 rank.
func scanRowWithRank(rows *sql.Rows, withRank bool) (memory.Item, float64, error) {
	raw, rank, err := scanNullableFields(rows, withRank)
	if err != nil {
		return memory.Item{}, 0, err
	}
	return convertToItem(raw), rank, nil
}
