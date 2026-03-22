package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInitRepo_CreatesDirectories(t *testing.T) {
	dir := t.TempDir()
	// Create a .git dir to simulate a repo
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		SkipHooks:     true,
		SkipModel:     true,
		SkipTemplates: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}

	// Check .claude/ directory exists
	if _, err := os.Stat(filepath.Join(dir, ".claude")); os.IsNotExist(err) {
		t.Error("expected .claude/ directory to be created")
	}

	// Check lessons directory exists
	lessonsDir := filepath.Join(dir, ".claude", "lessons")
	if _, err := os.Stat(lessonsDir); os.IsNotExist(err) {
		t.Error("expected .claude/lessons/ directory to be created")
	}

	// Check index.jsonl exists
	indexFile := filepath.Join(lessonsDir, "index.jsonl")
	if _, err := os.Stat(indexFile); os.IsNotExist(err) {
		t.Error("expected index.jsonl to be created")
	}

	// Check cache directory exists
	cacheDir := filepath.Join(dir, ".claude", ".cache")
	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		t.Error("expected .claude/.cache/ directory to be created")
	}

	if !result.Success {
		t.Error("expected success=true")
	}
}

func TestInitRepo_Idempotent(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	opts := InitOptions{SkipHooks: true, SkipModel: true, SkipTemplates: true}
	_, err := InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("first InitRepo failed: %v", err)
	}

	// Write something to index.jsonl
	indexFile := filepath.Join(dir, ".claude", "lessons", "index.jsonl")
	os.WriteFile(indexFile, []byte(`{"id":"test"}`+"\n"), 0644)

	// Second run should not overwrite existing files
	_, err = InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("second InitRepo failed: %v", err)
	}

	data, _ := os.ReadFile(indexFile)
	if string(data) != `{"id":"test"}`+"\n" {
		t.Error("expected existing index.jsonl to be preserved")
	}
}

func TestInitRepo_InstallsHooks(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		SkipModel: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}

	// Check that settings.json was created with hooks
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		t.Fatalf("failed to read settings: %v", err)
	}

	if !HasAllHooks(settings) {
		t.Error("expected all hooks to be installed")
	}

	if !result.HooksInstalled {
		t.Error("expected HooksInstalled=true")
	}
}

func TestInitRepo_InstallsTemplates(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		SkipHooks: true,
		SkipModel: true,
	})
	if err != nil {
		t.Fatalf("InitRepo failed: %v", err)
	}

	if result.AgentsInstalled == 0 {
		t.Error("expected agent templates to be installed")
	}
	if result.CommandsInstalled == 0 {
		t.Error("expected command templates to be installed")
	}
	if result.SkillsInstalled == 0 {
		t.Error("expected phase skills to be installed")
	}
	if result.RoleSkillsInstalled == 0 {
		t.Error("expected agent role skills to be installed")
	}
	if result.DocsInstalled == 0 {
		t.Error("expected doc templates to be installed")
	}
	if !result.AgentsMdUpdated {
		t.Error("expected AGENTS.md to be updated")
	}
	if !result.ClaudeMdUpdated {
		t.Error("expected CLAUDE.md to be updated")
	}

	// Verify a sample file exists
	repoAnalyst := filepath.Join(dir, ".claude", "agents", "compound", "repo-analyst.md")
	if _, err := os.Stat(repoAnalyst); os.IsNotExist(err) {
		t.Error("missing repo-analyst.md agent template")
	}

	// Verify idempotency on second run
	result2, err := InitRepo(dir, InitOptions{SkipHooks: true, SkipModel: true})
	if err != nil {
		t.Fatalf("second InitRepo failed: %v", err)
	}
	totalTemplates := result2.AgentsInstalled + result2.CommandsInstalled +
		result2.SkillsInstalled + result2.RoleSkillsInstalled + result2.DocsInstalled
	if totalTemplates != 0 {
		t.Errorf("idempotent init installed %d templates, want 0", totalTemplates)
	}
	if result2.AgentsMdUpdated {
		t.Error("expected AGENTS.md not to be updated on second call")
	}
}

func TestEnsureGitignore(t *testing.T) {
	dir := t.TempDir()

	if err := EnsureGitignore(dir); err != nil {
		t.Fatalf("EnsureGitignore failed: %v", err)
	}

	gitignorePath := filepath.Join(dir, ".claude", ".gitignore")
	data, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("failed to read .gitignore: %v", err)
	}

	content := string(data)
	if content == "" {
		t.Error("expected non-empty .gitignore")
	}
}
