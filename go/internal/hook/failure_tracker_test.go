package hook

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProcessToolFailure_FirstFailure(t *testing.T) {
	dir := t.TempDir()
	result := ProcessToolFailure("Bash", map[string]interface{}{"command": "npm install"}, dir)
	if result.SpecificOutput != nil {
		t.Error("first failure should not trigger tip")
	}
}

func TestProcessToolFailure_SameTargetThreshold(t *testing.T) {
	dir := t.TempDir()

	// First failure on same target
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm install"}, dir)

	// Second failure on same target should NOT trigger (threshold is 3)
	result := ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	if result.SpecificOutput != nil {
		t.Fatal("second failure on same target should not trigger tip")
	}

	// Third failure on same target should trigger
	result = ProcessToolFailure("Bash", map[string]interface{}{"command": "npm run build"}, dir)
	if result.SpecificOutput == nil {
		t.Fatal("third failure on same target should trigger tip")
	}
	if result.SpecificOutput.HookEventName != "PostToolUseFailure" {
		t.Errorf("got event name %q, want PostToolUseFailure", result.SpecificOutput.HookEventName)
	}
}

func TestProcessToolFailure_TotalThreshold(t *testing.T) {
	dir := t.TempDir()

	// Three failures on different targets
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm install"}, dir)
	ProcessToolFailure("Edit", map[string]interface{}{"file_path": "/foo.go"}, dir)
	result := ProcessToolFailure("Write", map[string]interface{}{"file_path": "/bar.go"}, dir)

	if result.SpecificOutput == nil {
		t.Fatal("third failure should trigger tip")
	}
}

func TestProcessToolFailure_ResetAfterTip(t *testing.T) {
	dir := t.TempDir()

	// Trigger tip (3 same-target failures)
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)

	// Next failure should not trigger (state was reset)
	result := ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	if result.SpecificOutput != nil {
		t.Error("after reset, first failure should not trigger tip")
	}
}

func TestProcessToolSuccess_ClearsState(t *testing.T) {
	dir := t.TempDir()

	// Create some failure state
	ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)

	// Success clears it
	ProcessToolSuccess(dir)

	// State file should be gone
	statePath := filepath.Join(dir, failureStateFileName)
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Error("state file should be deleted after success")
	}
}

func TestGetFailureTarget(t *testing.T) {
	tests := []struct {
		tool  string
		input map[string]interface{}
		want  string
	}{
		{"Bash", map[string]interface{}{"command": "npm install"}, "npm"},
		{"Bash", map[string]interface{}{"command": "ls"}, "ls"},
		{"Edit", map[string]interface{}{"file_path": "/foo.go"}, "/foo.go"},
		{"Write", map[string]interface{}{"file_path": "/bar.go"}, "/bar.go"},
		{"Read", map[string]interface{}{"file_path": "/baz.go"}, ""},
		{"Bash", map[string]interface{}{}, ""},
	}
	for _, tt := range tests {
		got := getFailureTarget(tt.tool, tt.input)
		if got != tt.want {
			t.Errorf("getFailureTarget(%q, %v) = %q, want %q", tt.tool, tt.input, got, tt.want)
		}
	}
}

func TestProcessToolFailure_StaleState(t *testing.T) {
	dir := t.TempDir()

	// Write a stale state file (timestamp = 2 hours ago)
	staleJSON := `{"count":2,"lastTarget":"npm","sameTargetCount":2,"timestamp":0}`
	os.WriteFile(filepath.Join(dir, failureStateFileName), []byte(staleJSON), 0o644)

	// Should treat as fresh start (stale state discarded)
	result := ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	if result.SpecificOutput != nil {
		t.Error("stale state should be discarded, first failure should not trigger tip")
	}
}

// --- Tests for ProcessToolFailureWithSearch ---

func TestWithSearch_InjectsLessonsOnThreshold(t *testing.T) {
	dir := t.TempDir()
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return []LessonMatch{
			{Trigger: "npm ENOENT", Insight: "Clear node_modules", Score: 0.8},
		}, nil
	}

	// Three same-target failures to trigger threshold
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm install"}, "ENOENT", dir, searchFn)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "ENOENT", dir, searchFn)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm run build"}, "ENOENT", dir, searchFn)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	if !strings.Contains(result.SpecificOutput.AdditionalContext, "npm ENOENT") {
		t.Error("tip should contain lesson trigger")
	}
	if !strings.Contains(result.SpecificOutput.AdditionalContext, "Clear node_modules") {
		t.Error("tip should contain lesson insight")
	}
}

func TestWithSearch_FallsBackOnNoResults(t *testing.T) {
	dir := t.TempDir()
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return nil, nil
	}

	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	if result.SpecificOutput.AdditionalContext != failureTip {
		t.Errorf("expected static tip fallback, got %q", result.SpecificOutput.AdditionalContext)
	}
}

func TestWithSearch_FallsBackOnError(t *testing.T) {
	dir := t.TempDir()
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		return nil, errors.New("db not initialized")
	}

	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, searchFn)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	if result.SpecificOutput.AdditionalContext != failureTip {
		t.Errorf("expected static tip fallback, got %q", result.SpecificOutput.AdditionalContext)
	}
}

func TestWithSearch_NilSearchFnFallsBackToStaticTip(t *testing.T) {
	dir := t.TempDir()

	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, nil)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, nil)
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "error", dir, nil)

	if result.SpecificOutput == nil {
		t.Fatal("expected tip on threshold")
	}
	if result.SpecificOutput.AdditionalContext != failureTip {
		t.Errorf("expected static tip, got %q", result.SpecificOutput.AdditionalContext)
	}
}

func TestWithSearch_PassesCorrectTokensToSearch(t *testing.T) {
	dir := t.TempDir()
	var capturedTokens []string
	searchFn := func(_ context.Context, tokens []string, _ int) ([]LessonMatch, error) {
		capturedTokens = tokens
		return nil, nil
	}

	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm install"}, "ENOENT: no such file", dir, searchFn)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm test"}, "ENOENT: no such file", dir, searchFn)
	ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm run build"}, "ENOENT: no such file", dir, searchFn)

	if !sliceContains(capturedTokens, "npm") {
		t.Error("tokens should contain target")
	}
	if !sliceContains(capturedTokens, "ENOENT") {
		t.Error("tokens should contain error keyword")
	}
}

func TestWithSearch_SubThresholdNoSearch(t *testing.T) {
	dir := t.TempDir()
	called := false
	searchFn := func(_ context.Context, _ []string, _ int) ([]LessonMatch, error) {
		called = true
		return nil, nil
	}

	// Only one failure — below threshold
	result := ProcessToolFailureWithSearch("Bash", map[string]interface{}{"command": "npm install"}, "error", dir, searchFn)

	if result.SpecificOutput != nil {
		t.Error("sub-threshold should not trigger tip")
	}
	if called {
		t.Error("search should not be called below threshold")
	}
}
