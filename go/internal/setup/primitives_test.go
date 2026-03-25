package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestInstallAgentTemplates(t *testing.T) {
	dir := t.TempDir()

	// First install creates files
	n, u, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify files exist
	agentsDir := filepath.Join(dir, ".claude", "agents", "compound")
	entries, err := os.ReadDir(agentsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("no agent files created")
	}

	// Verify idempotency: second install creates/updates nothing
	n2, u2, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates (2nd): %v", err)
	}
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallWorkflowCommands(t *testing.T) {
	dir := t.TempDir()

	n, u, err := InstallWorkflowCommands(dir)
	if err != nil {
		t.Fatalf("InstallWorkflowCommands: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify files exist
	cmdsDir := filepath.Join(dir, ".claude", "commands", "compound")
	entries, _ := os.ReadDir(cmdsDir)
	if len(entries) == 0 {
		t.Fatal("no command files created")
	}

	// Verify idempotency
	n2, u2, _ := InstallWorkflowCommands(dir)
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallPhaseSkills(t *testing.T) {
	dir := t.TempDir()

	n, u, err := InstallPhaseSkills(dir, StackInfo{})
	if err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify SKILL.md files exist
	specDevSkill := filepath.Join(dir, ".claude", "skills", "compound", "spec-dev", "SKILL.md")
	if _, err := os.Stat(specDevSkill); err != nil {
		t.Errorf("missing spec-dev/SKILL.md: %v", err)
	}

	// Verify reference files exist
	specGuide := filepath.Join(dir, ".claude", "skills", "compound", "spec-dev", "references", "spec-guide.md")
	if _, err := os.Stat(specGuide); err != nil {
		t.Errorf("missing spec-dev/references/spec-guide.md: %v", err)
	}

	// Verify idempotency
	n2, u2, _ := InstallPhaseSkills(dir, StackInfo{})
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallAgentRoleSkills(t *testing.T) {
	dir := t.TempDir()

	n, u, err := InstallAgentRoleSkills(dir)
	if err != nil {
		t.Fatalf("InstallAgentRoleSkills: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify a known role exists
	repoAnalyst := filepath.Join(dir, ".claude", "skills", "compound", "agents", "repo-analyst", "SKILL.md")
	if _, err := os.Stat(repoAnalyst); err != nil {
		t.Errorf("missing repo-analyst/SKILL.md: %v", err)
	}

	// Verify idempotency
	n2, u2, _ := InstallAgentRoleSkills(dir)
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallDocTemplates(t *testing.T) {
	dir := t.TempDir()

	n, u, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify README.md was written with version substituted
	readmePath := filepath.Join(dir, "docs", "compound", "README.md")
	content, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(content), "{{VERSION}}") {
		t.Error("README.md still has {{VERSION}} placeholder")
	}
	if !strings.Contains(string(content), "1.0.0") {
		t.Error("README.md missing version 1.0.0")
	}

	// Verify idempotency
	n2, u2, _ := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallResearchDocs(t *testing.T) {
	dir := t.TempDir()

	n, u, err := InstallResearchDocs(dir)
	if err != nil {
		t.Fatalf("InstallResearchDocs: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}
	if u != 0 {
		t.Errorf("expected 0 updated on first install, got %d", u)
	}

	// Verify nested research file exists
	overviewPath := filepath.Join(dir, "docs", "compound", "research", "security", "overview.md")
	if _, err := os.Stat(overviewPath); err != nil {
		t.Errorf("missing security/overview.md: %v", err)
	}

	// Verify index.md at root
	indexPath := filepath.Join(dir, "docs", "compound", "research", "index.md")
	content, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("ReadFile index.md: %v", err)
	}
	if len(content) == 0 {
		t.Error("index.md is empty")
	}

	// Verify idempotency: second install creates/updates nothing
	n2, u2, err := InstallResearchDocs(dir)
	if err != nil {
		t.Fatalf("InstallResearchDocs (2nd): %v", err)
	}
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
	if u2 != 0 {
		t.Errorf("idempotent install updated %d files, want 0", u2)
	}
}

func TestInstallResearchDocs_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	// First install
	_, _, err := InstallResearchDocs(dir)
	if err != nil {
		t.Fatalf("InstallResearchDocs: %v", err)
	}

	// Corrupt a file to simulate stale content
	overviewPath := filepath.Join(dir, "docs", "compound", "research", "security", "overview.md")
	if err := os.WriteFile(overviewPath, []byte("stale content"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	// Re-install should update
	_, u, err := InstallResearchDocs(dir)
	if err != nil {
		t.Fatalf("InstallResearchDocs (2nd): %v", err)
	}
	if u == 0 {
		t.Error("expected stale file to be updated")
	}
}

func TestUpdateAgentsMd(t *testing.T) {
	dir := t.TempDir()

	// Creates new AGENTS.md when it doesn't exist
	created, err := UpdateAgentsMd(dir)
	if err != nil {
		t.Fatalf("UpdateAgentsMd: %v", err)
	}
	if !created {
		t.Error("expected AGENTS.md to be created")
	}

	content, _ := os.ReadFile(filepath.Join(dir, "AGENTS.md"))
	if !strings.Contains(string(content), "Compound Agent Integration") {
		t.Error("AGENTS.md missing section header")
	}

	// Idempotent: second call doesn't modify
	created2, err := UpdateAgentsMd(dir)
	if err != nil {
		t.Fatalf("UpdateAgentsMd (2nd): %v", err)
	}
	if created2 {
		t.Error("expected no update on second call")
	}
}

func TestUpdateAgentsMdAppends(t *testing.T) {
	dir := t.TempDir()
	agentsPath := filepath.Join(dir, "AGENTS.md")

	// Create existing AGENTS.md without our section
	os.WriteFile(agentsPath, []byte("# Existing Agents\n\nSome content.\n"), 0644)

	created, err := UpdateAgentsMd(dir)
	if err != nil {
		t.Fatalf("UpdateAgentsMd: %v", err)
	}
	if !created {
		t.Error("expected section to be appended")
	}

	content, _ := os.ReadFile(agentsPath)
	if !strings.Contains(string(content), "Existing Agents") {
		t.Error("original content lost")
	}
	if !strings.Contains(string(content), "Compound Agent Integration") {
		t.Error("section not appended")
	}
}

func TestEnsureClaudeMdReference(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)

	// Creates new CLAUDE.md when it doesn't exist
	created, err := EnsureClaudeMdReference(dir)
	if err != nil {
		t.Fatalf("EnsureClaudeMdReference: %v", err)
	}
	if !created {
		t.Error("expected CLAUDE.md to be created")
	}

	content, _ := os.ReadFile(filepath.Join(dir, ".claude", "CLAUDE.md"))
	if !strings.Contains(string(content), "Compound Agent") {
		t.Error("CLAUDE.md missing reference")
	}

	// Idempotent
	created2, _ := EnsureClaudeMdReference(dir)
	if created2 {
		t.Error("expected no update on second call")
	}
}

func TestEnsureClaudeMdReferenceAppends(t *testing.T) {
	dir := t.TempDir()
	claudeMd := filepath.Join(dir, ".claude", "CLAUDE.md")
	os.MkdirAll(filepath.Join(dir, ".claude"), 0755)
	os.WriteFile(claudeMd, []byte("# My Project\n\nExisting content.\n"), 0644)

	created, err := EnsureClaudeMdReference(dir)
	if err != nil {
		t.Fatalf("EnsureClaudeMdReference: %v", err)
	}
	if !created {
		t.Error("expected reference to be appended")
	}

	content, _ := os.ReadFile(claudeMd)
	if !strings.Contains(string(content), "Existing content") {
		t.Error("original content lost")
	}
	if !strings.Contains(string(content), "Compound Agent") {
		t.Error("reference not appended")
	}
}

func TestCreatePluginManifest(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".claude"), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	created, updated, err := CreatePluginManifest(dir, "1.2.3")
	if err != nil {
		t.Fatalf("CreatePluginManifest: %v", err)
	}
	if !created {
		t.Error("expected plugin.json to be created")
	}
	if updated {
		t.Error("expected updated=false on first create")
	}

	content, err := os.ReadFile(filepath.Join(dir, ".claude", "plugin.json"))
	if err != nil {
		t.Fatalf("read plugin.json: %v", err)
	}
	if !strings.Contains(string(content), "1.2.3") {
		t.Error("plugin.json missing version")
	}
	if strings.Contains(string(content), "{{VERSION}}") {
		t.Error("plugin.json still has VERSION placeholder")
	}

	// Idempotent: same version → no change
	created2, updated2, err := CreatePluginManifest(dir, "1.2.3")
	if err != nil {
		t.Fatalf("CreatePluginManifest idempotent: %v", err)
	}
	if created2 {
		t.Error("expected created=false on same-version call")
	}
	if updated2 {
		t.Error("expected updated=false on same-version call")
	}
}

func TestInstallAgentTemplates_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	// First install
	created, updated, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates: %v", err)
	}
	if created == 0 {
		t.Fatal("expected files to be created")
	}
	if updated != 0 {
		t.Errorf("expected 0 updated on first install, got %d", updated)
	}

	// Modify one file to simulate stale content
	agentsDir := filepath.Join(dir, ".claude", "agents", "compound")
	entries, err := os.ReadDir(agentsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	stalePath := filepath.Join(agentsDir, entries[0].Name())
	if err := os.WriteFile(stalePath, []byte("# stale content\n"), 0644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}

	// Re-install should detect stale content and update
	created2, updated2, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates (update): %v", err)
	}
	if created2 != 0 {
		t.Errorf("expected 0 created on re-install, got %d", created2)
	}
	if updated2 == 0 {
		t.Error("expected at least 1 updated file")
	}

	// Verify content was restored
	content, err := os.ReadFile(stalePath)
	if err != nil {
		t.Fatalf("read restored file: %v", err)
	}
	if string(content) == "# stale content\n" {
		t.Error("stale content was not overwritten")
	}
}

func TestInstallWorkflowCommands_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	created, _, err := InstallWorkflowCommands(dir)
	if err != nil {
		t.Fatalf("InstallWorkflowCommands: %v", err)
	}
	if created == 0 {
		t.Fatal("expected files to be created")
	}

	// Modify one file
	cmdsDir := filepath.Join(dir, ".claude", "commands", "compound")
	entries, err := os.ReadDir(cmdsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	stalePath := filepath.Join(cmdsDir, entries[0].Name())
	if err := os.WriteFile(stalePath, []byte("# stale\n"), 0644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	_, updated, err := InstallWorkflowCommands(dir)
	if err != nil {
		t.Fatalf("InstallWorkflowCommands (update): %v", err)
	}
	if updated == 0 {
		t.Error("expected at least 1 updated file")
	}
}

func TestInstallPhaseSkills_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	created, _, err := InstallPhaseSkills(dir, StackInfo{})
	if err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}
	if created == 0 {
		t.Fatal("expected files to be created")
	}

	// Modify a SKILL.md file
	specDevSkill := filepath.Join(dir, ".claude", "skills", "compound", "spec-dev", "SKILL.md")
	if err := os.WriteFile(specDevSkill, []byte("# stale skill\n"), 0644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	_, updated, err := InstallPhaseSkills(dir, StackInfo{})
	if err != nil {
		t.Fatalf("InstallPhaseSkills (update): %v", err)
	}
	if updated == 0 {
		t.Error("expected at least 1 updated skill")
	}

	content, err := os.ReadFile(specDevSkill)
	if err != nil {
		t.Fatalf("read restored: %v", err)
	}
	if string(content) == "# stale skill\n" {
		t.Error("stale skill was not overwritten")
	}
}

func TestInstallPhaseSkills_SubstitutesQualityGates(t *testing.T) {
	dir := t.TempDir()
	stack := StackInfo{TestCmd: "go test ./...", LintCmd: "golangci-lint run ./..."}

	_, _, err := InstallPhaseSkills(dir, stack)
	if err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}

	// Check that a skill with quality gate placeholders got them substituted
	workSkill := filepath.Join(dir, ".claude", "skills", "compound", "work", "SKILL.md")
	content, err := os.ReadFile(workSkill)
	if err != nil {
		t.Fatalf("read work/SKILL.md: %v", err)
	}
	if strings.Contains(string(content), "{{QUALITY_GATE_TEST}}") {
		t.Error("work/SKILL.md still has {{QUALITY_GATE_TEST}} placeholder")
	}
	if strings.Contains(string(content), "{{QUALITY_GATE_LINT}}") {
		t.Error("work/SKILL.md still has {{QUALITY_GATE_LINT}} placeholder")
	}
	if !strings.Contains(string(content), "go test ./...") {
		t.Error("work/SKILL.md missing substituted test command")
	}
	if !strings.Contains(string(content), "golangci-lint run ./...") {
		t.Error("work/SKILL.md missing substituted lint command")
	}
}

func TestInstallDocTemplates_SubstitutesQualityGates(t *testing.T) {
	dir := t.TempDir()
	stack := StackInfo{TestCmd: "cargo test", LintCmd: "cargo clippy"}

	_, _, err := InstallDocTemplates(dir, "1.0.0", stack)
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}

	// WORKFLOW.md has quality gate references
	workflowPath := filepath.Join(dir, "docs", "compound", "WORKFLOW.md")
	content, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatalf("read WORKFLOW.md: %v", err)
	}
	if strings.Contains(string(content), "{{QUALITY_GATE_TEST}}") {
		t.Error("WORKFLOW.md still has {{QUALITY_GATE_TEST}} placeholder")
	}
	if !strings.Contains(string(content), "cargo test") {
		t.Error("WORKFLOW.md missing substituted test command")
	}
}

func TestInstallPhaseSkills_StackChangeUpdatesContent(t *testing.T) {
	dir := t.TempDir()

	// Install with Node/npm stack
	npmStack := StackInfo{TestCmd: "npm test", LintCmd: "npm run lint"}
	_, _, err := InstallPhaseSkills(dir, npmStack)
	if err != nil {
		t.Fatalf("InstallPhaseSkills (npm): %v", err)
	}

	// Verify npm commands are in the file
	workSkill := filepath.Join(dir, ".claude", "skills", "compound", "work", "SKILL.md")
	content, err := os.ReadFile(workSkill)
	if err != nil {
		t.Fatalf("read work/SKILL.md: %v", err)
	}
	if !strings.Contains(string(content), "npm test") {
		t.Fatal("work/SKILL.md should contain npm test after first install")
	}

	// Re-install with Go stack (simulates user adding go.mod)
	goStack := StackInfo{TestCmd: "go test ./...", LintCmd: "golangci-lint run ./..."}
	_, updated, err := InstallPhaseSkills(dir, goStack)
	if err != nil {
		t.Fatalf("InstallPhaseSkills (go): %v", err)
	}
	if updated == 0 {
		t.Error("expected skills to be updated when stack changed")
	}

	// Verify Go commands replaced npm commands
	content, err = os.ReadFile(workSkill)
	if err != nil {
		t.Fatalf("read work/SKILL.md after update: %v", err)
	}
	if strings.Contains(string(content), "npm test") {
		t.Error("work/SKILL.md should no longer contain npm test")
	}
	if !strings.Contains(string(content), "go test ./...") {
		t.Error("work/SKILL.md should contain go test ./... after stack change")
	}
}

func TestInstallAgentRoleSkills_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	created, _, err := InstallAgentRoleSkills(dir)
	if err != nil {
		t.Fatalf("InstallAgentRoleSkills: %v", err)
	}
	if created == 0 {
		t.Fatal("expected files to be created")
	}

	// Modify a role skill
	repoAnalyst := filepath.Join(dir, ".claude", "skills", "compound", "agents", "repo-analyst", "SKILL.md")
	if err := os.WriteFile(repoAnalyst, []byte("# stale role\n"), 0644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	_, updated, err := InstallAgentRoleSkills(dir)
	if err != nil {
		t.Fatalf("InstallAgentRoleSkills (update): %v", err)
	}
	if updated == 0 {
		t.Error("expected at least 1 updated role skill")
	}
}

func TestInstallDocTemplates_UpdatesStaleContent(t *testing.T) {
	dir := t.TempDir()

	created, _, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}
	if created == 0 {
		t.Fatal("expected files to be created")
	}

	// Modify a doc file (change content, not just date)
	docsDir := filepath.Join(dir, "docs", "compound")
	entries, err := os.ReadDir(docsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	stalePath := filepath.Join(docsDir, entries[0].Name())
	if err := os.WriteFile(stalePath, []byte("# stale docs\n"), 0644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	_, updated, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates (update): %v", err)
	}
	if updated == 0 {
		t.Error("expected at least 1 updated doc")
	}
}

func TestInstallDocTemplates_DateChangeNotStale(t *testing.T) {
	dir := t.TempDir()

	// Install
	_, _, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}

	// Change only the date in a file (simulates install on a different day)
	docsDir := filepath.Join(dir, "docs", "compound")
	entries, err := os.ReadDir(docsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	filePath := filepath.Join(docsDir, entries[0].Name())
	content, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read doc: %v", err)
	}
	today := time.Now().Format("2006-01-02")
	modified := strings.Replace(string(content), today, "2025-01-01", 1)
	if err := os.WriteFile(filePath, []byte(modified), 0644); err != nil {
		t.Fatalf("write modified: %v", err)
	}

	// Re-install should NOT trigger update (only date changed)
	_, updated, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates (date check): %v", err)
	}
	if updated != 0 {
		t.Errorf("expected 0 updated when only date changed, got %d", updated)
	}
}

func TestInstallDocTemplates_VersionChangeUpdates(t *testing.T) {
	dir := t.TempDir()

	// Install with version 1.0.0
	_, _, err := InstallDocTemplates(dir, "1.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}

	// Re-install with new version should update
	_, updated, err := InstallDocTemplates(dir, "2.0.0", StackInfo{})
	if err != nil {
		t.Fatalf("InstallDocTemplates (version change): %v", err)
	}
	if updated == 0 {
		t.Error("expected docs to be updated when version changed")
	}

	// Verify new version is in content
	readmePath := filepath.Join(dir, "docs", "compound", "README.md")
	content, err := os.ReadFile(readmePath)
	if err != nil {
		t.Fatalf("read README: %v", err)
	}
	if !strings.Contains(string(content), "2.0.0") {
		t.Error("README should contain new version 2.0.0")
	}
	if strings.Contains(string(content), "1.0.0") {
		t.Error("README should not contain old version 1.0.0")
	}
}

func TestPruneStaleTemplates_RemovesExtraFiles(t *testing.T) {
	dir := t.TempDir()

	// Install all templates first
	if _, _, err := InstallAgentTemplates(dir); err != nil {
		t.Fatalf("InstallAgentTemplates: %v", err)
	}
	if _, _, err := InstallWorkflowCommands(dir); err != nil {
		t.Fatalf("InstallWorkflowCommands: %v", err)
	}

	// Add extra files to managed directories (simulating retired templates)
	agentsDir := filepath.Join(dir, ".claude", "agents", "compound")
	if err := os.WriteFile(filepath.Join(agentsDir, "retired-agent.md"), []byte("# old\n"), 0644); err != nil {
		t.Fatalf("write retired agent: %v", err)
	}
	cmdsDir := filepath.Join(dir, ".claude", "commands", "compound")
	if err := os.WriteFile(filepath.Join(cmdsDir, "retired-command.md"), []byte("# old\n"), 0644); err != nil {
		t.Fatalf("write retired command: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned < 2 {
		t.Errorf("expected at least 2 pruned, got %d", pruned)
	}

	// Verify retired files are gone
	if _, err := os.Stat(filepath.Join(agentsDir, "retired-agent.md")); !os.IsNotExist(err) {
		t.Error("retired-agent.md should be removed")
	}
	if _, err := os.Stat(filepath.Join(cmdsDir, "retired-command.md")); !os.IsNotExist(err) {
		t.Error("retired-command.md should be removed")
	}
}

func TestPruneStaleTemplates_PreservesCurrentFiles(t *testing.T) {
	dir := t.TempDir()

	// Install all templates
	if _, _, err := InstallAgentTemplates(dir); err != nil {
		t.Fatalf("InstallAgentTemplates: %v", err)
	}

	// Count files before prune
	agentsDir := filepath.Join(dir, ".claude", "agents", "compound")
	before, err := os.ReadDir(agentsDir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}

	// Prune with no extras should remove nothing
	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned != 0 {
		t.Errorf("expected 0 pruned when no stale files, got %d", pruned)
	}

	// Verify file count unchanged
	after, err := os.ReadDir(agentsDir)
	if err != nil {
		t.Fatalf("ReadDir after: %v", err)
	}
	if len(after) != len(before) {
		t.Errorf("file count changed: %d -> %d", len(before), len(after))
	}
}

func TestPruneStaleTemplates_RemovesStaleSkillDirs(t *testing.T) {
	dir := t.TempDir()

	// Install phase skills
	if _, _, err := InstallPhaseSkills(dir, StackInfo{}); err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}

	// Add a retired phase directory
	stalePhase := filepath.Join(dir, ".claude", "skills", "compound", "retired-phase")
	if err := os.MkdirAll(stalePhase, 0755); err != nil {
		t.Fatalf("mkdir retired-phase: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stalePhase, "SKILL.md"), []byte("# old\n"), 0644); err != nil {
		t.Fatalf("write retired SKILL.md: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned == 0 {
		t.Error("expected at least 1 pruned (retired phase dir)")
	}

	// Verify retired dir is gone
	if _, err := os.Stat(stalePhase); !os.IsNotExist(err) {
		t.Error("retired-phase directory should be removed")
	}
}

func TestPruneStaleTemplates_RemovesStalePhaseReferenceEntries(t *testing.T) {
	dir := t.TempDir()

	// Install phase skills and references.
	if _, _, err := InstallPhaseSkills(dir, StackInfo{}); err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}

	// Add retired entries inside a still-valid phase directory.
	phaseDir := filepath.Join(dir, ".claude", "skills", "compound", "spec-dev")
	staleRef := filepath.Join(phaseDir, "references", "retired.md")
	if err := os.WriteFile(staleRef, []byte("# old ref\n"), 0644); err != nil {
		t.Fatalf("write retired ref: %v", err)
	}
	staleDir := filepath.Join(phaseDir, "retired-dir")
	if err := os.MkdirAll(staleDir, 0755); err != nil {
		t.Fatalf("mkdir retired-dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleDir, "note.md"), []byte("# old dir\n"), 0644); err != nil {
		t.Fatalf("write retired dir note: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned < 2 {
		t.Errorf("expected at least 2 pruned entries, got %d", pruned)
	}

	if _, err := os.Stat(staleRef); !os.IsNotExist(err) {
		t.Error("retired reference file should be removed")
	}
	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Error("retired nested directory should be removed")
	}

	// Current reference file must remain.
	currentRef := filepath.Join(phaseDir, "references", "spec-guide.md")
	if _, err := os.Stat(currentRef); err != nil {
		t.Errorf("current reference file should be preserved: %v", err)
	}
}

func TestPruneStaleTemplates_RemovesStaleRoleDirs(t *testing.T) {
	dir := t.TempDir()

	// Install role skills
	if _, _, err := InstallAgentRoleSkills(dir); err != nil {
		t.Fatalf("InstallAgentRoleSkills: %v", err)
	}

	// Add a retired role directory
	staleRole := filepath.Join(dir, ".claude", "skills", "compound", "agents", "retired-role")
	if err := os.MkdirAll(staleRole, 0755); err != nil {
		t.Fatalf("mkdir retired-role: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleRole, "SKILL.md"), []byte("# old\n"), 0644); err != nil {
		t.Fatalf("write retired SKILL.md: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned == 0 {
		t.Error("expected at least 1 pruned (retired role dir)")
	}

	if _, err := os.Stat(staleRole); !os.IsNotExist(err) {
		t.Error("retired-role directory should be removed")
	}
}

func TestPruneStaleTemplates_RemovesStaleAgentRoleReferenceEntries(t *testing.T) {
	dir := t.TempDir()

	// Install agent role skills and references.
	if _, _, err := InstallAgentRoleSkills(dir); err != nil {
		t.Fatalf("InstallAgentRoleSkills: %v", err)
	}

	// Add retired entries inside a still-valid role directory.
	roleDir := filepath.Join(dir, ".claude", "skills", "compound", "agents", "runtime-verifier")
	staleRef := filepath.Join(roleDir, "references", "retired.md")
	if err := os.WriteFile(staleRef, []byte("# old ref\n"), 0644); err != nil {
		t.Fatalf("write retired ref: %v", err)
	}
	staleDir := filepath.Join(roleDir, "retired-dir")
	if err := os.MkdirAll(staleDir, 0755); err != nil {
		t.Fatalf("mkdir retired-dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleDir, "note.md"), []byte("# old dir\n"), 0644); err != nil {
		t.Fatalf("write retired dir note: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned < 2 {
		t.Errorf("expected at least 2 pruned entries, got %d", pruned)
	}

	if _, err := os.Stat(staleRef); !os.IsNotExist(err) {
		t.Error("retired reference file should be removed")
	}
	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Error("retired nested directory should be removed")
	}

	// Current reference file must remain.
	currentRef := filepath.Join(roleDir, "references", "playwright-patterns.md")
	if _, err := os.Stat(currentRef); err != nil {
		t.Errorf("current reference file should be preserved: %v", err)
	}

	// Current SKILL.md must remain.
	skillFile := filepath.Join(roleDir, "SKILL.md")
	if _, err := os.Stat(skillFile); err != nil {
		t.Errorf("SKILL.md should be preserved: %v", err)
	}
}

func TestPruneStaleTemplates_RemovesStaleResearchFiles(t *testing.T) {
	dir := t.TempDir()

	// Install research docs first
	if _, _, err := InstallResearchDocs(dir); err != nil {
		t.Fatalf("InstallResearchDocs: %v", err)
	}

	// Add a stale research file
	staleFile := filepath.Join(dir, "docs", "compound", "research", "retired-topic.md")
	if err := os.WriteFile(staleFile, []byte("# old research\n"), 0644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}

	// Add a stale research directory
	staleDir := filepath.Join(dir, "docs", "compound", "research", "retired-topic")
	if err := os.MkdirAll(staleDir, 0755); err != nil {
		t.Fatalf("mkdir stale dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleDir, "old.md"), []byte("# old\n"), 0644); err != nil {
		t.Fatalf("write stale dir file: %v", err)
	}

	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned < 2 {
		t.Errorf("expected at least 2 pruned (stale file + dir), got %d", pruned)
	}

	if _, err := os.Stat(staleFile); !os.IsNotExist(err) {
		t.Error("stale research file should be removed")
	}
	if _, err := os.Stat(staleDir); !os.IsNotExist(err) {
		t.Error("stale research directory should be removed")
	}

	// Current research files must remain
	indexPath := filepath.Join(dir, "docs", "compound", "research", "index.md")
	if _, err := os.Stat(indexPath); err != nil {
		t.Errorf("index.md should be preserved: %v", err)
	}
}

func TestPruneStaleTemplates_NonExistentDirs(t *testing.T) {
	dir := t.TempDir()

	// Prune on a repo with no managed dirs should succeed with 0
	pruned, err := PruneStaleTemplates(dir)
	if err != nil {
		t.Fatalf("PruneStaleTemplates: %v", err)
	}
	if pruned != 0 {
		t.Errorf("expected 0 pruned, got %d", pruned)
	}
}

func TestCreatePluginManifest_UpdatesStaleVersion(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".claude"), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Create with old version
	created, _, err := CreatePluginManifest(dir, "1.8.0")
	if err != nil {
		t.Fatalf("CreatePluginManifest: %v", err)
	}
	if !created {
		t.Error("expected plugin.json to be created")
	}

	// Re-run with newer version → should update
	created2, updated, err := CreatePluginManifest(dir, "2.0.3")
	if err != nil {
		t.Fatalf("CreatePluginManifest (update): %v", err)
	}
	if created2 {
		t.Error("expected created=false on update")
	}
	if !updated {
		t.Error("expected updated=true when version changed")
	}

	// Verify the new version is written
	content, _ := os.ReadFile(filepath.Join(dir, ".claude", "plugin.json"))
	if !strings.Contains(string(content), "2.0.3") {
		t.Error("plugin.json should contain new version 2.0.3")
	}
	if strings.Contains(string(content), "1.8.0") {
		t.Error("plugin.json should not contain old version 1.8.0")
	}
}
