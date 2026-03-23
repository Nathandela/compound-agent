package hook

import (
	"os"
	"path/filepath"
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

	// Second failure on same target should trigger
	result := ProcessToolFailure("Bash", map[string]interface{}{"command": "npm test"}, dir)
	if result.SpecificOutput == nil {
		t.Fatal("second failure on same target should trigger tip")
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

	// Trigger tip
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
