package hook

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestBuildSearchTokens_AllParts(t *testing.T) {
	got := BuildSearchTokens("Bash", "npm", "Error: ENOENT no such file")
	// Target included
	if !sliceContains(got, "npm") {
		t.Errorf("expected 'npm' in tokens, got %v", got)
	}
	if !sliceContains(got, "ENOENT") {
		t.Errorf("expected 'ENOENT' in tokens, got %v", got)
	}
	// "no", "such" are stop words
	if sliceContains(got, "no") || sliceContains(got, "such") {
		t.Errorf("stop words should be filtered, got %v", got)
	}
	// "Bash" is tool name, excluded when other tokens available
	if sliceContains(got, "Bash") {
		t.Errorf("tool name should not be in tokens, got %v", got)
	}
}

func TestBuildSearchTokens_NoTarget(t *testing.T) {
	got := BuildSearchTokens("Read", "", "file not found")
	// "not" is a stop word, "file" and "found" should remain
	if !sliceContains(got, "file") {
		t.Errorf("expected 'file' in tokens, got %v", got)
	}
	if !sliceContains(got, "found") {
		t.Errorf("expected 'found' in tokens, got %v", got)
	}
}

func TestBuildSearchTokens_FallsBackToToolName(t *testing.T) {
	got := BuildSearchTokens("Bash", "", "")
	if len(got) != 1 || got[0] != "Bash" {
		t.Errorf("expected fallback to tool name, got %v", got)
	}
}

func TestBuildSearchTokens_TruncatesLongOutput(t *testing.T) {
	longOutput := make([]byte, 500)
	for i := range longOutput {
		longOutput[i] = 'x'
	}
	got := BuildSearchTokens("Bash", "npm", string(longOutput))
	// Should have at most maxQueryTokens tokens
	if len(got) > maxQueryTokens {
		t.Errorf("too many tokens: got %d, max %d", len(got), maxQueryTokens)
	}
}

func TestBuildSearchTokens_EmptyInputs(t *testing.T) {
	got := BuildSearchTokens("", "", "")
	if len(got) != 0 {
		t.Errorf("expected empty tokens, got %v", got)
	}
}

func sliceContains(s []string, val string) bool {
	for _, v := range s {
		if v == val {
			return true
		}
	}
	return false
}

func TestFormatLessonResults_MultipleMatches(t *testing.T) {
	matches := []LessonMatch{
		{Trigger: "npm install fails", Insight: "Clear node_modules and retry", Score: 0.8},
		{Trigger: "ENOENT errors", Insight: "Check file paths for typos", Score: 0.6},
	}
	got := FormatLessonResults(matches)

	if got == "" {
		t.Fatal("expected non-empty result")
	}
	if !strings.Contains(got, "npm install fails") {
		t.Error("missing first trigger")
	}
	if !strings.Contains(got, "Clear node_modules") {
		t.Error("missing first insight")
	}
	if !strings.Contains(got, "ENOENT errors") {
		t.Error("missing second trigger")
	}
	if !strings.Contains(got, "Relevant lessons") {
		t.Error("missing header")
	}
}

func TestFormatLessonResults_Empty(t *testing.T) {
	got := FormatLessonResults(nil)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestSearchLessonsWithTimeout_ReturnsResults(t *testing.T) {
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return []LessonMatch{
			{Trigger: "test trigger", Insight: "test insight", Score: 0.5},
		}, nil
	}

	matches, err := searchLessonsWithTimeout(searchFn, []string{"test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected 1 match, got %d", len(matches))
	}
	if matches[0].Trigger != "test trigger" {
		t.Errorf("got trigger %q, want %q", matches[0].Trigger, "test trigger")
	}
}

func TestSearchLessonsWithTimeout_FiltersZeroScore(t *testing.T) {
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return []LessonMatch{
			{Trigger: "matched", Insight: "relevant", Score: 0.001},
			{Trigger: "zero", Insight: "no match", Score: 0},
		}, nil
	}

	matches, err := searchLessonsWithTimeout(searchFn, []string{"test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected 1 match after filtering, got %d", len(matches))
	}
	if matches[0].Trigger != "matched" {
		t.Errorf("wrong match kept: got %q", matches[0].Trigger)
	}
}

func TestSearchLessonsWithTimeout_HandlesError(t *testing.T) {
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return nil, errors.New("db unavailable")
	}

	matches, err := searchLessonsWithTimeout(searchFn, []string{"test"})
	if err == nil {
		t.Fatal("expected error")
	}
	if matches != nil {
		t.Errorf("expected nil matches, got %v", matches)
	}
}

func TestSearchLessonsWithTimeout_RespectsContext(t *testing.T) {
	searchFn := func(ctx context.Context, _ []string, _ int) ([]LessonMatch, error) {
		if _, ok := ctx.Deadline(); !ok {
			t.Error("expected context with deadline")
		}
		return nil, nil
	}

	_, _ = searchLessonsWithTimeout(searchFn, []string{"test"})
}
