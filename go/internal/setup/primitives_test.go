package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallAgentTemplates(t *testing.T) {
	dir := t.TempDir()

	// First install creates files
	n, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
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

	// Verify idempotency: second install creates nothing
	n2, err := InstallAgentTemplates(dir)
	if err != nil {
		t.Fatalf("InstallAgentTemplates (2nd): %v", err)
	}
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
}

func TestInstallWorkflowCommands(t *testing.T) {
	dir := t.TempDir()

	n, err := InstallWorkflowCommands(dir)
	if err != nil {
		t.Fatalf("InstallWorkflowCommands: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}

	// Verify files exist
	cmdsDir := filepath.Join(dir, ".claude", "commands", "compound")
	entries, _ := os.ReadDir(cmdsDir)
	if len(entries) == 0 {
		t.Fatal("no command files created")
	}

	// Verify idempotency
	n2, _ := InstallWorkflowCommands(dir)
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
}

func TestInstallPhaseSkills(t *testing.T) {
	dir := t.TempDir()

	n, err := InstallPhaseSkills(dir)
	if err != nil {
		t.Fatalf("InstallPhaseSkills: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
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
	n2, _ := InstallPhaseSkills(dir)
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
}

func TestInstallAgentRoleSkills(t *testing.T) {
	dir := t.TempDir()

	n, err := InstallAgentRoleSkills(dir)
	if err != nil {
		t.Fatalf("InstallAgentRoleSkills: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
	}

	// Verify a known role exists
	repoAnalyst := filepath.Join(dir, ".claude", "skills", "compound", "agents", "repo-analyst", "SKILL.md")
	if _, err := os.Stat(repoAnalyst); err != nil {
		t.Errorf("missing repo-analyst/SKILL.md: %v", err)
	}

	// Verify idempotency
	n2, _ := InstallAgentRoleSkills(dir)
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
	}
}

func TestInstallDocTemplates(t *testing.T) {
	dir := t.TempDir()

	n, err := InstallDocTemplates(dir, "1.0.0")
	if err != nil {
		t.Fatalf("InstallDocTemplates: %v", err)
	}
	if n == 0 {
		t.Fatal("expected files to be created")
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
	n2, _ := InstallDocTemplates(dir, "1.0.0")
	if n2 != 0 {
		t.Errorf("idempotent install created %d files, want 0", n2)
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
