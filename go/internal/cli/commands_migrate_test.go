package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// validJSONLLine returns a minimal valid lesson JSONL line.
func validJSONLLine(id, insight string) string {
	item := map[string]any{
		"id":         id,
		"type":       "lesson",
		"trigger":    "test trigger",
		"insight":    insight,
		"tags":       []string{"go"},
		"source":     "manual",
		"context":    map[string]string{"tool": "", "intent": ""},
		"created":    "2026-03-15T10:00:00Z",
		"confirmed":  false,
		"supersedes": []string{},
		"related":    []string{},
	}
	data, _ := json.Marshal(item)
	return string(data)
}

func TestMigrateDetectsExistingInstallation(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)

	// Write valid JSONL
	content := validJSONLLine("L001", "Always check errors") + "\n"
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(content), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "1 lesson(s)") {
		t.Errorf("expected lesson count in output, got: %s", out)
	}
}

func TestMigrateValidatesJSONL(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)

	// Write JSONL with one valid and one invalid line
	content := validJSONLLine("L001", "Check errors") + "\n" +
		"not valid json\n" +
		validJSONLLine("L002", "Use context") + "\n"
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(content), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "2 lesson(s)") {
		t.Errorf("expected 2 valid lessons counted, got: %s", out)
	}
	if !strings.Contains(out, "1 invalid") {
		t.Errorf("expected 1 invalid line reported, got: %s", out)
	}
}

func TestMigrateCountsLessons(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)

	lines := ""
	for i := 0; i < 5; i++ {
		lines += validJSONLLine("L00"+string(rune('1'+i)), "Lesson "+string(rune('A'+i))) + "\n"
	}
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(lines), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "5 lesson(s)") {
		t.Errorf("expected 5 lessons, got: %s", out)
	}
}

func TestMigrateUpdatesHookPaths(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(validJSONLLine("L001", "test")+"\n"), 0644)

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
	os.WriteFile(filepath.Join(dir, ".claude", "settings.json"), settingsData, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--binary-path", "/usr/local/bin/ca")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	// Verify settings.json was updated
	updatedData, err := os.ReadFile(filepath.Join(dir, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read updated settings: %v", err)
	}

	settingsStr := string(updatedData)
	if strings.Contains(settingsStr, "npx ca") {
		t.Errorf("expected npx references to be replaced, settings still contains 'npx ca': %s", settingsStr)
	}
	if !strings.Contains(settingsStr, "/usr/local/bin/ca") {
		t.Errorf("expected Go binary path in settings, got: %s", settingsStr)
	}
}

func TestMigrateHandlesMissingFiles(t *testing.T) {
	dir := t.TempDir()
	// No .claude directory at all

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts should not error on missing files: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "No TS compound-agent installation found") {
		t.Errorf("expected 'not found' message, got: %s", out)
	}
}

func TestMigratePreservesExistingData(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)

	originalContent := validJSONLLine("L001", "Important lesson") + "\n" +
		validJSONLLine("L002", "Another lesson") + "\n"
	indexPath := filepath.Join(lessonsDir, "index.jsonl")
	os.WriteFile(indexPath, []byte(originalContent), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	_, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--binary-path", "/usr/local/bin/ca")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v", err)
	}

	// Verify JSONL file was NOT modified
	afterContent, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("read index.jsonl after migration: %v", err)
	}
	if string(afterContent) != originalContent {
		t.Errorf("index.jsonl was modified during migration.\nBefore: %s\nAfter: %s", originalContent, string(afterContent))
	}
}

func TestMigrateDryRunDoesNotModify(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(validJSONLLine("L001", "test")+"\n"), 0644)

	// Create settings.json with npx hooks
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
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	os.WriteFile(settingsPath, settingsData, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts --dry-run failed: %v\nOutput: %s", err, out)
	}

	// Settings should be unchanged
	afterData, _ := os.ReadFile(settingsPath)
	if string(afterData) != string(settingsData) {
		t.Error("dry-run should not modify settings.json")
	}
}

func TestMigrateDetectsNpxHooks(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(validJSONLLine("L001", "test")+"\n"), 0644)

	// Settings with npx hooks
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
	os.WriteFile(filepath.Join(dir, ".claude", "settings.json"), settingsData, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "npx") || !strings.Contains(out, "hook") {
		t.Errorf("expected npx hook detection in output, got: %s", out)
	}
}

func TestMigrateEmptyJSONL(t *testing.T) {
	dir := t.TempDir()
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	os.MkdirAll(lessonsDir, 0755)
	os.WriteFile(filepath.Join(lessonsDir, "index.jsonl"), []byte(""), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(migrateFromTSCmd())

	out, err := executeCommand(root, "migrate-from-ts", "--repo-root", dir, "--dry-run")
	if err != nil {
		t.Fatalf("migrate-from-ts failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "0 lesson(s)") {
		t.Errorf("expected 0 lessons for empty file, got: %s", out)
	}
}
