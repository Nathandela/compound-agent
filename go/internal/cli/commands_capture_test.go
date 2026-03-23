package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/capture"
	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/spf13/cobra"
)

// buildCaptureRoot creates a root cobra command with capture commands registered.
func buildCaptureRoot() *cobra.Command {
	root := &cobra.Command{Use: "ca", SilenceUsage: true, SilenceErrors: true}
	registerCaptureCommands(root)
	return root
}

// --- learn command tests ---

func TestLearnCmd_BasicInsight(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"learn", "Always use parameterized queries for SQL"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Learned:") {
		t.Errorf("expected 'Learned:' in output, got: %s", stdout)
	}
	if !strings.Contains(stdout, "Always use parameterized queries for SQL") {
		t.Errorf("expected insight in output, got: %s", stdout)
	}

	// Verify persisted
	result, err := memory.ReadItems(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}
	item := result.Items[0]
	if item.Insight != "Always use parameterized queries for SQL" {
		t.Errorf("insight = %q", item.Insight)
	}
	if item.Trigger != "Manual capture" {
		t.Errorf("trigger = %q, want 'Manual capture'", item.Trigger)
	}
	if item.Source != memory.SourceManual {
		t.Errorf("source = %q, want manual", item.Source)
	}
	if !item.Confirmed {
		t.Error("expected confirmed = true")
	}
	if item.Context.Tool != "cli" || item.Context.Intent != "manual learning" {
		t.Errorf("context = %+v", item.Context)
	}
	if item.Type != memory.TypeLesson {
		t.Errorf("type = %q, want lesson", item.Type)
	}
}

func TestLearnCmd_WithFlags(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"learn",
		"--trigger", "Found SQL injection bug",
		"--tags", "sql,security",
		"--severity", "high",
		"--citation", "main.go:42",
		"Always use parameterized queries for SQL",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Learned:") {
		t.Errorf("expected 'Learned:' in output, got: %s", stdout)
	}

	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}
	item := result.Items[0]
	if item.Trigger != "Found SQL injection bug" {
		t.Errorf("trigger = %q", item.Trigger)
	}
	if len(item.Tags) != 2 || item.Tags[0] != "sql" || item.Tags[1] != "security" {
		t.Errorf("tags = %v", item.Tags)
	}
	if item.Severity == nil || *item.Severity != memory.SeverityHigh {
		t.Errorf("severity = %v", item.Severity)
	}
	if item.Citation == nil {
		t.Fatal("expected citation")
	}
	if item.Citation.File != "main.go" {
		t.Errorf("citation file = %q", item.Citation.File)
	}
	if item.Citation.Line == nil || *item.Citation.Line != 42 {
		t.Errorf("citation line = %v", item.Citation.Line)
	}
}

func TestLearnCmd_WithCitationCommit(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--citation", "main.go:10",
		"--citation-commit", "abc123",
		"Check error returns in all handlers",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	item := result.Items[0]
	if item.Citation == nil {
		t.Fatal("expected citation")
	}
	if item.Citation.Commit == nil || *item.Citation.Commit != "abc123" {
		t.Errorf("citation commit = %v", item.Citation.Commit)
	}
}

func TestLearnCmd_PatternType(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--type", "pattern",
		"--pattern-bad", "fmt.Sprintf(query, val)",
		"--pattern-good", "db.Query(query, val)",
		"Use parameterized queries instead of string formatting",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	item := result.Items[0]
	if item.Type != memory.TypePattern {
		t.Errorf("type = %q, want pattern", item.Type)
	}
	if item.Pattern == nil {
		t.Fatal("expected pattern")
	}
	if item.Pattern.Bad != "fmt.Sprintf(query, val)" {
		t.Errorf("pattern.bad = %q", item.Pattern.Bad)
	}
	if item.Pattern.Good != "db.Query(query, val)" {
		t.Errorf("pattern.good = %q", item.Pattern.Good)
	}
}

func TestLearnCmd_PatternTypeMissingBad(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--type", "pattern",
		"--pattern-good", "db.Query(query, val)",
		"Use parameterized queries",
	})
	if err == nil {
		t.Fatal("expected error for pattern type without --pattern-bad")
	}
	if !strings.Contains(err.Error(), "pattern-bad") {
		t.Errorf("expected error about pattern-bad, got: %v", err)
	}
}

func TestLearnCmd_PatternTypeMissingGood(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--type", "pattern",
		"--pattern-bad", "fmt.Sprintf(query, val)",
		"Use parameterized queries",
	})
	if err == nil {
		t.Fatal("expected error for pattern type without --pattern-good")
	}
	if !strings.Contains(err.Error(), "pattern-good") {
		t.Errorf("expected error about pattern-good, got: %v", err)
	}
}

func TestLearnCmd_InvalidType(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--type", "invalid",
		"Some insight text here please",
	})
	if err == nil {
		t.Fatal("expected error for invalid type")
	}
	if !strings.Contains(err.Error(), "type") {
		t.Errorf("expected type error, got: %v", err)
	}
}

func TestLearnCmd_InvalidSeverity(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--severity", "critical",
		"Some insight text here please",
	})
	if err == nil {
		t.Fatal("expected error for invalid severity")
	}
	if !strings.Contains(err.Error(), "severity") {
		t.Errorf("expected severity error, got: %v", err)
	}
}

func TestLearnCmd_InvalidCitationFormat(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--citation", "no-colon-here",
		"Some insight text here please",
	})
	if err == nil {
		t.Fatal("expected error for invalid citation format")
	}
	if !strings.Contains(err.Error(), "file:line") {
		t.Errorf("expected file:line format error, got: %v", err)
	}
}

func TestLearnCmd_GeneratesCorrectID(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	insight := "Always use parameterized queries for SQL"
	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"learn", insight})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedID := memory.GenerateID(insight, memory.TypeLesson)
	if !strings.Contains(stdout, expectedID) {
		t.Errorf("expected ID %s in output, got: %s", expectedID, stdout)
	}
}

func TestLearnCmd_NoArgs(t *testing.T) {
	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{"learn"})
	if err == nil {
		t.Fatal("expected error with no args")
	}
}

func TestLearnCmd_SolutionType(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"learn",
		"--type", "solution",
		"When tests fail due to race conditions, use the -race flag",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := memory.ReadItems(dir)
	if result.Items[0].Type != memory.TypeSolution {
		t.Errorf("type = %q, want solution", result.Items[0].Type)
	}
}

// --- capture command tests ---

func TestCaptureCmd_WithTriggerAndInsight(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"capture",
		"--trigger", "SQL injection found",
		"--insight", "Always use parameterized queries for SQL",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Without --yes, should show preview only (not save)
	if !strings.Contains(stdout, "Always use parameterized queries for SQL") {
		t.Errorf("expected insight in output, got: %s", stdout)
	}
	if !strings.Contains(stdout, "--yes") {
		t.Errorf("expected --yes suggestion in output, got: %s", stdout)
	}

	// Verify nothing saved
	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 0 {
		t.Errorf("expected 0 items (preview only), got %d", len(result.Items))
	}
}

func TestCaptureCmd_WithYes(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"capture",
		"--trigger", "SQL injection found",
		"--insight", "Always use parameterized queries for SQL",
		"--yes",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Learned:") {
		t.Errorf("expected 'Learned:' in output, got: %s", stdout)
	}

	// Verify saved
	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}
}

func TestCaptureCmd_WithJSON(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"capture",
		"--trigger", "SQL injection found",
		"--insight", "Always use parameterized queries for SQL",
		"--json",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result struct {
		ID      string `json:"id"`
		Trigger string `json:"trigger"`
		Insight string `json:"insight"`
		Type    string `json:"type"`
		Saved   bool   `json:"saved"`
	}
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if result.Insight != "Always use parameterized queries for SQL" {
		t.Errorf("insight = %q", result.Insight)
	}
	if result.Saved {
		t.Error("expected saved=false without --yes")
	}
}

func TestCaptureCmd_WithJSONAndYes(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"capture",
		"--trigger", "SQL injection found",
		"--insight", "Always use parameterized queries for SQL",
		"--json",
		"--yes",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result struct {
		ID    string `json:"id"`
		Saved bool   `json:"saved"`
	}
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if !result.Saved {
		t.Error("expected saved=true with --yes")
	}
	if result.ID == "" {
		t.Error("expected non-empty ID")
	}
}

func TestCaptureCmd_MissingTriggerAndInsight(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{"capture"})
	if err == nil {
		t.Fatal("expected error with no trigger/insight/input")
	}
}

func TestCaptureCmd_MissingInsight(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{"capture", "--trigger", "something"})
	if err == nil {
		t.Fatal("expected error with trigger but no insight")
	}
}

func TestCaptureCmd_WithInputFile(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Create input file with user correction signal (actionable insight).
	// The insight must be actionable but NOT match pattern indicators
	// ("use X instead of", "prefer X over/to") to avoid needing Pattern field.
	input := map[string]interface{}{
		"messages": []string{"Do X", "No, actually avoid using globals in production code"},
		"context":  map[string]string{"tool": "editor", "intent": "refactoring"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{
		"capture",
		"--input", inputFile,
		"--yes",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Learned:") {
		t.Errorf("expected 'Learned:' in output, got: %s", stdout)
	}

	// Verify saved
	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}
	item := result.Items[0]
	if item.Source != memory.SourceUserCorrection {
		t.Errorf("source = %q, want user_correction", item.Source)
	}
}

// --- detect command tests ---

func TestDetectCmd_UserCorrection(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"messages": []string{"Do X with globals", "No, actually avoid using globals in production code"},
		"context":  map[string]string{"tool": "editor", "intent": "code review"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Source:   user_correction") {
		t.Errorf("expected 'Source:   user_correction' in output, got: %s", stdout)
	}
	if !strings.Contains(stdout, "Trigger:") {
		t.Errorf("expected 'Trigger:' in output, got: %s", stdout)
	}
}

func TestDetectCmd_TestFailure(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"testResult": capture.TestResult{
			Passed:   false,
			Output:   "FAIL: TestFoo - avoid using globals in production code\nError: assertion failed",
			TestFile: "foo_test.go",
		},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Source:   test_failure") {
		t.Errorf("expected 'Source:   test_failure' in output, got: %s", stdout)
	}
}

func TestDetectCmd_SelfCorrection(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	// Self-correction generates "Self-correction detected on <file>" as insight,
	// which is not actionable. The quality gate correctly rejects it.
	input := map[string]interface{}{
		"editHistory": capture.EditHistory{
			Edits: []capture.EditEntry{
				{File: "main.go", Success: true, Timestamp: 1},
				{File: "main.go", Success: false, Timestamp: 2},
				{File: "main.go", Success: true, Timestamp: 3},
			},
		},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Not captured:") {
		t.Errorf("expected 'Not captured:' for non-actionable self-correction insight, got: %s", stdout)
	}
}

func TestDetectCmd_NoDetection(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"messages": []string{"Hello"},
		"context":  map[string]string{"tool": "editor", "intent": "greeting"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "No correction detected") {
		t.Errorf("expected 'No correction detected', got: %s", stdout)
	}
}

func TestDetectCmd_MissingInput(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{"detect"})
	if err == nil {
		t.Fatal("expected error without --input")
	}
}

func TestDetectCmd_SaveWithYes(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"messages": []string{"Do X", "No, actually avoid using globals in production code"},
		"context":  map[string]string{"tool": "editor", "intent": "refactoring"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile, "--save", "--yes"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, "Learned:") {
		t.Errorf("expected 'Learned:' in output, got: %s", stdout)
	}

	// Verify persisted
	result, _ := memory.ReadItems(dir)
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 saved item, got %d", len(result.Items))
	}
}

func TestDetectCmd_SaveWithoutYes(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	root := buildCaptureRoot()
	_, _, err := runCmd(root, []string{
		"detect",
		"--input", "/dev/null",
		"--save",
	})
	if err == nil {
		t.Fatal("expected error for --save without --yes")
	}
	if !strings.Contains(err.Error(), "--yes") {
		t.Errorf("expected error about --yes, got: %v", err)
	}
}

func TestDetectCmd_JSONOutput(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"messages": []string{"Do X", "No, actually avoid using globals in production code"},
		"context":  map[string]string{"tool": "editor", "intent": "refactoring"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile, "--json"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if result["detected"] != true {
		t.Errorf("expected detected=true, got: %v", result["detected"])
	}
	if result["source"] != "user_correction" {
		t.Errorf("expected source=user_correction, got: %v", result["source"])
	}
}

func TestDetectCmd_JSONNoDetection(t *testing.T) {
	dir := setupTestRepo(t, nil)
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	input := map[string]interface{}{
		"messages": []string{"Hello"},
		"context":  map[string]string{"tool": "editor", "intent": "greeting"},
	}
	inputData, _ := json.Marshal(input)
	inputFile := filepath.Join(dir, "input.json")
	if err := os.WriteFile(inputFile, inputData, 0o644); err != nil {
		t.Fatal(err)
	}

	root := buildCaptureRoot()
	stdout, _, err := runCmd(root, []string{"detect", "--input", inputFile, "--json"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		t.Fatalf("invalid JSON: %v\n%s", err, stdout)
	}
	if result["detected"] != false {
		t.Errorf("expected detected=false, got: %v", result["detected"])
	}
}
