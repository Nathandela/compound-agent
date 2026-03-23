package retrieval

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

// writeTestJSONL writes memory items as JSONL to the standard lessons path in tmpDir.
func writeTestJSONL(t *testing.T, tmpDir string, items []memory.Item) {
	t.Helper()
	path := filepath.Join(tmpDir, memory.LessonsPath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, item := range items {
		if err := enc.Encode(item); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}
}

func sevPtr(s memory.Severity) *memory.Severity { return &s }
func strPtr(s string) *string                   { return &s }

func makeTestItem(id, created string, sev *memory.Severity, confirmed bool, invalidatedAt *string) memory.Item {
	return memory.Item{
		ID:            id,
		Type:          memory.TypeLesson,
		Trigger:       "trigger for " + id,
		Insight:       "insight for " + id,
		Tags:          []string{"go"},
		Source:        memory.SourceManual,
		Created:       created,
		Confirmed:     confirmed,
		Severity:      sev,
		InvalidatedAt: invalidatedAt,
		Supersedes:    []string{},
		Related:       []string{},
	}
}

func TestLoadSessionLessons_OnlyHighSeverityConfirmed(t *testing.T) {
	tmpDir := t.TempDir()
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L002", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityMedium), true, nil),
		makeTestItem("L003", "2025-06-03T00:00:00Z", sevPtr(memory.SeverityHigh), false, nil),
		makeTestItem("L004", "2025-06-04T00:00:00Z", sevPtr(memory.SeverityLow), true, nil),
		makeTestItem("L005", "2025-06-05T00:00:00Z", nil, true, nil),
	}
	writeTestJSONL(t, tmpDir, items)

	result, err := LoadSessionLessons(tmpDir, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("expected 1 result (only L001), got %d", len(result))
	}
	if result[0].ID != "L001" {
		t.Errorf("expected L001, got %s", result[0].ID)
	}
}

func TestLoadSessionLessons_SortsByCreatedDescending(t *testing.T) {
	tmpDir := t.TempDir()
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L002", "2025-06-03T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L003", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
	}
	writeTestJSONL(t, tmpDir, items)

	result, err := LoadSessionLessons(tmpDir, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}
	// Most recent first: L002 (June 3), L003 (June 2), L001 (June 1)
	if result[0].ID != "L002" {
		t.Errorf("first: expected L002, got %s", result[0].ID)
	}
	if result[1].ID != "L003" {
		t.Errorf("second: expected L003, got %s", result[1].ID)
	}
	if result[2].ID != "L001" {
		t.Errorf("third: expected L001, got %s", result[2].ID)
	}
}

func TestLoadSessionLessons_RespectsLimit(t *testing.T) {
	tmpDir := t.TempDir()
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L002", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L003", "2025-06-03T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
	}
	writeTestJSONL(t, tmpDir, items)

	result, err := LoadSessionLessons(tmpDir, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 2 {
		t.Fatalf("expected 2 results (limit=2), got %d", len(result))
	}
	// Most recent two: L003, L002
	if result[0].ID != "L003" {
		t.Errorf("first: expected L003, got %s", result[0].ID)
	}
	if result[1].ID != "L002" {
		t.Errorf("second: expected L002, got %s", result[1].ID)
	}
}

func TestLoadSessionLessons_SkipsInvalidated(t *testing.T) {
	tmpDir := t.TempDir()
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L002", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityHigh), true, strPtr("2025-06-10T00:00:00Z")),
	}
	writeTestJSONL(t, tmpDir, items)

	result, err := LoadSessionLessons(tmpDir, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("expected 1 result (L002 invalidated), got %d", len(result))
	}
	if result[0].ID != "L001" {
		t.Errorf("expected L001, got %s", result[0].ID)
	}
}

func TestLoadSessionLessons_EmptyForNoMatches(t *testing.T) {
	tmpDir := t.TempDir()
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityLow), true, nil),
		makeTestItem("L002", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityMedium), false, nil),
	}
	writeTestJSONL(t, tmpDir, items)

	result, err := LoadSessionLessons(tmpDir, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 0 {
		t.Fatalf("expected 0 results, got %d", len(result))
	}
}
