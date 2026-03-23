package memory

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	// Create .claude/lessons/ directory
	if err := os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func makeTestItem(id string, typ ItemType) Item {
	return Item{
		ID: id, Type: typ,
		Trigger: "test trigger", Insight: "test insight",
		Tags: []string{"tag1"}, Source: SourceManual,
		Context:    Context{Tool: "bash", Intent: "test"},
		Created:    "2026-01-01T00:00:00Z",
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}
}

func TestAppendItem_CreatesDir(t *testing.T) {
	dir := t.TempDir() // No .claude/lessons/ yet
	item := makeTestItem("L001", TypeLesson)

	if err := AppendItem(dir, item); err != nil {
		t.Fatalf("AppendItem: %v", err)
	}

	// File should exist
	path := filepath.Join(dir, LessonsPath)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected file at %s: %v", path, err)
	}
}

func TestAppendAndReadRoundTrip(t *testing.T) {
	dir := setupTestDir(t)
	item := makeTestItem("L001", TypeLesson)

	if err := AppendItem(dir, item); err != nil {
		t.Fatal(err)
	}

	result, err := ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
	if result.Items[0].ID != "L001" {
		t.Errorf("ID = %q, want L001", result.Items[0].ID)
	}
	if result.SkippedCount != 0 {
		t.Errorf("skipped = %d, want 0", result.SkippedCount)
	}
}

func TestReadItems_EmptyFile(t *testing.T) {
	dir := setupTestDir(t)

	result, err := ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 0 {
		t.Errorf("got %d items, want 0", len(result.Items))
	}
}

func TestReadItems_FileNotExists(t *testing.T) {
	dir := t.TempDir()

	result, err := ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 0 {
		t.Errorf("got %d items, want 0", len(result.Items))
	}
}

func TestReadItems_LastWriteWins(t *testing.T) {
	dir := setupTestDir(t)
	item1 := makeTestItem("L001", TypeLesson)
	item1.Insight = "first version"

	item2 := makeTestItem("L001", TypeLesson)
	item2.Insight = "second version"

	AppendItem(dir, item1)
	AppendItem(dir, item2)

	result, _ := ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1 (dedup)", len(result.Items))
	}
	if result.Items[0].Insight != "second version" {
		t.Errorf("insight = %q, want 'second version'", result.Items[0].Insight)
	}
}

func TestReadItems_Tombstone(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	item := makeTestItem("L001", TypeLesson)
	AppendItem(dir, item)

	// Append a tombstone (canonical format: {id, deleted, deletedAt})
	tombstone := `{"id":"L001","deleted":true,"deletedAt":"2026-03-21T00:00:00Z"}` + "\n"
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	f.WriteString(tombstone)
	f.Close()

	result, _ := ReadItems(dir)
	if len(result.Items) != 0 {
		t.Fatalf("got %d items, want 0 (deleted)", len(result.Items))
	}
	if !result.DeletedIDs["L001"] {
		t.Error("expected L001 in deleted IDs")
	}
}

func TestReadItems_LegacyTypeConversion(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	// Write a legacy "quick" type record
	legacy := `{"id":"Lold","type":"quick","trigger":"t","insight":"i","tags":["a"],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}` + "\n"
	os.WriteFile(path, []byte(legacy), 0o644)

	result, _ := ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
	if result.Items[0].Type != TypeLesson {
		t.Errorf("type = %q, want %q (converted from quick)", result.Items[0].Type, TypeLesson)
	}
}

func TestReadItems_SkipsInvalidJSON(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	content := "not json\n" + `{"id":"L001","type":"lesson","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}` + "\n"
	os.WriteFile(path, []byte(content), 0o644)

	result, _ := ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
	if result.SkippedCount != 1 {
		t.Errorf("skipped = %d, want 1", result.SkippedCount)
	}
}

func TestReadItems_MultipleTypes(t *testing.T) {
	dir := setupTestDir(t)

	items := []Item{
		makeTestItem("L001", TypeLesson),
		makeTestItem("S001", TypeSolution),
		makeTestItem("R001", TypePreference),
	}

	pItem := makeTestItem("P001", TypePattern)
	pItem.Pattern = &Pattern{Bad: "old", Good: "new"}
	items = append(items, pItem)

	for _, item := range items {
		AppendItem(dir, item)
	}

	result, _ := ReadItems(dir)
	if len(result.Items) != 4 {
		t.Fatalf("got %d items, want 4", len(result.Items))
	}
}

func TestReadItems_DeleteThenReAdd(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	item := makeTestItem("L001", TypeLesson)
	AppendItem(dir, item)

	// Delete it
	tombstone := `{"id":"L001","deleted":true,"deletedAt":"2026-03-21T00:00:00Z"}` + "\n"
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	f.WriteString(tombstone)
	f.Close()

	// Re-add it
	item.Insight = "re-added"
	AppendItem(dir, item)

	result, _ := ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
	if result.Items[0].Insight != "re-added" {
		t.Errorf("insight = %q, want 're-added'", result.Items[0].Insight)
	}
}

func TestReadItems_LegacyTombstone_FullRecordWithDeleted(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	item := makeTestItem("L001", TypeLesson)
	AppendItem(dir, item)

	// Legacy full record with deleted:true
	deleted := `{"id":"L001","type":"lesson","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[],"deleted":true,"deletedAt":"2026-03-21T00:00:00Z"}` + "\n"
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	f.WriteString(deleted)
	f.Close()

	result, _ := ReadItems(dir)
	if len(result.Items) != 0 {
		t.Fatalf("got %d items, want 0 (deleted via full record)", len(result.Items))
	}
}

func TestReadItems_FullType(t *testing.T) {
	dir := setupTestDir(t)
	path := filepath.Join(dir, LessonsPath)

	// Legacy "full" type record
	legacy := `{"id":"Lold","type":"full","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}` + "\n"
	os.WriteFile(path, []byte(legacy), 0o644)

	result, _ := ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
	if result.Items[0].Type != TypeLesson {
		t.Errorf("type = %q, want %q", result.Items[0].Type, TypeLesson)
	}
}

// R1: parseLine must reject records that TS rejects via Zod schema validation
func TestParseLine_RejectsMissingTrigger(t *testing.T) {
	line := `{"id":"L001","type":"lesson","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if ok {
		t.Error("parseLine should reject record missing trigger")
	}
}

func TestParseLine_RejectsMissingInsight(t *testing.T) {
	line := `{"id":"L001","type":"lesson","trigger":"t","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if ok {
		t.Error("parseLine should reject record missing insight")
	}
}

func TestParseLine_RejectsInvalidSource(t *testing.T) {
	line := `{"id":"L001","type":"lesson","trigger":"t","insight":"i","tags":[],"source":"bogus","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if ok {
		t.Error("parseLine should reject record with invalid source")
	}
}

func TestParseLine_RejectsMissingCreated(t *testing.T) {
	line := `{"id":"L001","type":"lesson","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if ok {
		t.Error("parseLine should reject record missing created")
	}
}

func TestParseLine_RejectsInvalidType(t *testing.T) {
	line := `{"id":"L001","type":"bogus","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if ok {
		t.Error("parseLine should reject record with invalid type")
	}
}

func TestParseLine_AcceptsEmptyTags(t *testing.T) {
	line := `{"id":"L001","type":"lesson","trigger":"t","insight":"i","tags":[],"source":"manual","context":{"tool":"t","intent":"i"},"created":"2026-01-01T00:00:00Z","confirmed":false,"supersedes":[],"related":[]}`
	_, _, ok := parseLine(line)
	if !ok {
		t.Error("parseLine should accept record with empty tags")
	}
}

// R4: Sort with equal timestamps must use ID as tiebreaker
func TestReadItems_DeterministicSort_EqualTimestamps(t *testing.T) {
	dir := setupTestDir(t)
	sameTime := "2026-01-01T00:00:00Z"

	// Create items with same timestamp but different IDs
	items := []Item{
		{ID: "L003", Type: TypeLesson, Trigger: "t", Insight: "c", Tags: []string{}, Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: sameTime, Supersedes: []string{}, Related: []string{}},
		{ID: "L001", Type: TypeLesson, Trigger: "t", Insight: "a", Tags: []string{}, Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: sameTime, Supersedes: []string{}, Related: []string{}},
		{ID: "L002", Type: TypeLesson, Trigger: "t", Insight: "b", Tags: []string{}, Source: SourceManual, Context: Context{Tool: "t", Intent: "i"}, Created: sameTime, Supersedes: []string{}, Related: []string{}},
	}
	for _, item := range items {
		AppendItem(dir, item)
	}

	// Run multiple times to detect non-determinism
	for i := 0; i < 10; i++ {
		result, err := ReadItems(dir)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Items) != 3 {
			t.Fatalf("got %d items, want 3", len(result.Items))
		}
		// Must be sorted by ID when timestamps are equal
		if result.Items[0].ID != "L001" || result.Items[1].ID != "L002" || result.Items[2].ID != "L003" {
			t.Errorf("iteration %d: wrong order: %s, %s, %s (want L001, L002, L003)",
				i, result.Items[0].ID, result.Items[1].ID, result.Items[2].ID)
		}
	}
}
