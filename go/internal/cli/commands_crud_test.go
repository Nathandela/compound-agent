package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/spf13/cobra"
)

// setupTestRepo creates a temp dir with a .claude/lessons/index.jsonl containing seed items.
func setupTestRepo(t *testing.T, items []memory.Item) string {
	t.Helper()
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	if err := os.MkdirAll(lessonsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if err := memory.AppendItem(dir, item); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// runCmd executes a cobra command with the given args and returns stdout, stderr, and error.
func runCmd(cmd *cobra.Command, args []string) (stdout, stderr string, err error) {
	var outBuf, errBuf bytes.Buffer
	cmd.SetOut(&outBuf)
	cmd.SetErr(&errBuf)
	cmd.SetArgs(args)
	err = cmd.Execute()
	return outBuf.String(), errBuf.String(), err
}

// buildRoot creates a root cobra command with CRUD commands registered.
func buildRoot() *cobra.Command {
	root := &cobra.Command{Use: "ca", SilenceUsage: true, SilenceErrors: true}
	registerCrudCommands(root)
	return root
}

// seedItems returns a standard set of test lessons.
func seedItems() []memory.Item {
	sev := memory.SeverityHigh
	return []memory.Item{
		{
			ID: "L0001", Type: memory.TypeLesson, Trigger: "Bad error handling",
			Insight: "Always check error returns", Tags: []string{"go", "errors"},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
			Confirmed: true, Severity: &sev, Evidence: strPtr("saw crash in prod"),
		},
		{
			ID: "L0002", Type: memory.TypeLesson, Trigger: "Goroutine leak",
			Insight: "Use context for cancellation", Tags: []string{"go", "concurrency"},
			Source: memory.SourceUserCorrection, Context: memory.Context{}, Created: "2026-03-02T10:00:00Z",
		},
	}
}

// --- show command tests ---

func TestShowCmd_HumanFormat(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"show", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(stdout, "L0001") {
		t.Error("expected output to contain ID")
	}
	if !strings.Contains(stdout, "Always check error returns") {
		t.Error("expected output to contain insight")
	}
	if !strings.Contains(stdout, "Bad error handling") {
		t.Error("expected output to contain trigger")
	}
	if !strings.Contains(stdout, "high") {
		t.Error("expected output to contain severity")
	}
	if !strings.Contains(stdout, "go") {
		t.Error("expected output to contain tags")
	}
}

func TestShowCmd_JSONFormat(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"show", "--json", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var item memory.Item
	if err := json.Unmarshal([]byte(stdout), &item); err != nil {
		t.Fatalf("invalid JSON output: %v\n%s", err, stdout)
	}
	if item.ID != "L0001" {
		t.Errorf("ID = %q, want L0001", item.ID)
	}
	if item.Insight != "Always check error returns" {
		t.Errorf("Insight = %q", item.Insight)
	}
}

func TestShowCmd_NotFound(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"show", "LNOTEXIST"})
	if err == nil {
		t.Fatal("expected error for non-existent lesson")
	}
	if !strings.Contains(stderr, "not found") {
		t.Errorf("expected 'not found' in stderr, got: %s", stderr)
	}
}

func TestShowCmd_DeletedLesson(t *testing.T) {
	items := seedItems()
	dir := setupTestRepo(t, items)

	// Add a tombstone for L0001
	deleted := true
	tombstone := memory.Item{
		ID: "L0001", Type: memory.TypeLesson, Trigger: "x", Insight: "x",
		Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
		Tags: []string{}, Deleted: &deleted, DeletedAt: strPtr("2026-03-10T10:00:00Z"),
	}
	if err := memory.AppendItem(dir, tombstone); err != nil {
		t.Fatal(err)
	}

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"show", "L0001"})
	if err == nil {
		t.Fatal("expected error for deleted lesson")
	}
	if !strings.Contains(stderr, "deleted") {
		t.Errorf("expected 'deleted' in stderr, got: %s", stderr)
	}
}

// --- update command tests ---

func TestUpdateCmd_UpdateInsight(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"update", "L0001", "--insight", "New insight text"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Updated") {
		t.Errorf("expected success message, got: %s", stdout)
	}

	// Verify the update persisted
	result, err := memory.ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result.Items {
		if item.ID == "L0001" {
			if item.Insight != "New insight text" {
				t.Errorf("insight = %q, want %q", item.Insight, "New insight text")
			}
			return
		}
	}
	t.Error("L0001 not found after update")
}

func TestUpdateCmd_UpdateTags(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, _, err := runCmd(root, []string{"update", "L0001", "--tags", "new-tag, another , new-tag"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			// Should be deduplicated
			if len(item.Tags) != 2 {
				t.Errorf("tags count = %d, want 2 (deduped), tags: %v", len(item.Tags), item.Tags)
			}
			return
		}
	}
	t.Error("L0001 not found after update")
}

func TestUpdateCmd_UpdateSeverity(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, _, err := runCmd(root, []string{"update", "L0001", "--severity", "low"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			if item.Severity == nil || *item.Severity != memory.SeverityLow {
				t.Errorf("severity = %v, want low", item.Severity)
			}
			return
		}
	}
	t.Error("L0001 not found after update")
}

func TestUpdateCmd_InvalidSeverity(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"update", "L0001", "--severity", "critical"})
	if err == nil {
		t.Fatal("expected error for invalid severity")
	}
	if !strings.Contains(stderr, "severity") {
		t.Errorf("expected severity error, got: %s", stderr)
	}
}

func TestUpdateCmd_NoFieldsProvided(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"update", "L0001"})
	if err == nil {
		t.Fatal("expected error when no fields provided")
	}
	if !strings.Contains(stderr, "No fields") {
		t.Errorf("expected 'No fields' error, got: %s", stderr)
	}
}

func TestUpdateCmd_NotFound(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"update", "LNOTEXIST", "--insight", "x"})
	if err == nil {
		t.Fatal("expected error for non-existent lesson")
	}
	if !strings.Contains(stderr, "not found") {
		t.Errorf("expected 'not found' in stderr, got: %s", stderr)
	}
}

func TestUpdateCmd_JSONOutput(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"update", "L0001", "--insight", "Changed", "--json"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var item memory.Item
	if err := json.Unmarshal([]byte(stdout), &item); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if item.Insight != "Changed" {
		t.Errorf("insight = %q, want Changed", item.Insight)
	}
}

func TestUpdateCmd_UpdateConfirmed(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// L0002 starts unconfirmed
	root := buildRoot()
	_, _, err := runCmd(root, []string{"update", "L0002", "--confirmed", "true"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0002" {
			if !item.Confirmed {
				t.Error("expected confirmed = true")
			}
			return
		}
	}
	t.Error("L0002 not found after update")
}

// --- delete command tests ---

func TestDeleteCmd_SingleID(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"delete", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Deleted") {
		t.Errorf("expected success message, got: %s", stdout)
	}

	// Verify it's gone
	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			t.Error("L0001 should have been deleted")
		}
	}
	if !result.DeletedIDs["L0001"] {
		t.Error("L0001 should be in DeletedIDs")
	}
}

func TestDeleteCmd_MultipleIDs(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"delete", "L0001", "L0002"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "2 lesson(s)") {
		t.Errorf("expected '2 lesson(s)' in output, got: %s", stdout)
	}

	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 0 {
		t.Errorf("expected 0 items, got %d", len(result.Items))
	}
}

func TestDeleteCmd_NotFound(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"delete", "LNOTEXIST"})
	// When all IDs produce warnings and none deleted, should error
	if err == nil {
		t.Fatal("expected error when no IDs deleted")
	}
	_ = stdout
}

func TestDeleteCmd_AlreadyDeleted(t *testing.T) {
	items := seedItems()
	dir := setupTestRepo(t, items)

	// Add a tombstone for L0001
	deleted := true
	tombstone := memory.Item{
		ID: "L0001", Type: memory.TypeLesson, Trigger: "x", Insight: "x",
		Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
		Tags: []string{}, Deleted: &deleted, DeletedAt: strPtr("2026-03-10T10:00:00Z"),
	}
	if err := memory.AppendItem(dir, tombstone); err != nil {
		t.Fatal(err)
	}

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildRoot()
	stdout, stderr, _ := runCmd(root, []string{"delete", "L0001"})
	combined := stdout + stderr
	if !strings.Contains(combined, "already deleted") {
		t.Errorf("expected 'already deleted' warning, got: %s", combined)
	}
}

func TestDeleteCmd_JSONOutput(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"delete", "--json", "L0001", "LNOTEXIST"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result struct {
		Deleted  []string `json:"deleted"`
		Warnings []struct {
			ID      string `json:"id"`
			Message string `json:"message"`
		} `json:"warnings"`
	}
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if len(result.Deleted) != 1 || result.Deleted[0] != "L0001" {
		t.Errorf("deleted = %v, want [L0001]", result.Deleted)
	}
	if len(result.Warnings) != 1 || result.Warnings[0].ID != "LNOTEXIST" {
		t.Errorf("warnings = %v", result.Warnings)
	}
}

// --- wrong command tests ---

func TestWrongCmd_MarkInvalid(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"wrong", "L0001", "--reason", "This was incorrect"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "invalid") {
		t.Errorf("expected success message, got: %s", stdout)
	}

	// Verify the invalidation persisted
	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			if item.InvalidatedAt == nil {
				t.Error("expected invalidatedAt to be set")
			}
			if item.InvalidationReason == nil || *item.InvalidationReason != "This was incorrect" {
				t.Errorf("invalidationReason = %v", item.InvalidationReason)
			}
			return
		}
	}
	t.Error("L0001 not found after wrong")
}

func TestWrongCmd_NoReason(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, _, err := runCmd(root, []string{"wrong", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			if item.InvalidatedAt == nil {
				t.Error("expected invalidatedAt to be set")
			}
			if item.InvalidationReason != nil {
				t.Errorf("expected no reason, got %q", *item.InvalidationReason)
			}
			return
		}
	}
	t.Error("L0001 not found after wrong")
}

func TestWrongCmd_AlreadyInvalid(t *testing.T) {
	items := seedItems()
	items[0].InvalidatedAt = strPtr("2026-03-05T10:00:00Z")
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"wrong", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "already") {
		t.Errorf("expected 'already' warning, got: %s", stdout)
	}
}

func TestWrongCmd_NotFound(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"wrong", "LNOTEXIST"})
	if err == nil {
		t.Fatal("expected error for non-existent lesson")
	}
	if !strings.Contains(stderr, "not found") {
		t.Errorf("expected 'not found' in stderr, got: %s", stderr)
	}
}

// --- validate command tests ---

func TestValidateCmd_ReEnable(t *testing.T) {
	items := seedItems()
	items[0].InvalidatedAt = strPtr("2026-03-05T10:00:00Z")
	items[0].InvalidationReason = strPtr("was wrong")
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"validate", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "re-enabled") || !strings.Contains(stdout, "validated") {
		t.Errorf("expected re-enabled message, got: %s", stdout)
	}

	// Verify invalidation fields cleared
	result, _ := memory.ReadItems(dir)
	for _, item := range result.Items {
		if item.ID == "L0001" {
			if item.InvalidatedAt != nil {
				t.Error("expected invalidatedAt to be nil")
			}
			if item.InvalidationReason != nil {
				t.Error("expected invalidationReason to be nil")
			}
			return
		}
	}
	t.Error("L0001 not found after validate")
}

func TestValidateCmd_NotInvalidated(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	stdout, _, err := runCmd(root, []string{"validate", "L0001"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "not invalidated") {
		t.Errorf("expected info about not invalidated, got: %s", stdout)
	}
}

func TestValidateCmd_NotFound(t *testing.T) {
	dir := setupTestRepo(t, seedItems())
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildRoot()
	_, stderr, err := runCmd(root, []string{"validate", "LNOTEXIST"})
	if err == nil {
		t.Fatal("expected error for non-existent lesson")
	}
	if !strings.Contains(stderr, "not found") {
		t.Errorf("expected 'not found' in stderr, got: %s", stderr)
	}
}
