package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// testLesson generates a valid JSONL line for benchmark data.
func testLesson(id int) string {
	item := map[string]any{
		"id":         fmt.Sprintf("L%04d", id),
		"type":       "lesson",
		"trigger":    fmt.Sprintf("When doing task-%d, the build fails silently", id),
		"insight":    fmt.Sprintf("Always check return values in error-handling path %d", id),
		"tags":       []string{"go", "error-handling", fmt.Sprintf("tag%d", id%10)},
		"source":     "manual",
		"context":    map[string]string{"tool": "bash", "intent": "debug"},
		"created":    "2026-03-15T10:00:00Z",
		"confirmed":  true,
		"supersedes": []string{},
		"related":    []string{},
	}
	data, _ := json.Marshal(item)
	return string(data)
}

// setupBenchJSONL writes n lesson lines to a temp JSONL file and returns the repo root.
func setupBenchJSONL(b *testing.B, n int) string {
	b.Helper()
	dir := b.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0o755)

	var content string
	for i := 1; i <= n; i++ {
		content += testLesson(i) + "\n"
	}
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(content), 0o644)
	return dir
}

// BenchmarkSearchKeyword benchmarks FTS5 keyword search against a pre-populated SQLite DB (~50 lessons).
// Target: <100ms warm.
func BenchmarkSearchKeyword(b *testing.B) {
	dir := setupBenchJSONL(b, 50)

	db, err := storage.OpenDB(":memory:")
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()

	if err := storage.RebuildIndex(db, dir); err != nil {
		b.Fatal(err)
	}

	sdb := storage.NewSearchDB(db)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := sdb.SearchKeyword("error handling", 10, "")
		if err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkListLessons benchmarks reading ~100 lessons from a JSONL file.
// Tests I/O + JSON parsing path.
func BenchmarkListLessons(b *testing.B) {
	dir := setupBenchJSONL(b, 100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result, err := memory.ReadMemoryItems(dir)
		if err != nil {
			b.Fatal(err)
		}
		if len(result.Items) != 100 {
			b.Fatalf("expected 100 items, got %d", len(result.Items))
		}
	}
}

// BenchmarkValidateJSONL benchmarks the JSONL validation function with ~100 valid lines.
// Tests the parsing path used during migration.
func BenchmarkValidateJSONL(b *testing.B) {
	dir := setupBenchJSONL(b, 100)
	path := filepath.Join(dir, ".claude", "lessons", "index.jsonl")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid, invalid, err := validateJSONL(path)
		if err != nil {
			b.Fatal(err)
		}
		if valid != 100 || invalid != 0 {
			b.Fatalf("expected 100 valid / 0 invalid, got %d / %d", valid, invalid)
		}
	}
}
