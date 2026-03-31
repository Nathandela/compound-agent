package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3" // SQLite driver registration
)

// SchemaVersion is the current schema version for migration detection.
const SchemaVersion = 7

// DBPath is the relative path to the SQLite database from repo root.
const DBPath = ".claude/.cache/lessons.sqlite"

const schemaDDL = `
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    trigger TEXT NOT NULL,
    insight TEXT NOT NULL,
    evidence TEXT,
    severity TEXT,
    tags TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    supersedes TEXT NOT NULL DEFAULT '[]',
    related TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    retrieval_count INTEGER NOT NULL DEFAULT 0,
    last_retrieved TEXT,
    embedding BLOB,
    content_hash TEXT,
    embedding_insight BLOB,
    content_hash_insight TEXT,
    invalidated_at TEXT,
    invalidation_reason TEXT,
    citation_file TEXT,
    citation_line INTEGER,
    citation_commit TEXT,
    compaction_level INTEGER DEFAULT 0,
    compacted_at TEXT,
    pattern_bad TEXT,
    pattern_good TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    id, trigger, insight, tags, pattern_bad, pattern_good,
    content='lessons', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags, new.pattern_bad, new.pattern_good);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_ad AFTER DELETE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags, old.pattern_bad, old.pattern_good);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE OF id, trigger, insight, tags, pattern_bad, pattern_good ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags, old.pattern_bad, old.pattern_good);
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags, new.pattern_bad, new.pattern_good);
  END;

  CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created);
  CREATE INDEX IF NOT EXISTS idx_lessons_confirmed ON lessons(confirmed);
  CREATE INDEX IF NOT EXISTS idx_lessons_severity ON lessons(severity);
  CREATE INDEX IF NOT EXISTS idx_lessons_type ON lessons(type);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    hook_name TEXT NOT NULL DEFAULT '',
    phase TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    query_hash TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);
  CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry(event_type);
  CREATE INDEX IF NOT EXISTS idx_telemetry_hook_name ON telemetry(hook_name);
`

// OpenDB opens or creates a SQLite database with the lessons schema.
// For in-memory databases, pass ":memory:".
// If the on-disk DB has an older schema version, it is deleted and recreated.
func OpenDB(path string) (*sql.DB, error) {
	isMemory := path == ":memory:"

	if !isMemory {
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create dir: %w", err)
		}

		// Check existing DB version; use file-based lock to prevent
		// concurrent processes from racing to delete/recreate the DB.
		if needsRebuild(path) {
			if err := lockedRebuild(path); err != nil {
				return nil, fmt.Errorf("locked rebuild: %w", err)
			}
		}
	}

	dsn := buildDSN(path, isMemory)

	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}

	if _, err := db.Exec(schemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("create schema: %w", err)
	}

	// Set schema version
	if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", SchemaVersion)); err != nil {
		db.Close()
		return nil, fmt.Errorf("set version: %w", err)
	}

	return db, nil
}

// OpenRepoDB opens the standard lessons.sqlite for a given repo root.
func OpenRepoDB(repoRoot string) (*sql.DB, error) {
	return OpenDB(filepath.Join(repoRoot, DBPath))
}

// needsRebuild checks if an existing DB has a mismatched schema version.
func needsRebuild(path string) bool {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return false
	}

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return true
	}
	defer db.Close()

	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return true
	}

	return version != SchemaVersion
}

// lockedRebuild acquires a file-based lock before deleting a stale DB.
// If the lock is already held by another process, it skips the rebuild
// and lets OpenDB attempt to open the (possibly stale) database.
func lockedRebuild(path string) error {
	lockPath := path + ".lock"

	// Try to acquire lock (exclusive create)
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		// Lock already held — skip rebuild, let OpenDB try with existing file
		return nil
	}
	f.Close()
	defer os.Remove(lockPath)

	// Re-check after acquiring lock (another process may have rebuilt)
	if needsRebuild(path) {
		os.Remove(path)
	}
	return nil
}

// buildDSN constructs a SQLite DSN from a path, appending WAL journal mode
// for on-disk databases. Handles paths that already contain query parameters.
func buildDSN(path string, isMemory bool) string {
	if isMemory {
		return path
	}
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	return path + sep + "_journal_mode=WAL"
}
