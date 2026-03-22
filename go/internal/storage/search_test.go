package storage

import (
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
)

func setupSearchDB(t *testing.T) (*SearchDB, string) {
	t.Helper()
	dir := setupSyncTestDir(t)

	items := []memory.MemoryItem{
		makeItem("L001", "database connection fails", "use connection pooling for reliability"),
		makeItem("L002", "test flaky on CI", "add retry logic for network-dependent tests"),
		makeItem("L003", "memory leak in goroutine", "always close channels after use"),
	}

	pItem := makeItem("P001", "pattern matching", "refactored matching logic")
	pItem.Type = memory.TypePattern
	pItem.Pattern = &memory.Pattern{Bad: "nested if statements", Good: "early return pattern"}
	items = append(items, pItem)

	for _, item := range items {
		memory.AppendMemoryItem(dir, item)
	}

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}

	RebuildIndex(db, dir)

	return NewSearchDB(db), dir
}

func TestSearchKeyword_BasicMatch(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	results, err := sdb.SearchKeyword("database", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].ID != "L001" {
		t.Errorf("ID = %q, want L001", results[0].ID)
	}
}

func TestSearchKeyword_MultipleMatches(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	// "test" appears in L002 (trigger)
	results, err := sdb.SearchKeyword("test", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) < 1 {
		t.Fatalf("got %d results, want >= 1", len(results))
	}
}

func TestSearchKeyword_NoMatch(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	results, err := sdb.SearchKeyword("nonexistent_term_xyz", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) != 0 {
		t.Errorf("got %d results, want 0", len(results))
	}
}

func TestSearchKeyword_LimitResults(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	// Search broad term, limit to 1
	results, err := sdb.SearchKeyword("connection pooling database test", 1, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) > 1 {
		t.Errorf("got %d results, want <= 1", len(results))
	}
}

func TestSearchKeyword_TypeFilter(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	// Search for "pattern" with type filter
	results, err := sdb.SearchKeyword("pattern", 10, memory.TypePattern)
	if err != nil {
		t.Fatal(err)
	}

	for _, r := range results {
		if r.Type != memory.TypePattern {
			t.Errorf("got type %q, want pattern", r.Type)
		}
	}
}

func TestSearchKeyword_EmptyQuery(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	results, err := sdb.SearchKeyword("", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) != 0 {
		t.Errorf("got %d results, want 0 for empty query", len(results))
	}
}

func TestSearchKeywordScored_HasScores(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	results, err := sdb.SearchKeywordScored("database connection", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) < 1 {
		t.Fatalf("got %d results, want >= 1", len(results))
	}

	for _, r := range results {
		if r.Score < 0 || r.Score > 1 {
			t.Errorf("score %f out of [0, 1] range", r.Score)
		}
	}
}

func TestSanitizeFtsQuery(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`simple query`, `simple query`},
		{`"quoted"`, `quoted`},
		{`hello*world`, `helloworld`},
		{`test AND query`, `test query`},
		{`test OR query`, `test query`},
		{`NOT test`, `test`},
		{`a + b - c`, `a b c`},
		{`(nested) {braces}`, `nested braces`},
		{`foo:bar`, `foobar`},
		{``, ``},
		{`AND OR NOT`, ``},
		{`  spaces   between  `, `spaces between`},
	}

	for _, tt := range tests {
		got := SanitizeFtsQuery(tt.input)
		if got != tt.want {
			t.Errorf("SanitizeFtsQuery(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestSearchKeyword_SpecialChars(t *testing.T) {
	sdb, _ := setupSearchDB(t)
	defer sdb.Close()

	// Should not crash on special FTS5 characters
	_, err := sdb.SearchKeyword(`"test" AND (NOT query*)`, 10, "")
	if err != nil {
		t.Fatalf("special chars should not cause error: %v", err)
	}
}

func TestSearchKeyword_InvalidatedExcluded(t *testing.T) {
	dir := setupSyncTestDir(t)

	item := makeItem("L001", "invalidated trigger", "invalidated insight")
	inv := "2026-03-21T00:00:00Z"
	item.InvalidatedAt = &inv
	memory.AppendMemoryItem(dir, item)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	RebuildIndex(db, dir)

	sdb := NewSearchDB(db)
	results, err := sdb.SearchKeyword("invalidated", 10, "")
	if err != nil {
		t.Fatal(err)
	}

	if len(results) != 0 {
		t.Errorf("got %d results, want 0 (invalidated should be excluded)", len(results))
	}
}

func TestExecuteFts_PropagatesQueryError(t *testing.T) {
	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	// Close DB to force a query error
	db.Close()

	sdb := NewSearchDB(db)

	// SearchKeyword calls executeFts; a closed DB must return an error, not nil
	_, err = sdb.SearchKeyword("anything", 10, "")
	if err == nil {
		t.Fatal("expected error from SearchKeyword on closed DB, got nil")
	}

	// SearchKeywordScored also calls executeFts
	_, err = sdb.SearchKeywordScored("anything", 10, "")
	if err == nil {
		t.Fatal("expected error from SearchKeywordScored on closed DB, got nil")
	}
}

func TestRowToMemoryItem(t *testing.T) {
	dir := setupSyncTestDir(t)

	sev := memory.SeverityMedium
	item := makeItem("L001", "trigger", "insight")
	item.Tags = []string{"tag1", "tag2", "tag3"}
	item.Severity = &sev
	item.Pattern = &memory.Pattern{Bad: "bad", Good: "good"}
	item.Citation = &memory.Citation{File: "f.go", Line: intPtr(10)}
	memory.AppendMemoryItem(dir, item)

	db, err := OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	RebuildIndex(db, dir)

	sdb := NewSearchDB(db)
	results, _ := sdb.ReadAll()

	if len(results) != 1 {
		t.Fatalf("got %d items, want 1", len(results))
	}

	r := results[0]
	if len(r.Tags) != 3 {
		t.Errorf("tags = %v, want 3 items", r.Tags)
	}
	if r.Severity == nil || *r.Severity != memory.SeverityMedium {
		t.Errorf("severity = %v", r.Severity)
	}
	if r.Pattern == nil || r.Pattern.Bad != "bad" || r.Pattern.Good != "good" {
		t.Errorf("pattern = %v", r.Pattern)
	}
	if r.Citation == nil || r.Citation.File != "f.go" || r.Citation.Line == nil || *r.Citation.Line != 10 {
		t.Errorf("citation = %v", r.Citation)
	}
}
