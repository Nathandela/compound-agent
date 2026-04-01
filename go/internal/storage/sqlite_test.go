package storage

import (
	"database/sql"
	"testing"
)

func TestOpenDB_InMemory(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer db.Close()

	if db == nil {
		t.Fatal("expected non-nil db")
	}
}

func TestOpenDB_SchemaCreated(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Verify lessons table exists
	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons'").Scan(&name)
	if err != nil {
		t.Fatalf("lessons table not found: %v", err)
	}

	// Verify FTS5 virtual table exists
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons_fts'").Scan(&name)
	if err != nil {
		t.Fatalf("lessons_fts table not found: %v", err)
	}

	// Verify metadata table exists
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'").Scan(&name)
	if err != nil {
		t.Fatalf("metadata table not found: %v", err)
	}
}

func TestOpenDB_WALMode(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"

	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var mode string
	err = db.QueryRow("PRAGMA journal_mode").Scan(&mode)
	if err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want 'wal'", mode)
	}
}

func TestOpenDB_SchemaVersion(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var version int
	err = db.QueryRow("PRAGMA user_version").Scan(&version)
	if err != nil {
		t.Fatal(err)
	}
	if version != SchemaVersion {
		t.Errorf("user_version = %d, want %d", version, SchemaVersion)
	}
}

func TestOpenDB_ColumnNames(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	expected := []string{
		"id", "type", "trigger", "insight", "evidence", "severity",
		"tags", "source", "context", "supersedes", "related",
		"created", "confirmed", "deleted", "retrieval_count",
		"last_retrieved", "embedding", "content_hash",
		"embedding_insight", "content_hash_insight",
		"invalidated_at", "invalidation_reason",
		"citation_file", "citation_line", "citation_commit",
		"compaction_level", "compacted_at",
		"pattern_bad", "pattern_good",
	}

	rows, err := db.Query("PRAGMA table_info(lessons)")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		columns = append(columns, name)
	}

	if len(columns) != len(expected) {
		t.Fatalf("got %d columns, want %d", len(columns), len(expected))
	}

	for i, col := range columns {
		if col != expected[i] {
			t.Errorf("column %d: got %q, want %q", i, col, expected[i])
		}
	}
}

func TestOpenDB_Indexes(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	expectedIndexes := []string{
		"idx_lessons_created",
		"idx_lessons_confirmed",
		"idx_lessons_severity",
		"idx_lessons_type",
	}

	for _, idx := range expectedIndexes {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='index' AND name=?", idx).Scan(&name)
		if err != nil {
			t.Errorf("index %q not found: %v", idx, err)
		}
	}
}

func TestOpenDB_Triggers(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	expectedTriggers := []string{
		"lessons_ai", // after insert
		"lessons_ad", // after delete
		"lessons_au", // after update
	}

	for _, trig := range expectedTriggers {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?", trig).Scan(&name)
		if err != nil {
			t.Errorf("trigger %q not found: %v", trig, err)
		}
	}
}

func TestOpenDB_InsertAndQuery(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
		VALUES ('L001', 'lesson', 'test trigger', 'test insight', 'tag1,tag2', 'manual', '{"tool":"bash","intent":"test"}', '[]', '[]', '2026-01-01T00:00:00Z', 1)`)
	if err != nil {
		t.Fatalf("insert: %v", err)
	}

	var id, typ string
	err = db.QueryRow("SELECT id, type FROM lessons WHERE id = 'L001'").Scan(&id, &typ)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if id != "L001" || typ != "lesson" {
		t.Errorf("got id=%q type=%q, want L001/lesson", id, typ)
	}
}

func TestOpenDB_FTS5Works(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Insert a lesson (trigger should auto-populate FTS5 via trigger)
	_, err = db.Exec(`INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
		VALUES ('L001', 'lesson', 'test trigger', 'test insight', 'tag1,tag2', 'manual', '{}', '[]', '[]', '2026-01-01T00:00:00Z', 0)`)
	if err != nil {
		t.Fatal(err)
	}

	// Search via FTS5
	var count int
	err = db.QueryRow(`SELECT COUNT(*) FROM lessons l JOIN lessons_fts fts ON l.rowid = fts.rowid WHERE lessons_fts MATCH 'trigger'`).Scan(&count)
	if err != nil {
		t.Fatalf("FTS5 search: %v", err)
	}
	if count != 1 {
		t.Errorf("FTS5 count = %d, want 1", count)
	}
}

func TestBuildDSN(t *testing.T) {
	tests := []struct {
		path     string
		isMemory bool
		want     string
	}{
		{"test.sqlite", false, "test.sqlite?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"},
		{"test.sqlite?mode=rwc", false, "test.sqlite?mode=rwc&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"},
		{":memory:", true, ":memory:"},
		{"file::memory:?cache=shared", true, "file::memory:?cache=shared"},
	}
	for _, tt := range tests {
		got := buildDSN(tt.path, tt.isMemory)
		if got != tt.want {
			t.Errorf("buildDSN(%q, %v) = %q, want %q", tt.path, tt.isMemory, got, tt.want)
		}
	}
}

func TestOpenDB_TelemetryTable(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Verify telemetry table exists
	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='telemetry'").Scan(&name)
	if err != nil {
		t.Fatalf("telemetry table not found: %v", err)
	}

	// Verify telemetry columns
	expectedCols := []string{
		"id", "timestamp", "event_type", "hook_name", "phase",
		"duration_ms", "success", "query_hash", "metadata",
	}
	rows, err := db.Query("PRAGMA table_info(telemetry)")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	var columns []string
	for rows.Next() {
		var cid int
		var colName, typ string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &colName, &typ, &notnull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		columns = append(columns, colName)
	}

	if len(columns) != len(expectedCols) {
		t.Fatalf("telemetry: got %d columns, want %d: %v", len(columns), len(expectedCols), columns)
	}
	for i, col := range columns {
		if col != expectedCols[i] {
			t.Errorf("telemetry column %d: got %q, want %q", i, col, expectedCols[i])
		}
	}
}

func TestOpenDB_TelemetryInsert(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`INSERT INTO telemetry (timestamp, event_type, hook_name, phase, duration_ms, success, query_hash, metadata)
		VALUES ('2026-01-01T00:00:00Z', 'hook_execution', 'user-prompt', 'retrieve', 42, 1, 'abc123', '{"key":"val"}')`)
	if err != nil {
		t.Fatalf("insert telemetry: %v", err)
	}

	var id int64
	var eventType, hookName string
	var durationMs int64
	var success int
	err = db.QueryRow("SELECT id, event_type, hook_name, duration_ms, success FROM telemetry WHERE id = 1").
		Scan(&id, &eventType, &hookName, &durationMs, &success)
	if err != nil {
		t.Fatalf("query telemetry: %v", err)
	}
	if eventType != "hook_execution" || hookName != "user-prompt" || durationMs != 42 || success != 1 {
		t.Errorf("got (%q, %q, %d, %d), want (hook_execution, user-prompt, 42, 1)", eventType, hookName, durationMs, success)
	}
}

func TestOpenDB_TelemetryIndex(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	expectedIndexes := []string{
		"idx_telemetry_timestamp",
		"idx_telemetry_event_type",
		"idx_telemetry_hook_name",
	}
	for _, idx := range expectedIndexes {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='index' AND name=?", idx).Scan(&name)
		if err != nil {
			t.Errorf("index %q not found: %v", idx, err)
		}
	}
}

func TestOpenDB_SchemaVersionIs7(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var version int
	err = db.QueryRow("PRAGMA user_version").Scan(&version)
	if err != nil {
		t.Fatal(err)
	}
	if version != 7 {
		t.Errorf("schema version = %d, want 7", version)
	}
}

func TestOpenDB_VersionMismatch_Rebuild(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"

	// Create DB with current schema
	db1, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	// Set wrong version
	db1.Exec("PRAGMA user_version = 1")
	db1.Close()

	// Reopen - should rebuild
	db2, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()

	var version int
	db2.QueryRow("PRAGMA user_version").Scan(&version)
	if version != SchemaVersion {
		t.Errorf("after rebuild: version = %d, want %d", version, SchemaVersion)
	}
}
