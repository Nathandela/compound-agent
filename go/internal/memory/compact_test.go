package memory

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTestJSONL(t *testing.T, dir string, lines []string) {
	t.Helper()
	path := filepath.Join(dir, LessonsPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := strings.Join(lines, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readJSONLItems(t *testing.T, dir string) []map[string]interface{} {
	t.Helper()
	path := filepath.Join(dir, LessonsPath)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var items []map[string]interface{}
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("parse line: %v", err)
		}
		items = append(items, m)
	}
	return items
}

func makeLesson(id, insight string) string {
	item := Item{
		ID:         id,
		Type:       TypeLesson,
		Trigger:    "test trigger",
		Insight:    insight,
		Tags:       []string{"test"},
		Source:     SourceManual,
		Context:    Context{Tool: "test", Intent: "test"},
		Created:    "2026-01-15T00:00:00Z",
		Supersedes: []string{},
		Related:    []string{},
	}
	data, _ := json.Marshal(item)
	return string(data)
}

func makeTombstone(id string) string {
	data, _ := json.Marshal(map[string]interface{}{
		"id":        id,
		"deleted":   true,
		"deletedAt": "2026-01-16T00:00:00Z",
	})
	return string(data)
}

func TestCountTombstones_NoFile(t *testing.T) {
	dir := t.TempDir()
	count, err := CountTombstones(dir)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("expected 0, got %d", count)
	}
}

func TestCountTombstones_WithTombstones(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "first lesson"),
		makeTombstone("L001"),
		makeLesson("L002", "second lesson"),
		makeTombstone("L002"),
		makeLesson("L003", "third lesson"),
	})

	count, err := CountTombstones(dir)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Errorf("expected 2, got %d", count)
	}
}

func TestNeedsCompaction_BelowThreshold(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "lesson"),
		makeTombstone("L001"),
	})

	needs, err := NeedsCompaction(dir)
	if err != nil {
		t.Fatal(err)
	}
	if needs {
		t.Error("expected false, got true")
	}
}

func TestCompact_RemovesTombstonesAndDeduplicates(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "first lesson"),
		makeLesson("L002", "second lesson"),
		makeTombstone("L001"),
		makeLesson("L003", "third lesson"),
	})

	result, err := Compact(dir)
	if err != nil {
		t.Fatal(err)
	}

	if result.TombstonesRemoved != 1 {
		t.Errorf("tombstones removed: expected 1, got %d", result.TombstonesRemoved)
	}
	if result.LessonsRemaining != 2 {
		t.Errorf("lessons remaining: expected 2, got %d", result.LessonsRemaining)
	}

	// Verify file was rewritten
	items := readJSONLItems(t, dir)
	if len(items) != 2 {
		t.Errorf("expected 2 items in file, got %d", len(items))
	}
}

func TestCompact_DropsInvalidRecords(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "valid lesson"),
		`{"invalid": "record"}`,
		makeLesson("L002", "another valid"),
	})

	result, err := Compact(dir)
	if err != nil {
		t.Fatal(err)
	}

	if result.DroppedInvalid != 1 {
		t.Errorf("dropped invalid: expected 1, got %d", result.DroppedInvalid)
	}
	if result.LessonsRemaining != 2 {
		t.Errorf("lessons remaining: expected 2, got %d", result.LessonsRemaining)
	}
}

func TestCompact_LastWriteWins(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "original insight"),
		makeLesson("L001", "updated insight"),
	})

	result, err := Compact(dir)
	if err != nil {
		t.Fatal(err)
	}

	if result.LessonsRemaining != 1 {
		t.Errorf("expected 1, got %d", result.LessonsRemaining)
	}

	items := readJSONLItems(t, dir)
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0]["insight"] != "updated insight" {
		t.Errorf("expected updated insight, got %s", items[0]["insight"])
	}
}

func TestCompact_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	// No JSONL file at all
	result, err := Compact(dir)
	if err != nil {
		t.Fatal(err)
	}
	if result.LessonsRemaining != 0 {
		t.Errorf("expected 0, got %d", result.LessonsRemaining)
	}
}

func TestCompact_NoTempFileLeftover(t *testing.T) {
	dir := t.TempDir()
	writeTestJSONL(t, dir, []string{
		makeLesson("L001", "first lesson"),
		makeTombstone("L001"),
		makeLesson("L002", "second lesson"),
	})

	_, err := Compact(dir)
	if err != nil {
		t.Fatal(err)
	}

	// No temp files should remain after a successful compaction
	lessonsDir := filepath.Dir(filepath.Join(dir, LessonsPath))
	entries, _ := os.ReadDir(lessonsDir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp") {
			t.Errorf("temp file %s left behind after compaction", e.Name())
		}
	}
}
