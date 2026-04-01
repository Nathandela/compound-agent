package retrieval

import (
	"database/sql"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/search"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// openTestDB creates an in-memory SQLite DB with the lessons schema and inserts test items.
func openTestDB(t *testing.T, items []memory.Item) *sql.DB {
	t.Helper()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	for _, item := range items {
		insertTestItem(t, db, item)
	}

	return db
}

func insertTestItem(t *testing.T, db *sql.DB, item memory.Item) {
	t.Helper()
	confirmed := 0
	if item.Confirmed {
		confirmed = 1
	}
	var sevStr interface{}
	if item.Severity != nil {
		sevStr = string(*item.Severity)
	}
	_, err := db.Exec(`INSERT INTO lessons (id, type, trigger, insight, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '[]', '[]', ?, ?, 0, 0)`,
		item.ID, string(item.Type), item.Trigger, item.Insight, sevStr,
		"go", string(item.Source), item.Created, confirmed,
	)
	if err != nil {
		t.Fatalf("insert %s: %v", item.ID, err)
	}
}

func TestRetrieveForPlan_NilEmbedderFallsBackToKeywordOnly(t *testing.T) {
	items := []memory.Item{
		makeTestItem("L001", "2025-06-01T00:00:00Z", sevPtr(memory.SeverityHigh), true, nil),
		makeTestItem("L002", "2025-06-02T00:00:00Z", sevPtr(memory.SeverityMedium), true, nil),
	}
	db := openTestDB(t, items)
	defer db.Close()

	// Use a trigger word from the items as the plan text for keyword match
	result, err := RetrieveForPlan(db, "", nil, "trigger insight", 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// With nil embedder, should still return keyword results (no vector search)
	if result.Message == "" {
		t.Error("expected non-empty message")
	}
}

func TestFormatLessonsCheck_FormatsCorrectly(t *testing.T) {
	items := []search.ScoredItem{
		{Item: memory.Item{Insight: "Always check error returns"}, Score: 0.9},
		{Item: memory.Item{Insight: "Use context for cancellation"}, Score: 0.7},
	}
	result := FormatLessonsCheck(items)

	expected := "Lessons Check\n" +
		"────────────────────────────────────────\n" +
		"1. Always check error returns\n" +
		"2. Use context for cancellation\n"

	if result != expected {
		t.Errorf("format mismatch.\nwant:\n%s\ngot:\n%s", expected, result)
	}
}

func TestFormatLessonsCheck_EmptyLessons(t *testing.T) {
	result := FormatLessonsCheck(nil)
	expected := "No relevant lessons found for this plan."
	if result != expected {
		t.Errorf("want %q, got %q", expected, result)
	}

	result2 := FormatLessonsCheck([]search.ScoredItem{})
	if result2 != expected {
		t.Errorf("want %q, got %q", expected, result2)
	}
}

func TestRetrieveForPlan_ReturnsRankedResults(t *testing.T) {
	high := memory.SeverityHigh
	low := memory.SeverityLow
	items := []memory.Item{
		{
			ID: "L001", Type: memory.TypeLesson,
			Trigger: "error handling in Go", Insight: "always wrap errors with context",
			Tags: []string{"go"}, Source: memory.SourceManual,
			Created: "2025-06-01T00:00:00Z", Confirmed: true,
			Severity: &high, Supersedes: []string{}, Related: []string{},
		},
		{
			ID: "L002", Type: memory.TypeLesson,
			Trigger: "logging best practices", Insight: "use structured logging",
			Tags: []string{"go"}, Source: memory.SourceManual,
			Created: "2025-06-02T00:00:00Z", Confirmed: false,
			Severity: &low, Supersedes: []string{}, Related: []string{},
		},
	}
	db := openTestDB(t, items)
	defer db.Close()

	result, err := RetrieveForPlan(db, "", nil, "error handling Go context", 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should return ranked items with FinalScore applied
	if len(result.Lessons) == 0 {
		t.Fatal("expected at least one ranked lesson")
	}

	// First result should have higher FinalScore due to high severity + confirmed
	for i := 1; i < len(result.Lessons); i++ {
		if result.Lessons[i].FinalScore > result.Lessons[i-1].FinalScore {
			t.Errorf("results not sorted descending by FinalScore: [%d]=%f > [%d]=%f",
				i, result.Lessons[i].FinalScore, i-1, result.Lessons[i-1].FinalScore)
		}
	}
}
