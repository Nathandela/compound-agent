package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite" // Pure-Go SQLite driver (CGO_ENABLED=0)
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
	if path == ":memory:" {
		// In-memory DBs skip WAL and busy-timeout DSN parameters: WAL is
		// irrelevant and busy-timeout is unnecessary for single-connection
		// in-process databases (used only in tests).
		db, err := sql.Open("sqlite", path)
		if err != nil {
			return nil, fmt.Errorf("open: %w", err)
		}
		return initSchema(db)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create dir: %w", err)
	}
	return lockedOpenDB(path)
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

	db, err := sql.Open("sqlite", path)
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

// initSchema applies the DDL and sets the schema version on an open database.
func initSchema(db *sql.DB) (*sql.DB, error) {
	if _, err := db.Exec(schemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("create schema: %w", err)
	}
	if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", SchemaVersion)); err != nil {
		db.Close()
		return nil, fmt.Errorf("set version: %w", err)
	}
	return db, nil
}

// lockedOpenDB acquires a blocking OS-level flock and holds it across the
// entire check-version, remove-stale, open, apply-schema, set-version cycle.
// This prevents concurrent processes from racing to delete/recreate the DB.
// The flock is automatically released on process death.
func lockedOpenDB(path string) (*sql.DB, error) {
	lockPath := path + ".lock"

	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	defer f.Close()

	// Blocking exclusive lock; waits for other processes to finish.
	if err := flockExclusive(f); err != nil {
		return nil, fmt.Errorf("flock: %w", err)
	}
	defer func() { _ = flockUnlock(f) }()

	// Under lock: check version, remove stale file if needed.
	// Remove WAL/SHM alongside the main DB to prevent corruption from
	// orphaned journal files being applied to a freshly created database.
	if needsRebuild(path) {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			if err := os.Remove(path + suffix); err != nil && !os.IsNotExist(err) {
				return nil, fmt.Errorf("remove stale db %s: %w", path+suffix, err)
			}
		}
	}

	// Open (or create) the database and apply schema — still under lock.
	dsn := buildDSN(path, false)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	return initSchema(db)
}

// buildDSN constructs a SQLite DSN from a path, appending WAL journal mode
// for on-disk databases. Uses modernc.org/sqlite _pragma parameter format.
func buildDSN(path string, isMemory bool) string {
	if isMemory {
		return path
	}
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	return path + sep + "_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
}
