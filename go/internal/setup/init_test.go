package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitRepo_CreatesDirectories(t *testing.T) {
	dir := t.TempDir()
	// Create a .git dir to simulate a repo
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	result, err := InitRepo(dir, InitOptions{
		SkipHooks:     true,
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

	opts := InitOptions{SkipHooks: true, SkipTemplates: true}
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

	result, err := InitRepo(dir, InitOptions{})
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
	result2, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("second InitRepo failed: %v", err)
	}
	totalTemplates := result2.AgentsInstalled + result2.CommandsInstalled +
		result2.SkillsInstalled + result2.RoleSkillsInstalled + result2.DocsInstalled
	if totalTemplates != 0 {
		t.Errorf("idempotent init installed %d templates, want 0", totalTemplates)
	}
	totalUpdated := result2.AgentsUpdated + result2.CommandsUpdated +
		result2.SkillsUpdated + result2.RoleSkillsUpdated + result2.DocsUpdated
	if totalUpdated != 0 {
		t.Errorf("idempotent init updated %d templates, want 0", totalUpdated)
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

	// Verify all patterns are present
	for _, pattern := range []string{
		"# compound-agent managed",
		".cache/",
		"*.sqlite",
		"*.sqlite-shm",
		"*.sqlite-wal",
		".ca-phase-state.json",
		".ca-failure-state.json",
		".ca-read-state.json",
	} {
		if !strings.Contains(content, pattern) {
			t.Errorf("missing pattern %q in .gitignore", pattern)
		}
	}
}

func TestEnsureGitignore_Idempotent(t *testing.T) {
	dir := t.TempDir()

	// First call creates the file
	if err := EnsureGitignore(dir); err != nil {
		t.Fatalf("first call: %v", err)
	}

	gitignorePath := filepath.Join(dir, ".claude", ".gitignore")
	first, _ := os.ReadFile(gitignorePath)

	// Second call should be a no-op
	if err := EnsureGitignore(dir); err != nil {
		t.Fatalf("second call: %v", err)
	}

	second, _ := os.ReadFile(gitignorePath)
	if string(first) != string(second) {
		t.Error("expected idempotent gitignore, content changed on second call")
	}
}

func TestEnsureGitignore_AppendsToExisting(t *testing.T) {
	dir := t.TempDir()
	gitignoreDir := filepath.Join(dir, ".claude")
	os.MkdirAll(gitignoreDir, 0755)

	// Pre-existing gitignore with unrelated content
	gitignorePath := filepath.Join(gitignoreDir, ".gitignore")
	os.WriteFile(gitignorePath, []byte("node_modules/\n"), 0644)

	if err := EnsureGitignore(dir); err != nil {
		t.Fatalf("EnsureGitignore failed: %v", err)
	}

	data, _ := os.ReadFile(gitignorePath)
	content := string(data)
	if !strings.Contains(content, "node_modules/") {
		t.Error("existing content was lost")
	}
	if !strings.Contains(content, "# compound-agent managed") {
		t.Error("marker not appended")
	}
	if !strings.Contains(content, ".ca-phase-state.json") {
		t.Error("patterns not appended")
	}
}

func TestInitRepo_UpgradesStaleHooks(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	// First install with npx fallback (no binary path)
	_, err := InitRepo(dir, InitOptions{
		SkipTemplates: true,
		BinaryPath:    "", // npx fallback
	})
	if err != nil {
		t.Fatalf("first InitRepo failed: %v", err)
	}

	// Verify hooks use npx
	settingsPath := filepath.Join(dir, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	hooks := settings["hooks"].(map[string]any)
	sessionStart := hooks["SessionStart"].([]any)
	entry := sessionStart[0].(map[string]any)
	hooksList := entry["hooks"].([]any)
	cmd := hooksList[0].(map[string]any)["command"].(string)
	if !strings.Contains(cmd, "npx ca") {
		t.Fatalf("expected npx hooks after first install, got: %s", cmd)
	}

	// Second init with binary path → should upgrade stale hooks
	result, err := InitRepo(dir, InitOptions{
		SkipTemplates: true,
		BinaryPath:    "/usr/local/bin/ca",
	})
	if err != nil {
		t.Fatalf("second InitRepo failed: %v", err)
	}
	if !result.HooksUpgraded {
		t.Error("expected HooksUpgraded=true")
	}

	// Verify hooks now use binary path
	settings, err = ReadClaudeSettings(settingsPath)
	if err != nil {
		t.Fatalf("read settings after upgrade: %v", err)
	}
	hooks = settings["hooks"].(map[string]any)
	sessionStart = hooks["SessionStart"].([]any)
	entry = sessionStart[0].(map[string]any)
	hooksList = entry["hooks"].([]any)
	cmd = hooksList[0].(map[string]any)["command"].(string)
	if strings.Contains(cmd, "npx") {
		t.Errorf("hooks still use npx after upgrade: %s", cmd)
	}
	if !strings.Contains(cmd, "/usr/local/bin/ca") {
		t.Errorf("hooks should use binary path, got: %s", cmd)
	}
}

func TestInitRepo_UpdatesStalePlugin(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	// First install
	_, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("first InitRepo failed: %v", err)
	}

	// Manually write stale plugin.json
	pluginPath := filepath.Join(dir, ".claude", "plugin.json")
	if err := os.WriteFile(pluginPath, []byte(`{"name":"compound-agent","version":"1.8.0"}`), 0644); err != nil {
		t.Fatalf("write stale plugin.json: %v", err)
	}

	// Second init should update plugin version
	result, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("second InitRepo failed: %v", err)
	}
	if !result.PluginUpdated {
		t.Error("expected PluginUpdated=true")
	}
}

func TestInitRepo_UpdatesStaleTemplates(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	// First install
	result, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("first InitRepo: %v", err)
	}
	if result.AgentsInstalled == 0 {
		t.Fatal("expected agent templates installed")
	}

	// Modify an agent template to simulate staleness
	agentsDir := filepath.Join(dir, ".claude", "agents", "compound")
	entries, err := os.ReadDir(agentsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	stalePath := filepath.Join(agentsDir, entries[0].Name())
	if err := os.WriteFile(stalePath, []byte("# stale\n"), 0644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	// Re-init should detect and update stale templates
	result2, err := InitRepo(dir, InitOptions{SkipHooks: true})
	if err != nil {
		t.Fatalf("second InitRepo: %v", err)
	}
	if result2.AgentsUpdated == 0 {
		t.Error("expected AgentsUpdated > 0")
	}

	// Verify content was restored
	content, err := os.ReadFile(stalePath)
	if err != nil {
		t.Fatalf("read restored: %v", err)
	}
	if string(content) == "# stale\n" {
		t.Error("stale content not overwritten")
	}
}

func TestInitRepo_DirsCreatedAccurate(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	opts := InitOptions{SkipHooks: true, SkipTemplates: true}

	// First run should create dirs
	result1, err := InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("first InitRepo: %v", err)
	}
	if len(result1.DirsCreated) == 0 {
		t.Error("expected dirs created on first run")
	}

	// Second run should report 0 dirs created
	result2, err := InitRepo(dir, opts)
	if err != nil {
		t.Fatalf("second InitRepo: %v", err)
	}
	if len(result2.DirsCreated) != 0 {
		t.Errorf("expected 0 dirs created on re-run, got %d", len(result2.DirsCreated))
	}
}
