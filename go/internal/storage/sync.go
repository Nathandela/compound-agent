package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

const insertSQL = `INSERT INTO lessons (
	id, type, trigger, insight, evidence, severity,
	tags, source, context, supersedes, related,
	created, confirmed, deleted, retrieval_count, last_retrieved,
	invalidated_at, invalidation_reason,
	citation_file, citation_line, citation_commit,
	compaction_level, compacted_at,
	pattern_bad, pattern_good
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

// RebuildIndex rebuilds the SQLite index from JSONL source of truth.
func RebuildIndex(db *sql.DB, repoRoot string) error {
	result, err := memory.ReadMemoryItems(repoRoot)
	if err != nil {
		return fmt.Errorf("read JSONL: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM lessons"); err != nil {
		return fmt.Errorf("delete: %w", err)
	}

	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for _, item := range result.Items {
		if err := insertItem(stmt, &item); err != nil {
			return fmt.Errorf("insert %s: %w", item.ID, err)
		}
	}

	// Store JSONL mtime
	mtime := getJsonlMtime(repoRoot)
	if mtime > 0 {
		if err := setLastSyncMtime(tx, mtime); err != nil {
			return fmt.Errorf("set sync mtime: %w", err)
		}
	}

	return tx.Commit()
}

// SyncIfNeeded syncs the SQLite index if the JSONL file has changed.
func SyncIfNeeded(db *sql.DB, repoRoot string, force bool) (bool, error) {
	mtime := getJsonlMtime(repoRoot)
	if mtime == 0 && !force {
		return false, nil
	}

	lastSync := getLastSyncMtime(db)
	needsRebuild := force || lastSync == 0 || (mtime > 0 && mtime > lastSync)

	if !needsRebuild {
		return false, nil
	}

	if err := RebuildIndex(db, repoRoot); err != nil {
		return false, err
	}
	return true, nil
}

func insertItem(stmt *sql.Stmt, item *memory.MemoryItem) error {
	contextJSON, _ := json.Marshal(item.Context)
	supersedesJSON, _ := json.Marshal(item.Supersedes)
	relatedJSON, _ := json.Marshal(item.Related)

	var confirmed, deleted, retrievalCount int
	if item.Confirmed {
		confirmed = 1
	}
	if item.Deleted != nil && *item.Deleted {
		deleted = 1
	}
	if item.RetrievalCount != nil {
		retrievalCount = *item.RetrievalCount
	}

	tags := strings.Join(item.Tags, ",")
	compactionLevel := 0
	if item.CompactionLevel != nil {
		compactionLevel = *item.CompactionLevel
	}

	_, err := stmt.Exec(
		item.ID, string(item.Type), item.Trigger, item.Insight,
		nullStr(item.Evidence), nullSeverity(item.Severity),
		tags, string(item.Source), string(contextJSON),
		string(supersedesJSON), string(relatedJSON),
		item.Created, confirmed, deleted, retrievalCount,
		nullStr(item.LastRetrieved),
		nullStr(item.InvalidatedAt), nullStr(item.InvalidationReason),
		citFile(item.Citation), citLine(item.Citation), citCommit(item.Citation),
		compactionLevel, nullStr(item.CompactedAt),
		patBad(item.Pattern), patGood(item.Pattern),
	)
	return err
}

func getJsonlMtime(repoRoot string) float64 {
	path := filepath.Join(repoRoot, memory.LessonsPath)
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return float64(info.ModTime().UnixMilli())
}

func getLastSyncMtime(db *sql.DB) float64 {
	var value string
	err := db.QueryRow("SELECT value FROM metadata WHERE key = 'last_sync_mtime'").Scan(&value)
	if err != nil {
		return 0
	}
	f, _ := strconv.ParseFloat(value, 64)
	return f
}

func setLastSyncMtime(tx *sql.Tx, mtime float64) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_sync_mtime', ?)",
		strconv.FormatFloat(mtime, 'f', -1, 64))
	return err
}

// Null helpers for optional fields
func nullStr(s *string) interface{} {
	if s == nil {
		return nil
	}
	return *s
}

func nullSeverity(s *memory.Severity) interface{} {
	if s == nil {
		return nil
	}
	return string(*s)
}

func citFile(c *memory.Citation) interface{} {
	if c == nil {
		return nil
	}
	return c.File
}

func citLine(c *memory.Citation) interface{} {
	if c == nil || c.Line == nil {
		return nil
	}
	return *c.Line
}

func citCommit(c *memory.Citation) interface{} {
	if c == nil || c.Commit == nil {
		return nil
	}
	return *c.Commit
}

func patBad(p *memory.Pattern) interface{} {
	if p == nil {
		return nil
	}
	return p.Bad
}

func patGood(p *memory.Pattern) interface{} {
	if p == nil {
		return nil
	}
	return p.Good
}
