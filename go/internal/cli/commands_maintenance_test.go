package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/spf13/cobra"
)

// buildMaintenanceRoot creates a root cobra command with maintenance commands registered.
func buildMaintenanceRoot() *cobra.Command {
	root := &cobra.Command{Use: "ca", SilenceUsage: true, SilenceErrors: true}
	registerMaintenanceCommands(root)
	return root
}

// writeTombstone writes a tombstone record for the given ID.
func writeTombstone(t *testing.T, dir, id string) {
	t.Helper()
	deleted := true
	tombstone := memory.Item{
		ID: id, Type: memory.TypeLesson, Trigger: "x", Insight: "x",
		Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
		Tags: []string{}, Deleted: &deleted, DeletedAt: strPtr("2026-03-10T10:00:00Z"),
	}
	if err := memory.AppendItem(dir, tombstone); err != nil {
		t.Fatal(err)
	}
}

// maintenanceSeedItems returns test items with varying ages and severities.
func maintenanceSeedItems() []memory.Item {
	sevHigh := memory.SeverityHigh
	sevMed := memory.SeverityMedium
	rc := 3
	return []memory.Item{
		{
			ID: "L0001", Type: memory.TypeLesson, Trigger: "Bad error handling",
			Insight: "Always check error returns", Tags: []string{"go", "errors"},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
			Confirmed: true, Severity: &sevHigh, RetrievalCount: &rc,
		},
		{
			ID: "L0002", Type: memory.TypeLesson, Trigger: "Goroutine leak",
			Insight: "Use context for cancellation", Tags: []string{"go", "concurrency"},
			Source: memory.SourceUserCorrection, Context: memory.Context{}, Created: "2026-02-01T10:00:00Z",
			Confirmed: true, Severity: &sevMed,
		},
		{
			ID: "L0003", Type: memory.TypeLesson, Trigger: "Old lesson",
			Insight: "Something from long ago", Tags: []string{"old"},
			Source: memory.SourceManual, Context: memory.Context{},
			Created: time.Now().AddDate(0, 0, -120).Format(time.RFC3339),
		},
	}
}

// --- formatBytes tests ---

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		input int64
		want  string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1023, "1023 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1048576, "1.0 MB"},
		{2621440, "2.5 MB"},
	}
	for _, tt := range tests {
		got := formatBytes(tt.input)
		if got != tt.want {
			t.Errorf("formatBytes(%d) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

// --- compact command tests ---

func TestCompactCmd_DryRun(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	// Add some tombstones
	writeTombstone(t, dir, "L0001")
	writeTombstone(t, dir, "L0002")

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"compact", "--dry-run"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "2") {
		t.Errorf("expected tombstone count in output, got: %s", stdout)
	}
	if !strings.Contains(stdout, "not needed") || !strings.Contains(stdout, "threshold") {
		t.Errorf("expected 'not needed' message with threshold, got: %s", stdout)
	}
}

func TestCompactCmd_NotNeeded(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	// Add 1 tombstone (below threshold)
	writeTombstone(t, dir, "L0001")

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"compact"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "not needed") {
		t.Errorf("expected 'not needed' message, got: %s", stdout)
	}
}

func TestCompactCmd_Force(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	writeTombstone(t, dir, "L0001")

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"compact", "--force"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Compacted") {
		t.Errorf("expected 'Compacted' message, got: %s", stdout)
	}
	if !strings.Contains(stdout, "remaining") {
		t.Errorf("expected 'remaining' in output, got: %s", stdout)
	}

	// Verify tombstones are gone
	result, err := memory.ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result.Items {
		if item.ID == "L0001" {
			t.Error("L0001 should have been removed by compaction (was tombstoned)")
		}
	}
}

// --- rebuild command tests ---

func TestRebuildCmd_Force(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"rebuild", "--force"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Rebuilt") || !strings.Contains(stdout, "index") {
		t.Errorf("expected rebuild confirmation, got: %s", stdout)
	}

	// Verify SQLite file exists
	dbPath := filepath.Join(dir, ".claude/.cache/lessons.sqlite")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("SQLite file should exist after rebuild")
	}
}

func TestRebuildCmd_NoForce(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"rebuild"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should still produce output (either "rebuilt" or "up to date")
	if stdout == "" {
		t.Error("expected some output")
	}
}

// --- stats command tests ---

func TestStatsCmd_Output(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	writeTombstone(t, dir, "L0001")

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"stats"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should contain lesson count (2 after tombstone removes L0001)
	if !strings.Contains(stdout, "2") {
		t.Errorf("expected lesson count of 2, got: %s", stdout)
	}
	// Should mention tombstones
	if !strings.Contains(stdout, "ombstone") {
		t.Errorf("expected tombstone info, got: %s", stdout)
	}
	// Should mention JSONL file size
	if !strings.Contains(stdout, "JSONL") {
		t.Errorf("expected JSONL size info, got: %s", stdout)
	}
	// Should have age breakdown
	if !strings.Contains(stdout, "30d") || !strings.Contains(stdout, "90d") {
		t.Errorf("expected age breakdown, got: %s", stdout)
	}
}

func TestStatsCmd_EmptyRepo(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"stats"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "0") {
		t.Errorf("expected 0 lessons, got: %s", stdout)
	}
}

func TestStatsCmd_RetrievalCount(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"stats"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// L0001 has retrievalCount=3, others have 0
	if !strings.Contains(stdout, "3") {
		t.Errorf("expected total retrieval count of 3 somewhere, got: %s", stdout)
	}
}

// --- export command tests ---

func TestExportCmd_AllItems(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"export"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 3 {
		t.Errorf("expected 3 lines, got %d: %s", len(lines), stdout)
	}

	// Each line should be valid JSON
	for i, line := range lines {
		var item memory.Item
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			t.Errorf("line %d: invalid JSON: %v", i, err)
		}
	}
}

func TestExportCmd_FilterSince(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	// Only items created after 2026-02-15
	stdout, _, err := runCmd(root, []string{"export", "--since", "2026-02-15"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	// L0001 (2026-03-01) should pass, L0002 (2026-02-01) should not, L0003 depends on test time
	// At minimum L0001 should be there
	found := false
	for _, line := range lines {
		if strings.Contains(line, "L0001") {
			found = true
		}
		if strings.Contains(line, "L0002") {
			t.Error("L0002 should be filtered out (created 2026-02-01)")
		}
	}
	if !found {
		t.Error("L0001 should be in output")
	}
}

func TestExportCmd_FilterTags(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"export", "--tags", "concurrency"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 1 {
		t.Errorf("expected 1 line (L0002 only), got %d: %s", len(lines), stdout)
	}
	if !strings.Contains(stdout, "L0002") {
		t.Error("expected L0002 in output")
	}
}

func TestExportCmd_FilterTagsOR(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)

	t.Setenv("COMPOUND_AGENT_ROOT", dir)
	root := buildMaintenanceRoot()
	// "old" tag matches L0003, "concurrency" matches L0002
	stdout, _, err := runCmd(root, []string{"export", "--tags", "old,concurrency"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 2 {
		t.Errorf("expected 2 lines, got %d: %s", len(lines), stdout)
	}
}

func TestExportCmd_Empty(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"export"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("expected empty output, got: %s", stdout)
	}
}

// --- import command tests ---

func TestImportCmd_BasicImport(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Write an import file
	importItems := []memory.Item{
		{
			ID: "LIMP1", Type: memory.TypeLesson, Trigger: "import trigger",
			Insight: "imported insight", Tags: []string{"imported"},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-10T10:00:00Z",
			Supersedes: []string{}, Related: []string{},
		},
	}
	importFile := filepath.Join(dir, "import.jsonl")
	f, err := os.Create(importFile)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range importItems {
		data, _ := json.Marshal(item)
		f.Write(append(data, '\n'))
	}
	f.Close()

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"import", importFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Imported 1") {
		t.Errorf("expected 'Imported 1' message, got: %s", stdout)
	}

	// Verify item was written
	result, err := memory.ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range result.Items {
		if item.ID == "LIMP1" {
			found = true
		}
	}
	if !found {
		t.Error("imported item LIMP1 not found")
	}
}

func TestImportCmd_SkipsDuplicates(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Import file contains L0001 (already exists) + a new item
	importItems := []memory.Item{
		{
			ID: "L0001", Type: memory.TypeLesson, Trigger: "duplicate",
			Insight: "Already exists", Tags: []string{},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
			Supersedes: []string{}, Related: []string{},
		},
		{
			ID: "LNEW1", Type: memory.TypeLesson, Trigger: "new trigger",
			Insight: "Brand new lesson", Tags: []string{"new"},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-15T10:00:00Z",
			Supersedes: []string{}, Related: []string{},
		},
	}
	importFile := filepath.Join(dir, "import.jsonl")
	f, err := os.Create(importFile)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range importItems {
		data, _ := json.Marshal(item)
		f.Write(append(data, '\n'))
	}
	f.Close()

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"import", importFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Imported 1") {
		t.Errorf("expected 'Imported 1', got: %s", stdout)
	}
	if !strings.Contains(stdout, "1 skipped") {
		t.Errorf("expected '1 skipped', got: %s", stdout)
	}
}

func TestImportCmd_InvalidItems(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Write a file with one valid and one invalid item
	importFile := filepath.Join(dir, "import.jsonl")
	f, err := os.Create(importFile)
	if err != nil {
		t.Fatal(err)
	}
	validItem := memory.Item{
		ID: "LVALID", Type: memory.TypeLesson, Trigger: "trigger",
		Insight: "valid insight", Tags: []string{},
		Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-10T10:00:00Z",
		Supersedes: []string{}, Related: []string{},
	}
	data, _ := json.Marshal(validItem)
	f.Write(append(data, '\n'))
	// Invalid: missing required fields
	f.WriteString(`{"id":"LINV","type":"unknown"}` + "\n")
	f.Close()

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"import", importFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Imported 1") {
		t.Errorf("expected 'Imported 1', got: %s", stdout)
	}
	if !strings.Contains(stdout, "1 invalid") {
		t.Errorf("expected '1 invalid', got: %s", stdout)
	}
}

func TestImportCmd_MissingFile(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	_, _, err := runCmd(root, []string{"import", "/nonexistent/file.jsonl"})
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestImportCmd_NoArgs(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	_, _, err := runCmd(root, []string{"import"})
	if err == nil {
		t.Fatal("expected error for missing file argument")
	}
}

// --- prime command tests ---

func TestPrimeCmd_Output(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"prime"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should contain trust language
	if !strings.Contains(stdout, "Compound Agent Active") {
		t.Error("expected trust language header")
	}
	if !strings.Contains(stdout, "npx ca search") {
		t.Error("expected CLI commands table")
	}
	// Should contain critical lessons header
	if !strings.Contains(stdout, "Mandatory Recall") {
		t.Error("expected mandatory recall section")
	}
}

func TestPrimeCmd_WithHighSeverityLessons(t *testing.T) {
	sevHigh := memory.SeverityHigh
	items := []memory.Item{
		{
			ID: "LHIGH1", Type: memory.TypeLesson, Trigger: "test",
			Insight: "Critical lesson one", Tags: []string{"security"},
			Source: memory.SourceUserCorrection, Context: memory.Context{},
			Created: "2026-03-15T10:00:00Z", Confirmed: true, Severity: &sevHigh,
		},
	}
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"prime"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(stdout, "Critical lesson one") {
		t.Error("expected high-severity lesson in output")
	}
	if !strings.Contains(stdout, "security") {
		t.Error("expected tags in lesson output")
	}
	if !strings.Contains(stdout, "2026-03-15") {
		t.Error("expected date in lesson output")
	}
	if !strings.Contains(stdout, "user correction") {
		t.Error("expected source in lesson output")
	}
}

func TestPrimeCmd_NoHighSeverity(t *testing.T) {
	// Items with no high severity + confirmed
	items := []memory.Item{
		{
			ID: "L001", Type: memory.TypeLesson, Trigger: "test",
			Insight: "Medium lesson", Tags: []string{},
			Source: memory.SourceManual, Context: memory.Context{},
			Created: "2026-03-15T10:00:00Z",
		},
	}
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"prime"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should still contain trust language
	if !strings.Contains(stdout, "Compound Agent Active") {
		t.Error("expected trust language even with no lessons")
	}
	// Should NOT contain lesson-specific content
	if strings.Contains(stdout, "Medium lesson") {
		t.Error("medium severity lesson should not appear in prime")
	}
}

// --- clean-lessons removed ---

func TestCleanLessonsCmd_NotRegistered(t *testing.T) {
	root := buildMaintenanceRoot()
	// clean-lessons command should not exist
	for _, cmd := range root.Commands() {
		if cmd.Name() == "clean-lessons" {
			t.Error("clean-lessons command should not be registered (stub removed)")
		}
	}
}

// --- combined filter tests for export ---

func TestExportCmd_SinceAndTags(t *testing.T) {
	items := maintenanceSeedItems()
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	// Since 2026-02-15 AND tags=errors -> only L0001
	stdout, _, err := runCmd(root, []string{"export", "--since", "2026-02-15", "--tags", "errors"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 1 {
		t.Errorf("expected 1 line, got %d: %s", len(lines), stdout)
	}
	if !strings.Contains(stdout, "L0001") {
		t.Error("expected L0001 in output")
	}
}

// --- stats type breakdown ---

func TestStatsCmd_TypeBreakdown(t *testing.T) {
	sevHigh := memory.SeverityHigh
	items := []memory.Item{
		{
			ID: "L0001", Type: memory.TypeLesson, Trigger: "t", Insight: "i", Tags: []string{},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
			Severity: &sevHigh,
		},
		{
			ID: "S0001", Type: memory.TypeSolution, Trigger: "t", Insight: "i", Tags: []string{},
			Source: memory.SourceManual, Context: memory.Context{}, Created: "2026-03-01T10:00:00Z",
		},
	}
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildMaintenanceRoot()
	stdout, _, err := runCmd(root, []string{"stats"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Multiple types -> should show type breakdown
	if !strings.Contains(stdout, "lesson") || !strings.Contains(stdout, "solution") {
		t.Errorf("expected type breakdown with lesson and solution, got: %s", stdout)
	}
}

// --- import round-trip test ---

func TestExportImportRoundTrip(t *testing.T) {
	items := maintenanceSeedItems()[:2] // Just L0001 and L0002
	dir := setupTestRepo(t, items)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Export
	root := buildMaintenanceRoot()
	exportOut, _, err := runCmd(root, []string{"export"})
	if err != nil {
		t.Fatalf("export error: %v", err)
	}

	// Create a new empty repo
	dir2 := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir2)

	// Write export to file
	importFile := filepath.Join(dir2, "exported.jsonl")
	if err := os.WriteFile(importFile, []byte(exportOut), 0o644); err != nil {
		t.Fatal(err)
	}

	// Import
	root2 := buildMaintenanceRoot()
	importOut, _, err := runCmd(root2, []string{"import", importFile})
	if err != nil {
		t.Fatalf("import error: %v", err)
	}
	if !strings.Contains(importOut, fmt.Sprintf("Imported %d", 2)) {
		t.Errorf("expected 'Imported 2', got: %s", importOut)
	}

	// Verify items match
	result, err := memory.ReadItems(dir2)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(result.Items))
	}
}
