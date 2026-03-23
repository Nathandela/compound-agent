//go:build integration

package cli_test

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// binaryPath is set once in TestMain by building the ca binary.
var binaryPath string

// goRoot is the absolute path to the go/ directory.
var goRoot string

func TestMain(m *testing.M) {
	// Resolve goRoot relative to this test file's package location.
	// This file is at go/internal/cli/, so goRoot is two levels up (go/).
	wd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "getwd: %v\n", err)
		os.Exit(1)
	}
	goRoot = filepath.Join(wd, "..", "..")
	// Normalize in case of symlinks
	goRoot, err = filepath.Abs(goRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "abs: %v\n", err)
		os.Exit(1)
	}

	tmpDir, err := os.MkdirTemp("", "ca-e2e-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "mktemp: %v\n", err)
		os.Exit(1)
	}

	binaryPath = filepath.Join(tmpDir, "ca")
	cmd := exec.Command("go", "build", "-tags", "sqlite_fts5", "-o", binaryPath, "./cmd/ca")
	cmd.Dir = goRoot
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "build failed: %v\n", err)
		os.RemoveAll(tmpDir)
		os.Exit(1)
	}

	code := m.Run()
	os.RemoveAll(tmpDir)
	os.Exit(code)
}

// --- helpers ---

// runCA executes the compiled binary with the given args, setting
// COMPOUND_AGENT_ROOT to repoDir so the CLI finds lessons there.
func runCA(t *testing.T, repoDir string, args ...string) (string, error) {
	t.Helper()
	cmd := exec.Command(binaryPath, args...)
	cmd.Dir = repoDir
	cmd.Env = append(os.Environ(), "COMPOUND_AGENT_ROOT="+repoDir)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// setupTestRepo creates a temp directory with .claude/lessons/ structure.
func setupTestRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	if err := os.MkdirAll(lessonsDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	return dir
}

// writeTestLessons writes JSONL lesson entries to .claude/lessons/index.jsonl.
func writeTestLessons(t *testing.T, repoDir string, lessons []map[string]any) {
	t.Helper()
	var lines []string
	for _, lesson := range lessons {
		data, err := json.Marshal(lesson)
		if err != nil {
			t.Fatalf("marshal lesson: %v", err)
		}
		lines = append(lines, string(data))
	}
	content := strings.Join(lines, "\n") + "\n"
	path := filepath.Join(repoDir, ".claude", "lessons", "index.jsonl")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write index.jsonl: %v", err)
	}
}

// makeLesson returns a minimal valid lesson map.
func makeLesson(id, insight string, opts ...func(map[string]any)) map[string]any {
	m := map[string]any{
		"id":         id,
		"type":       "lesson",
		"trigger":    "test trigger",
		"insight":    insight,
		"tags":       []string{"go"},
		"source":     "manual",
		"context":    map[string]string{"tool": "cli", "intent": "test"},
		"created":    "2026-03-15T10:00:00Z",
		"confirmed":  true,
		"supersedes": []string{},
		"related":    []string{},
	}
	for _, opt := range opts {
		opt(m)
	}
	return m
}

// withSeverity sets severity on a lesson map.
func withSeverity(sev string) func(map[string]any) {
	return func(m map[string]any) { m["severity"] = sev }
}

// --- tests ---

func TestE2E_HelpOutput(t *testing.T) {
	dir := t.TempDir()
	out, err := runCA(t, dir, "--help")
	if err != nil {
		t.Fatalf("ca --help failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "compound-agent") {
		t.Errorf("expected help to mention compound-agent, got: %s", out)
	}
	if !strings.Contains(out, "search") {
		t.Errorf("expected help to list search command, got: %s", out)
	}
	if !strings.Contains(out, "learn") {
		t.Errorf("expected help to list learn command, got: %s", out)
	}
}

func TestE2E_LearnAndSearch(t *testing.T) {
	repo := setupTestRepo(t)

	// Learn a lesson via CLI
	out, err := runCA(t, repo, "learn", "Always validate user input before processing")
	if err != nil {
		t.Fatalf("learn failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Learned:") {
		t.Errorf("expected 'Learned:' confirmation, got: %s", out)
	}
	if !strings.Contains(out, "Always validate user input before processing") {
		t.Errorf("expected insight echoed, got: %s", out)
	}

	// Search for it
	out, err = runCA(t, repo, "search", "validate input")
	if err != nil {
		t.Fatalf("search failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Always validate user input before processing") {
		t.Errorf("expected to find learned lesson via search, got: %s", out)
	}
	if !strings.Contains(out, "Found 1 lesson(s)") {
		t.Errorf("expected exactly 1 result, got: %s", out)
	}
}

func TestE2E_ListEmpty(t *testing.T) {
	repo := setupTestRepo(t)

	out, err := runCA(t, repo, "list")
	if err != nil {
		t.Fatalf("list failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "No lessons found") {
		t.Errorf("expected 'No lessons found' for empty repo, got: %s", out)
	}
}

func TestE2E_ListWithLessons(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Check error returns in Go"),
		makeLesson("L002", "Use context for cancellation"),
	})

	out, err := runCA(t, repo, "list")
	if err != nil {
		t.Fatalf("list failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Showing 2 of 2") {
		t.Errorf("expected 2 items shown, got: %s", out)
	}
	if !strings.Contains(out, "Check error returns in Go") {
		t.Errorf("expected first lesson in output, got: %s", out)
	}
	if !strings.Contains(out, "Use context for cancellation") {
		t.Errorf("expected second lesson in output, got: %s", out)
	}
}

func TestE2E_LoadSession(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Never use string concat for SQL queries", withSeverity("high")),
		makeLesson("L002", "Low severity item", withSeverity("low")),
		makeLesson("L003", "Always check nil pointers", withSeverity("high")),
	})

	out, err := runCA(t, repo, "load-session")
	if err != nil {
		t.Fatalf("load-session failed: %v\nOutput: %s", err, out)
	}

	// Should include high-severity lessons
	if !strings.Contains(out, "Never use string concat for SQL queries") {
		t.Errorf("expected high-severity lesson in session output, got: %s", out)
	}
	if !strings.Contains(out, "Always check nil pointers") {
		t.Errorf("expected second high-severity lesson in session output, got: %s", out)
	}
	// Low-severity should NOT appear
	if strings.Contains(out, "Low severity item") {
		t.Errorf("low-severity lesson should not appear in session output, got: %s", out)
	}
	// Should have session header
	if !strings.Contains(out, "Lessons from Past Sessions") {
		t.Errorf("expected session header, got: %s", out)
	}
}

func TestE2E_LoadSessionJSON(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Always handle errors", withSeverity("high")),
	})

	out, err := runCA(t, repo, "load-session", "--json")
	if err != nil {
		t.Fatalf("load-session --json failed: %v\nOutput: %s", err, out)
	}

	var parsed struct {
		Lessons    []map[string]any `json:"lessons"`
		Count      int              `json:"count"`
		TotalCount int              `json:"totalCount"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &parsed); err != nil {
		t.Fatalf("invalid JSON output: %v\nRaw: %s", err, out)
	}
	if parsed.Count != 1 {
		t.Errorf("expected count=1, got %d", parsed.Count)
	}
	if parsed.TotalCount != 1 {
		t.Errorf("expected totalCount=1, got %d", parsed.TotalCount)
	}
}

func TestE2E_PrimeHookCommandWritesToStdout(t *testing.T) {
	repo := setupTestRepo(t)
	cmd := exec.Command("sh", "-c", fmt.Sprintf("'%s' prime 2>/dev/null || true", binaryPath))
	cmd.Dir = repo
	cmd.Env = append(os.Environ(), "COMPOUND_AGENT_ROOT="+repo)

	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("hook-style prime command failed: %v", err)
	}

	stdout := string(out)
	if !strings.Contains(stdout, "Compound Agent Active") {
		t.Fatalf("expected prime output on stdout, got: %q", stdout)
	}
	if !strings.Contains(stdout, "npx ca search") {
		t.Errorf("expected CLI guidance in stdout, got: %q", stdout)
	}
}

func TestE2E_MigrateFromTS_DryRun(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Test lesson for migration"),
		makeLesson("L002", "Another test lesson"),
	})

	// Create settings.json with npx-based hooks
	settings := map[string]any{
		"hooks": map[string]any{
			"SessionStart": []any{
				map[string]any{
					"matcher": "",
					"hooks": []any{
						map[string]any{
							"type":    "command",
							"command": "npx ca prime 2>/dev/null || true",
						},
					},
				},
			},
			"UserPromptSubmit": []any{
				map[string]any{
					"matcher": "",
					"hooks": []any{
						map[string]any{
							"type":    "command",
							"command": "npx ca hooks run user-prompt 2>/dev/null || true",
						},
					},
				},
			},
		},
	}
	settingsData, _ := json.MarshalIndent(settings, "", "  ")
	os.WriteFile(filepath.Join(repo, ".claude", "settings.json"), settingsData, 0644)

	out, err := runCA(t, repo, "migrate-from-ts", "--repo-root", repo, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts --dry-run failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "Migration Report") {
		t.Errorf("expected Migration Report header, got: %s", out)
	}
	if !strings.Contains(out, "2 lesson(s)") {
		t.Errorf("expected 2 lessons detected, got: %s", out)
	}
	if !strings.Contains(out, "npx") {
		t.Errorf("expected npx hooks detected, got: %s", out)
	}
	if !strings.Contains(out, "dry-run") {
		t.Errorf("expected dry-run notice, got: %s", out)
	}

	// Verify settings.json was NOT modified
	afterData, _ := os.ReadFile(filepath.Join(repo, ".claude", "settings.json"))
	if string(afterData) != string(settingsData) {
		t.Error("dry-run should not modify settings.json")
	}
}

func TestE2E_MigrateFromTS_Execute(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Migration test lesson"),
	})

	// Create settings.json with npx-based hooks
	settings := map[string]any{
		"hooks": map[string]any{
			"SessionStart": []any{
				map[string]any{
					"matcher": "",
					"hooks": []any{
						map[string]any{
							"type":    "command",
							"command": "npx ca prime 2>/dev/null || true",
						},
					},
				},
			},
		},
	}
	settingsData, _ := json.MarshalIndent(settings, "", "  ")
	os.WriteFile(filepath.Join(repo, ".claude", "settings.json"), settingsData, 0644)

	out, err := runCA(t, repo, "migrate-from-ts", "--repo-root", repo, "--binary-path", "/usr/local/bin/ca")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "Migration complete") {
		t.Errorf("expected migration complete, got: %s", out)
	}

	// Verify settings.json was updated
	updatedData, err := os.ReadFile(filepath.Join(repo, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	settingsStr := string(updatedData)
	if strings.Contains(settingsStr, "npx ca") {
		t.Errorf("settings should no longer contain 'npx ca', got: %s", settingsStr)
	}
	if !strings.Contains(settingsStr, "/usr/local/bin/ca") {
		t.Errorf("settings should reference Go binary path, got: %s", settingsStr)
	}
}

func TestE2E_LearnWithTags(t *testing.T) {
	repo := setupTestRepo(t)

	out, err := runCA(t, repo, "learn", "Use structured logging", "--tags", "logging,observability", "--severity", "high")
	if err != nil {
		t.Fatalf("learn with tags failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Learned:") {
		t.Errorf("expected confirmation, got: %s", out)
	}

	// Verify by listing
	out, err = runCA(t, repo, "list")
	if err != nil {
		t.Fatalf("list failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Use structured logging") {
		t.Errorf("expected lesson in list, got: %s", out)
	}
	if !strings.Contains(out, "logging") {
		t.Errorf("expected tag in list output, got: %s", out)
	}
}

func TestE2E_ShowLesson(t *testing.T) {
	repo := setupTestRepo(t)

	// Learn a lesson, capture the ID from output
	out, err := runCA(t, repo, "learn", "Always close database connections")
	if err != nil {
		t.Fatalf("learn failed: %v\nOutput: %s", err, out)
	}

	// Extract ID from "  ID: Lxxxxxxxxxxxxxxxx"
	var id string
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "ID: ") {
			id = strings.TrimPrefix(line, "ID: ")
			break
		}
	}
	if id == "" {
		t.Fatalf("could not extract lesson ID from output: %s", out)
	}

	// Show it
	out, err = runCA(t, repo, "show", id)
	if err != nil {
		t.Fatalf("show failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Always close database connections") {
		t.Errorf("expected insight in show output, got: %s", out)
	}
	if !strings.Contains(out, id) {
		t.Errorf("expected ID in show output, got: %s", out)
	}
}

func TestE2E_DeleteLesson(t *testing.T) {
	repo := setupTestRepo(t)
	writeTestLessons(t, repo, []map[string]any{
		makeLesson("L001", "Lesson to delete"),
		makeLesson("L002", "Lesson to keep"),
	})

	out, err := runCA(t, repo, "delete", "L001")
	if err != nil {
		t.Fatalf("delete failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "Deleted 1 lesson(s)") {
		t.Errorf("expected deletion confirmation, got: %s", out)
	}

	// Verify L001 is gone from list
	out, err = runCA(t, repo, "list")
	if err != nil {
		t.Fatalf("list failed: %v\nOutput: %s", err, out)
	}
	if strings.Contains(out, "Lesson to delete") {
		t.Errorf("deleted lesson should not appear in list, got: %s", out)
	}
	if !strings.Contains(out, "Lesson to keep") {
		t.Errorf("kept lesson should still be in list, got: %s", out)
	}
}

func TestE2E_AboutCommand(t *testing.T) {
	dir := t.TempDir()
	out, err := runCA(t, dir, "about")
	if err != nil {
		t.Fatalf("about failed: %v\nOutput: %s", err, out)
	}
	if !strings.Contains(out, "compound-agent") {
		t.Errorf("expected compound-agent in about output, got: %s", out)
	}
	if !strings.Contains(out, "(go)") {
		t.Errorf("expected (go) in about output, got: %s", out)
	}
}
