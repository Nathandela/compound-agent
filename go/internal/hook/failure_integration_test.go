//go:build sqlite_fts5

package hook

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// TestIntegration_SearchWithRealDB tests the full search path using an in-memory SQLite DB.
func TestIntegration_SearchWithRealDB(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	insertLesson(t, db, "lesson-1", "npm install fails with ENOENT", "Clear node_modules and package-lock.json, then retry", "high")
	insertLesson(t, db, "lesson-2", "go build fails on CGO", "Set CGO_ENABLED=1 and ensure C compiler is available", "medium")

	searchFn := makeTestSearchFunc(db)

	dir := t.TempDir()
	// Two failures on npm to trigger threshold
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm install"}, "ENOENT: no such file", dir, searchFn)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "ENOENT: no such file", dir, searchFn)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	ctx := result.SpecificOutput.AdditionalContext
	if !strings.Contains(ctx, "npm install fails with ENOENT") {
		t.Errorf("expected npm lesson in output, got: %s", ctx)
	}
	if !strings.Contains(ctx, "Clear node_modules") {
		t.Errorf("expected npm insight in output, got: %s", ctx)
	}
}

// TestIntegration_SearchNoMatchFallback verifies fallback when no lessons match.
func TestIntegration_SearchNoMatchFallback(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Insert a lesson about something completely different
	insertLesson(t, db, "lesson-1", "python import error", "Check virtualenv", "medium")

	searchFn := makeTestSearchFunc(db)

	dir := t.TempDir()
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm install"}, "ENOENT", dir, searchFn)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "ENOENT", dir, searchFn)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	if result.SpecificOutput.AdditionalContext != failureTip {
		t.Errorf("expected static tip fallback, got: %s", result.SpecificOutput.AdditionalContext)
	}
}

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("failed to open test DB: %v", err)
	}
	return db
}

func insertLesson(t *testing.T, db *sql.DB, id, trigger, insight, severity string) {
	t.Helper()
	_, err := db.Exec(
		`INSERT INTO lessons (id, type, trigger, insight, severity, tags, source, context, supersedes, related, created, confirmed, deleted)
		 VALUES (?, ?, ?, ?, ?, '', 'manual', '{}', '[]', '[]', '2026-01-01', 0, 0)`,
		id, string(memory.TypeLesson), trigger, insight, severity,
	)
	if err != nil {
		t.Fatalf("insert lesson: %v", err)
	}
}

func makeTestSearchFunc(db *sql.DB) LessonSearchFunc {
	return func(_ context.Context, tokens []string, limit int) ([]LessonMatch, error) {
		sdb := storage.NewSearchDB(db)
		scored, err := sdb.SearchKeywordScoredOR(tokens, limit, memory.TypeLesson)
		if err != nil {
			return nil, err
		}
		var matches []LessonMatch
		for _, s := range scored {
			matches = append(matches, LessonMatch{
				Trigger: s.Trigger,
				Insight: s.Insight,
				Score:   s.Score,
			})
		}
		return matches, nil
	}
}
