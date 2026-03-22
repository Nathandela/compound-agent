package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/search"
)

func strPtr(s string) *string   { return &s }
func sevPtr(s memory.Severity) *memory.Severity { return &s }

func TestFormatSource(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"user_correction", "user correction"},
		{"self_correction", "self correction"},
		{"manual", "manual"},
		{"test_failure", "test failure"},
		{"a_b_c", "a b c"},
	}
	for _, tt := range tests {
		got := formatSource(memory.Source(tt.input))
		if got != tt.want {
			t.Errorf("formatSource(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestFormatSearchResults(t *testing.T) {
	items := []memory.MemoryItem{
		{
			ID:      "L001",
			Insight: "Always check error returns",
			Trigger: "Unchecked error in handler",
			Tags:    []string{"go", "errors"},
		},
		{
			ID:      "L002",
			Insight: "Use context for cancellation",
			Trigger: "Goroutine leak in server",
			Tags:    []string{"go", "concurrency"},
		},
	}

	got := formatSearchResults(items)

	if !strings.Contains(got, "[info] Found 2 lesson(s):") {
		t.Error("missing info header")
	}
	if !strings.Contains(got, "[L001] Always check error returns") {
		t.Error("missing first lesson ID and insight")
	}
	if !strings.Contains(got, "Trigger: Unchecked error in handler") {
		t.Error("missing first trigger")
	}
	if !strings.Contains(got, "Tags: go, errors") {
		t.Error("missing first tags")
	}
	if !strings.Contains(got, "[L002] Use context for cancellation") {
		t.Error("missing second lesson")
	}
}

func TestFormatSearchResultsEmpty(t *testing.T) {
	got := formatSearchResults(nil)
	want := "No lessons match your search. Try a different query or use \"list\" to see all lessons."
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestFormatListResults(t *testing.T) {
	items := []memory.MemoryItem{
		{
			ID:      "L001",
			Type:    memory.TypeLesson,
			Insight: "Check errors",
			Source:  memory.SourceManual,
			Tags:    []string{"go"},
		},
	}

	got := formatListResults(items, 5, 0)

	if !strings.Contains(got, "[info] Showing 1 of 5 item(s):") {
		t.Errorf("missing info header, got: %s", got)
	}
	if !strings.Contains(got, "[L001] Check errors") {
		t.Error("missing lesson ID and insight")
	}
	if !strings.Contains(got, "Type: lesson | Source: manual") {
		t.Error("missing type/source line")
	}
	if !strings.Contains(got, "Tags: go") {
		t.Error("missing tags")
	}
}

func TestFormatListResultsEmpty(t *testing.T) {
	got := formatListResults(nil, 0, 0)
	if !strings.Contains(got, "No lessons found") {
		t.Errorf("expected empty message, got %q", got)
	}
}

func TestFormatListResultsSkippedWarning(t *testing.T) {
	got := formatListResults(nil, 0, 3)
	if !strings.Contains(got, "[warn] 3 corrupted lesson(s) skipped.") {
		t.Errorf("expected skipped warning, got %q", got)
	}
}

func TestFormatSessionHuman(t *testing.T) {
	items := []memory.MemoryItem{
		{
			ID:      "L001",
			Insight: "Always validate input",
			Tags:    []string{"validation", "security"},
			Source:  memory.SourceUserCorrection,
			Created: "2026-03-15T10:00:00Z",
		},
	}

	got := formatSessionHuman(items, 5)

	if !strings.Contains(got, "## Lessons from Past Sessions") {
		t.Error("missing header")
	}
	if !strings.Contains(got, "**Always validate input**") {
		t.Error("missing bold insight")
	}
	if !strings.Contains(got, "(validation, security)") {
		t.Error("missing tags")
	}
	if !strings.Contains(got, "2026-03-15") {
		t.Error("missing date")
	}
	if !strings.Contains(got, "user correction") {
		t.Error("missing formatted source")
	}
}

func TestFormatSessionHumanEmpty(t *testing.T) {
	got := formatSessionHuman(nil, 5)
	if got != "No high-severity lessons found." {
		t.Errorf("got %q", got)
	}
}

func TestFormatSessionHumanCompactWarning(t *testing.T) {
	items := make([]memory.MemoryItem, 1)
	items[0] = memory.MemoryItem{
		ID:      "L001",
		Insight: "test",
		Tags:    []string{},
		Source:  memory.SourceManual,
		Created: "2026-03-15T10:00:00Z",
	}

	// totalCount > LessonCountWarning (20) should trigger warning
	got := formatSessionHuman(items, 25)
	if !strings.Contains(got, "25 lessons in index") {
		t.Errorf("expected compact warning for 25 lessons, got: %s", got)
	}
}

func TestFormatSessionHumanAgeWarning(t *testing.T) {
	// Create a lesson older than 90 days
	old := time.Now().AddDate(0, 0, -100).Format(time.RFC3339)
	items := []memory.MemoryItem{
		{
			ID:      "L001",
			Insight: "old lesson",
			Tags:    []string{},
			Source:  memory.SourceManual,
			Created: old,
		},
	}

	got := formatSessionHuman(items, 5)
	if !strings.Contains(got, "over 90 days old") {
		t.Errorf("expected age warning, got: %s", got)
	}
}

func TestFormatSessionJSON(t *testing.T) {
	items := []memory.MemoryItem{
		{
			ID:      "L001",
			Type:    memory.TypeLesson,
			Insight: "test insight",
			Tags:    []string{"tag1"},
			Source:  memory.SourceManual,
			Created: "2026-03-15T10:00:00Z",
		},
	}

	got, jsonErr := formatSessionJSON(items, 10)
	if jsonErr != nil {
		t.Fatalf("formatSessionJSON: %v", jsonErr)
	}

	var parsed struct {
		Lessons    []memory.MemoryItem `json:"lessons"`
		Count      int                 `json:"count"`
		TotalCount int                 `json:"totalCount"`
	}
	if err := json.Unmarshal([]byte(got), &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if parsed.Count != 1 {
		t.Errorf("count = %d, want 1", parsed.Count)
	}
	if parsed.TotalCount != 10 {
		t.Errorf("totalCount = %d, want 10", parsed.TotalCount)
	}
	if len(parsed.Lessons) != 1 || parsed.Lessons[0].ID != "L001" {
		t.Error("lessons not correctly serialized")
	}
}

func TestFormatCheckPlanHuman(t *testing.T) {
	ranked := []search.RankedItem{
		{
			ScoredItem: search.ScoredItem{
				Item: memory.MemoryItem{
					ID:      "L001",
					Insight: "Always use parameterized queries",
					Source:  memory.SourceManual,
				},
				Score: 0.85,
			},
			FinalScore: 1.2,
		},
	}

	got := formatCheckPlanHuman(ranked)

	if !strings.Contains(got, "## Lessons Check") {
		t.Error("missing header")
	}
	if !strings.Contains(got, "[L001] Always use parameterized queries") {
		t.Error("missing lesson ID and insight")
	}
	if !strings.Contains(got, "Source: manual") {
		t.Error("missing source")
	}
	if !strings.Contains(got, "Consider these lessons") {
		t.Error("missing footer")
	}
}

func TestFormatCheckPlanHumanEmpty(t *testing.T) {
	got := formatCheckPlanHuman(nil)
	if got != "No relevant lessons found for this plan." {
		t.Errorf("got %q", got)
	}
}

func TestFormatCheckPlanJSON(t *testing.T) {
	ranked := []search.RankedItem{
		{
			ScoredItem: search.ScoredItem{
				Item: memory.MemoryItem{
					ID:      "L001",
					Insight: "test",
					Source:  memory.SourceManual,
				},
				Score: 0.85,
			},
			FinalScore: 1.2,
		},
	}

	got, jsonErr := formatCheckPlanJSON(ranked)
	if jsonErr != nil {
		t.Fatalf("formatCheckPlanJSON: %v", jsonErr)
	}

	var parsed struct {
		Lessons []struct {
			ID        string  `json:"id"`
			Insight   string  `json:"insight"`
			RankScore float64 `json:"rankScore"`
			Source    string  `json:"source"`
		} `json:"lessons"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal([]byte(got), &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if parsed.Count != 1 {
		t.Errorf("count = %d, want 1", parsed.Count)
	}
	if len(parsed.Lessons) != 1 {
		t.Fatal("expected 1 lesson")
	}
	if parsed.Lessons[0].ID != "L001" {
		t.Errorf("id = %q, want L001", parsed.Lessons[0].ID)
	}
	if parsed.Lessons[0].RankScore != 1.2 {
		t.Errorf("rankScore = %f, want 1.2", parsed.Lessons[0].RankScore)
	}
}

func TestCountOldLessons(t *testing.T) {
	recent := time.Now().AddDate(0, 0, -10).Format(time.RFC3339)
	old := time.Now().AddDate(0, 0, -100).Format(time.RFC3339)

	items := []memory.MemoryItem{
		{ID: "L1", Created: recent},
		{ID: "L2", Created: old},
		{ID: "L3", Created: old},
	}

	got := countOldLessons(items)
	if got != 2 {
		t.Errorf("countOldLessons = %d, want 2", got)
	}
}

func TestCountOldLessonsUnparseable(t *testing.T) {
	items := []memory.MemoryItem{
		{ID: "L1", Created: "not-a-date"},
	}
	got := countOldLessons(items)
	if got != 0 {
		t.Errorf("countOldLessons with bad date = %d, want 0", got)
	}
}

func TestGetOrStartEmbedder_ReturnsNoopCloser(t *testing.T) {
	// When daemon is unavailable, the returned closer must be safe to call.
	_, closer := getOrStartEmbedder(t.TempDir())
	closer() // must not panic
}

func TestDatePrefix(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"2026-03-15T10:00:00Z", "2026-03-15"},
		{"2026-01-01T00:00:00+05:00", "2026-01-01"},
		{"short", "short"},
		{"", ""},
	}
	for _, tt := range tests {
		got := datePrefix(tt.input)
		if got != tt.want {
			t.Errorf("datePrefix(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
