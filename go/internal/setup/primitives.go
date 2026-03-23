// Package setup provides setup primitives for compound-agent initialization.
package setup

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/setup/templates"
)

// InstallAgentTemplates writes agent .md files to .claude/agents/compound/.
// Idempotent: does not overwrite existing files. Returns count of files created.
func InstallAgentTemplates(repoRoot string) (int, error) {
	dir := filepath.Join(repoRoot, ".claude", "agents", "compound")
	return installMapToDir(dir, templates.AgentTemplates())
}

// InstallWorkflowCommands writes command .md files to .claude/commands/compound/.
// Idempotent: does not overwrite existing files. Returns count of files created.
func InstallWorkflowCommands(repoRoot string) (int, error) {
	dir := filepath.Join(repoRoot, ".claude", "commands", "compound")
	return installMapToDir(dir, templates.CommandTemplates())
}

// InstallPhaseSkills writes phase SKILL.md files to .claude/skills/compound/<phase>/SKILL.md.
// Also writes reference files alongside skills. Idempotent. Returns count of files created.
func InstallPhaseSkills(repoRoot string) (int, error) {
	created := 0
	for phase, content := range templates.PhaseSkills() {
		skillDir := filepath.Join(repoRoot, ".claude", "skills", "compound", phase)
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			return created, fmt.Errorf("mkdir %s: %w", skillDir, err)
		}
		filePath := filepath.Join(skillDir, "SKILL.md")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return created, fmt.Errorf("write %s: %w", filePath, err)
			}
			created++
		}
	}

	// Install reference files
	for relPath, content := range templates.PhaseSkillReferences() {
		filePath := filepath.Join(repoRoot, ".claude", "skills", "compound", relPath)
		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			return created, fmt.Errorf("mkdir %s: %w", filepath.Dir(filePath), err)
		}
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return created, fmt.Errorf("write %s: %w", filePath, err)
			}
			created++
		}
	}

	return created, nil
}

// InstallAgentRoleSkills writes agent role SKILL.md files to
// .claude/skills/compound/agents/<role>/SKILL.md.
// Idempotent: does not overwrite existing files. Returns count of files created.
func InstallAgentRoleSkills(repoRoot string) (int, error) {
	created := 0
	for role, content := range templates.AgentRoleSkills() {
		skillDir := filepath.Join(repoRoot, ".claude", "skills", "compound", "agents", role)
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			return created, fmt.Errorf("mkdir %s: %w", skillDir, err)
		}
		filePath := filepath.Join(skillDir, "SKILL.md")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return created, fmt.Errorf("write %s: %w", filePath, err)
			}
			created++
		}
	}
	return created, nil
}

// InstallDocTemplates writes documentation .md files to docs/compound/.
// Substitutes {{VERSION}} and {{DATE}} placeholders. Idempotent. Returns count of files created.
func InstallDocTemplates(repoRoot string, version string) (int, error) {
	dir := filepath.Join(repoRoot, "docs", "compound")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, fmt.Errorf("mkdir %s: %w", dir, err)
	}

	created := 0
	date := time.Now().Format("2006-01-02")
	for filename, tmpl := range templates.DocTemplates() {
		filePath := filepath.Join(dir, filename)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			content := strings.ReplaceAll(tmpl, "{{VERSION}}", version)
			content = strings.ReplaceAll(content, "{{DATE}}", date)
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return created, fmt.Errorf("write %s: %w", filePath, err)
			}
			created++
		}
	}
	return created, nil
}

// UpdateAgentsMd creates or appends the Compound Agent section to AGENTS.md.
// Idempotent: returns false if section already exists.
func UpdateAgentsMd(repoRoot string) (bool, error) {
	agentsPath := filepath.Join(repoRoot, "AGENTS.md")
	tmpl := templates.AgentsMdTemplate()

	existing, err := os.ReadFile(agentsPath)
	if err == nil {
		// File exists — check if section already present
		if strings.Contains(string(existing), templates.CompoundAgentSectionHeader) {
			return false, nil
		}
		// Append section
		content := strings.TrimRight(string(existing), "\n") + "\n" + tmpl
		return true, os.WriteFile(agentsPath, []byte(content), 0644)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("read AGENTS.md: %w", err)
	}

	// File doesn't exist — create with template
	content := strings.TrimSpace(tmpl) + "\n"
	return true, os.WriteFile(agentsPath, []byte(content), 0644)
}

// EnsureClaudeMdReference creates or appends a Compound Agent reference to .claude/CLAUDE.md.
// Idempotent: returns false if reference already present.
func EnsureClaudeMdReference(repoRoot string) (bool, error) {
	claudeDir := filepath.Join(repoRoot, ".claude")
	if err := os.MkdirAll(claudeDir, 0755); err != nil {
		return false, fmt.Errorf("mkdir .claude: %w", err)
	}

	claudeMdPath := filepath.Join(claudeDir, "CLAUDE.md")
	ref := templates.ClaudeMdReference()

	existing, err := os.ReadFile(claudeMdPath)
	if err == nil {
		// File exists — check if reference already present
		content := string(existing)
		if strings.Contains(content, "Compound Agent") || strings.Contains(content, templates.ClaudeRefStartMarker) {
			return false, nil
		}
		// Append reference
		newContent := strings.TrimRight(content, "\n") + "\n" + ref
		return true, os.WriteFile(claudeMdPath, []byte(newContent), 0644)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("read CLAUDE.md: %w", err)
	}

	// File doesn't exist — create
	content := "# Project Instructions\n" + ref
	return true, os.WriteFile(claudeMdPath, []byte(content), 0644)
}

// CreatePluginManifest creates or updates .claude/plugin.json.
// Substitutes {{VERSION}} placeholder. Creates if missing, updates if version differs.
// Returns (created, updated, error).
func CreatePluginManifest(repoRoot string, version string) (bool, bool, error) {
	pluginPath := filepath.Join(repoRoot, ".claude", "plugin.json")

	if err := os.MkdirAll(filepath.Join(repoRoot, ".claude"), 0755); err != nil {
		return false, false, fmt.Errorf("mkdir .claude: %w", err)
	}

	content := strings.ReplaceAll(templates.PluginJSON(), "{{VERSION}}", version)

	existing, readErr := os.ReadFile(pluginPath)
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		return false, false, fmt.Errorf("read plugin.json: %w", readErr)
	}

	if errors.Is(readErr, os.ErrNotExist) {
		// File doesn't exist — create
		return true, false, os.WriteFile(pluginPath, []byte(content), 0644)
	}

	// File exists — check if version matches
	var manifest map[string]any
	if err := json.Unmarshal(existing, &manifest); err == nil {
		if manifest["version"] == version {
			return false, false, nil // Already up to date
		}
	}

	// Version mismatch or unparseable — update
	return false, true, os.WriteFile(pluginPath, []byte(content), 0644)
}

// installMapToDir writes files from a map to a directory.
// Idempotent: skips existing files. Returns count of files created.
func installMapToDir(dir string, files map[string]string) (int, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, fmt.Errorf("mkdir %s: %w", dir, err)
	}

	created := 0
	for filename, content := range files {
		filePath := filepath.Join(dir, filename)
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				return created, fmt.Errorf("write %s: %w", filePath, err)
			}
			created++
		}
	}
	return created, nil
}
