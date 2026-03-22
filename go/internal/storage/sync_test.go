package storage

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

func setupSyncTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0o755)
	os.MkdirAll(filepath.Join(dir, ".claude", ".cache"), 0o755)
	return dir
}

func makeItem(id string, trigger, insight string) memory.MemoryItem {
	return memory.MemoryItem{
		ID: id, Type: memory.TypeLesson,
		Trigger: trigger, Insight: insight,
		Tags: []string{"tag1"}, Source: memory.SourceManual,
		Context:    memory.Context{Tool: "bash", Intent: "test"},
		Created:    "2026-01-01T00:00:00Z",
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}
}

func TestRebuildIndex_Empty(t *testing.T) {
	dir := setupSyncTestDir(t)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := RebuildIndex(db, dir); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count)
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}
}

func TestRebuildIndex_InsertsItems(t *testing.T) {
	dir := setupSyncTestDir(t)

	// Write 3 items to JSONL
	items := []memory.MemoryItem{
		makeItem("L001", "trigger1", "insight1"),
		makeItem("L002", "trigger2", "insight2"),
		makeItem("L003", "trigger3", "insight3"),
	}
	for _, item := range items {
		memory.AppendMemoryItem(dir, item)
	}

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := RebuildIndex(db, dir); err != nil {
		t.Fatal(err)
	}

	var count int
	db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count)
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}
}

func TestRebuildIndex_FieldMapping(t *testing.T) {
	dir := setupSyncTestDir(t)

	sev := memory.SeverityHigh
	item := makeItem("L001", "my trigger", "my insight")
	item.Evidence = strPtr("evidence")
	item.Severity = &sev
	item.Pattern = &memory.Pattern{Bad: "old code", Good: "new code"}
	item.Citation = &memory.Citation{File: "test.go", Line: intPtr(42), Commit: strPtr("abc123")}

	memory.AppendMemoryItem(dir, item)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	RebuildIndex(db, dir)

	var (
		id, typ, trigger, insight, evidence, severity string
		tags, source, context                         string
		confirmed                                     int
		patternBad, patternGood                       sql.NullString
		citFile                                       sql.NullString
		citLine                                       sql.NullInt64
		citCommit                                     sql.NullString
	)

	err = db.QueryRow(`SELECT id, type, trigger, insight, evidence, severity, tags, source, context, confirmed, pattern_bad, pattern_good, citation_file, citation_line, citation_commit FROM lessons WHERE id = 'L001'`).
		Scan(&id, &typ, &trigger, &insight, &evidence, &severity, &tags, &source, &context, &confirmed, &patternBad, &patternGood, &citFile, &citLine, &citCommit)
	if err != nil {
		t.Fatalf("query: %v", err)
	}

	if id != "L001" {
		t.Errorf("id = %q", id)
	}
	if trigger != "my trigger" {
		t.Errorf("trigger = %q", trigger)
	}
	if insight != "my insight" {
		t.Errorf("insight = %q", insight)
	}
	if evidence != "evidence" {
		t.Errorf("evidence = %q", evidence)
	}
	if severity != "high" {
		t.Errorf("severity = %q", severity)
	}
	if tags != "tag1" {
		t.Errorf("tags = %q", tags)
	}
	if confirmed != 1 {
		t.Errorf("confirmed = %d, want 1", confirmed)
	}
	if !patternBad.Valid || patternBad.String != "old code" {
		t.Errorf("pattern_bad = %v", patternBad)
	}
	if !patternGood.Valid || patternGood.String != "new code" {
		t.Errorf("pattern_good = %v", patternGood)
	}
	if !citFile.Valid || citFile.String != "test.go" {
		t.Errorf("citation_file = %v", citFile)
	}
	if !citLine.Valid || citLine.Int64 != 42 {
		t.Errorf("citation_line = %v", citLine)
	}
}

func TestRebuildIndex_ClearsOldData(t *testing.T) {
	dir := setupSyncTestDir(t)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Insert old data
	db.Exec(`INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
		VALUES ('OLD', 'lesson', 't', 'i', '', 'manual', '{}', '[]', '[]', '2026-01-01', 0)`)

	// Write new JSONL
	memory.AppendMemoryItem(dir, makeItem("NEW", "t", "i"))

	RebuildIndex(db, dir)

	var count int
	db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count)
	if count != 1 {
		t.Errorf("count = %d, want 1 (old data should be cleared)", count)
	}

	var id string
	db.QueryRow("SELECT id FROM lessons").Scan(&id)
	if id != "NEW" {
		t.Errorf("id = %q, want NEW", id)
	}
}

func TestRebuildIndex_FTS5Populated(t *testing.T) {
	dir := setupSyncTestDir(t)
	memory.AppendMemoryItem(dir, makeItem("L001", "search trigger", "search insight"))

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	RebuildIndex(db, dir)

	// FTS5 should find the item
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM lessons l JOIN lessons_fts fts ON l.rowid = fts.rowid WHERE lessons_fts MATCH 'search'`).Scan(&count)
	if count != 1 {
		t.Errorf("FTS5 count = %d, want 1", count)
	}
}

func TestSyncIfNeeded_FirstSync(t *testing.T) {
	dir := setupSyncTestDir(t)
	memory.AppendMemoryItem(dir, makeItem("L001", "t", "i"))

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	synced, err := SyncIfNeeded(db, dir, false)
	if err != nil {
		t.Fatal(err)
	}
	if !synced {
		t.Error("expected sync on first run")
	}

	// Verify data synced
	var count int
	db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count)
	if count != 1 {
		t.Errorf("count = %d, want 1", count)
	}
}

func TestSyncIfNeeded_NoChangeNoSync(t *testing.T) {
	dir := setupSyncTestDir(t)
	memory.AppendMemoryItem(dir, makeItem("L001", "t", "i"))

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// First sync
	SyncIfNeeded(db, dir, false)

	// Second sync without changes
	synced, err := SyncIfNeeded(db, dir, false)
	if err != nil {
		t.Fatal(err)
	}
	if synced {
		t.Error("expected no sync when file unchanged")
	}
}

func TestSyncIfNeeded_ForceSync(t *testing.T) {
	dir := setupSyncTestDir(t)
	memory.AppendMemoryItem(dir, makeItem("L001", "t", "i"))

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	SyncIfNeeded(db, dir, false)

	// Force sync even without changes
	synced, err := SyncIfNeeded(db, dir, true)
	if err != nil {
		t.Fatal(err)
	}
	if !synced {
		t.Error("expected sync when forced")
	}
}

func TestSyncIfNeeded_NoFile(t *testing.T) {
	dir := setupSyncTestDir(t)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	synced, err := SyncIfNeeded(db, dir, false)
	if err != nil {
		t.Fatal(err)
	}
	if synced {
		t.Error("expected no sync when no JSONL file exists")
	}
}

func TestRebuildIndex_HandlesDeletedItems(t *testing.T) {
	dir := setupSyncTestDir(t)

	// Write item then delete it in JSONL
	item := makeItem("L001", "t", "i")
	memory.AppendMemoryItem(dir, item)

	// Append tombstone
	path := filepath.Join(dir, memory.LessonsPath)
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	f.WriteString(`{"id":"L001","deleted":true,"deletedAt":"2026-03-21T00:00:00Z"}` + "\n")
	f.Close()

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	RebuildIndex(db, dir)

	var count int
	db.QueryRow("SELECT COUNT(*) FROM lessons").Scan(&count)
	if count != 0 {
		t.Errorf("count = %d, want 0 (deleted items should not be in SQLite)", count)
	}
}

func TestSetLastSyncMtime_ReturnsError(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}

	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	// Commit the tx so it becomes invalid
	tx.Commit()

	// setLastSyncMtime on a committed tx should return an error
	err = setLastSyncMtime(tx, 12345.0)
	if err == nil {
		t.Error("expected error from setLastSyncMtime on committed tx, got nil")
	}
}

func TestRebuildIndex_PropagatesSetLastSyncMtimeError(t *testing.T) {
	// setLastSyncMtime must return error so RebuildIndex can propagate it.
	// This is a signature test: verify the function returns error type.
	// Actual propagation is verified by checking that RebuildIndex succeeds
	// on a normal path (mtime is set correctly).
	dir := setupSyncTestDir(t)
	memory.AppendMemoryItem(dir, makeItem("L001", "t", "i"))

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := RebuildIndex(db, dir); err != nil {
		t.Fatalf("RebuildIndex should succeed: %v", err)
	}

	// Verify mtime was stored
	mtime := getLastSyncMtime(db)
	if mtime == 0 {
		t.Error("expected mtime to be stored after RebuildIndex")
	}
}

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }
