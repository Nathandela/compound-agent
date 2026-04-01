package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadHintsEnabled_True(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "compound-agent.json"), []byte(`{"hints": true}`), 0644)

	if !ReadHintsEnabled(dir) {
		t.Error("expected hints to be enabled")
	}
}

func TestReadHintsEnabled_False(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "compound-agent.json"), []byte(`{"hints": false}`), 0644)

	if ReadHintsEnabled(dir) {
		t.Error("expected hints to be disabled")
	}
}

func TestReadHintsEnabled_NoFile(t *testing.T) {
	dir := t.TempDir()

	if ReadHintsEnabled(dir) {
		t.Error("expected hints to be disabled when config file missing")
	}
}

func TestReadHintsEnabled_NoHintsKey(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "compound-agent.json"), []byte(`{"externalReviewers": []}`), 0644)

	if ReadHintsEnabled(dir) {
		t.Error("expected hints to be disabled when key absent")
	}
}

func TestShouldShowHint_FirstSession(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "compound-agent.json"), []byte(`{"hints": true}`), 0644)

	if !ShouldShowHint(dir) {
		t.Error("expected hint on first session when hints enabled")
	}
}

func TestShouldShowHint_AlreadyShown(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)
	os.WriteFile(filepath.Join(claudeDir, "compound-agent.json"), []byte(`{"hints": true}`), 0644)

	if err := MarkHintShown(dir); err != nil {
		t.Fatalf("mark hint shown: %v", err)
	}

	if ShouldShowHint(dir) {
		t.Error("expected no hint after already shown")
	}
}

func TestShouldShowHint_HintsDisabled(t *testing.T) {
	dir := t.TempDir()

	if ShouldShowHint(dir) {
		t.Error("expected no hint when hints not configured")
	}
}

func TestMarkHintShown_CreatesMarker(t *testing.T) {
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	os.MkdirAll(claudeDir, 0755)

	if err := MarkHintShown(dir); err != nil {
		t.Fatalf("mark hint shown: %v", err)
	}

	markerPath := filepath.Join(claudeDir, ".ca-hints-shown")
	if _, err := os.Stat(markerPath); os.IsNotExist(err) {
		t.Error("expected marker file to exist")
	}
}

func TestWorkflowHintText(t *testing.T) {
	hint := WorkflowHint()
	if hint == "" {
		t.Error("expected non-empty workflow hint")
	}
}
