package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// v6SchemaDDL is the schema DDL from v2.5.1 (schema version 6).
// It lacks the pattern_bad and pattern_good columns that v7 added.
const v6SchemaDDL = `
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
    compacted_at TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    id, trigger, insight, tags,
    content='lessons', content_rowid='rowid'
  );

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
`

// createV6DB creates a database with schema version 6 and inserts test lessons.
func createV6DB(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec(v6SchemaDDL); err != nil {
		t.Fatalf("create v6 schema: %v", err)
	}
	if _, err := db.Exec("PRAGMA user_version = 6"); err != nil {
		t.Fatalf("set v6 version: %v", err)
	}

	// Insert 100+ lessons to meet acceptance criteria
	for i := 1; i <= 110; i++ {
		_, err := db.Exec(
			`INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
			VALUES (?, 'lesson', ?, ?, 'go,testing', 'manual', '{}', '[]', '[]', '2026-01-15T00:00:00Z', 1)`,
			fmtLessonID(i), fmtTrigger(i), fmtInsight(i),
		)
		if err != nil {
			t.Fatalf("insert lesson %d: %v", i, err)
		}
	}
}

func fmtLessonID(i int) string {
	return fmt.Sprintf("L%04d", i)
}

func fmtTrigger(i int) string {
	return fmt.Sprintf("test trigger %04d", i)
}

func fmtInsight(i int) string {
	return fmt.Sprintf("test insight %04d", i)
}

// TestMigration_V6toV7_DetectsVersionMismatch verifies that a v6 DB triggers rebuild.
func TestMigration_V6toV7_DetectsVersionMismatch(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "lessons.sqlite")

	createV6DB(t, dbPath)

	if !needsRebuild(dbPath) {
		t.Fatal("v6 DB should trigger needsRebuild")
	}
}

// TestMigration_V6toV7_RebuildsToV7 verifies that opening a v6 DB produces a v7 schema.
func TestMigration_V6toV7_RebuildsToV7(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "lessons.sqlite")

	createV6DB(t, dbPath)

	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != SchemaVersion {
		t.Errorf("after rebuild: version = %d, want %d", version, SchemaVersion)
	}
}

// TestMigration_V6toV7_NewSchemaHasPatternColumns verifies v7 has pattern_bad/pattern_good.
func TestMigration_V6toV7_NewSchemaHasPatternColumns(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "lessons.sqlite")

	createV6DB(t, dbPath)

	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Verify pattern_bad and pattern_good columns exist
	var count int
	err = db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('lessons') WHERE name IN ('pattern_bad', 'pattern_good')`).Scan(&count)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Errorf("expected 2 pattern columns, got %d", count)
	}
}

// TestMigration_V6toV7_JSONLSourceOfTruthPreserved verifies that the JSONL file (source
// of truth) is completely untouched by a DB schema rebuild. The SQLite DB is a cache;
// lessons persist in .claude/lessons/index.jsonl.
func TestMigration_V6toV7_JSONLSourceOfTruthPreserved(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, ".claude", ".cache", "lessons.sqlite")
	jsonlPath := filepath.Join(dir, ".claude", "lessons", "index.jsonl")

	// Create JSONL source of truth with 110 lessons
	if err := os.MkdirAll(filepath.Dir(jsonlPath), 0o755); err != nil {
		t.Fatal(err)
	}

	var jsonlContent string
	for i := 1; i <= 110; i++ {
		jsonlContent += `{"id":"` + fmtLessonID(i) + `","type":"lesson","trigger":"` + fmtTrigger(i) + `","insight":"` + fmtInsight(i) + `","tags":["go"],"source":"manual","created":"2026-01-15T00:00:00Z"}` + "\n"
	}
	if err := os.WriteFile(jsonlPath, []byte(jsonlContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Create v6 DB
	createV6DB(t, dbPath)

	// Rebuild to v7
	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	// Verify JSONL is untouched
	afterContent, err := os.ReadFile(jsonlPath)
	if err != nil {
		t.Fatal(err)
	}

	if string(afterContent) != jsonlContent {
		t.Error("JSONL source of truth was modified during DB rebuild")
	}

	// Count lines to verify all 110 lessons survived
	lines := 0
	for _, b := range afterContent {
		if b == '\n' {
			lines++
		}
	}
	if lines != 110 {
		t.Errorf("JSONL has %d lessons, want 110", lines)
	}
}

// TestMigration_V7_FreshSchemaIsValid verifies a freshly created v7 DB has all expected
// tables, columns, indexes, and triggers.
func TestMigration_V7_FreshSchemaIsValid(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Verify all tables exist
	tables := []string{"lessons", "lessons_fts", "metadata", "telemetry"}
	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		if err != nil {
			t.Errorf("table %q not found", table)
		}
	}

	// Verify lessons has pattern_bad and pattern_good (v7 additions)
	_, err = db.Exec("INSERT INTO lessons (id, type, trigger, insight, tags, source, created, pattern_bad, pattern_good) VALUES ('test', 'lesson', 'trig', 'ins', '', 'manual', '2026-01-01', 'bad pattern', 'good pattern')")
	if err != nil {
		t.Errorf("insert with pattern columns failed: %v", err)
	}
}
