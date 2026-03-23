// Package setup provides setup primitives for compound-agent initialization.
package setup

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/setup/templates"
)

// docDatePattern matches last-updated frontmatter dates for normalization.
var docDatePattern = regexp.MustCompile(`last-updated: "\d{4}-\d{2}-\d{2}"`)

// normalizeDocDate replaces last-updated date values with a fixed string
// so that date-only differences don't trigger spurious template updates.
func normalizeDocDate(content string) string {
	return docDatePattern.ReplaceAllString(content, `last-updated: "NORMALIZED"`)
}

// reconcileFile creates or updates a file at filePath with content.
// Returns (created, updated) booleans. Updates only when content differs.
func reconcileFile(filePath string, content string) (bool, bool, error) {
	existing, err := os.ReadFile(filePath)
	if errors.Is(err, os.ErrNotExist) {
		if wErr := os.WriteFile(filePath, []byte(content), 0644); wErr != nil {
			return false, false, fmt.Errorf("write %s: %w", filePath, wErr)
		}
		return true, false, nil
	}
	if err != nil {
		return false, false, fmt.Errorf("read %s: %w", filePath, err)
	}
	if string(existing) != content {
		if wErr := os.WriteFile(filePath, []byte(content), 0644); wErr != nil {
			return false, false, fmt.Errorf("write %s: %w", filePath, wErr)
		}
		return false, true, nil
	}
	return false, false, nil
}

// InstallAgentTemplates writes agent .md files to .claude/agents/compound/.
// Creates missing files and updates stale files. Returns (created, updated, error).
func InstallAgentTemplates(repoRoot string) (int, int, error) {
	dir := filepath.Join(repoRoot, ".claude", "agents", "compound")
	return installMapToDir(dir, templates.AgentTemplates())
}

// InstallWorkflowCommands writes command .md files to .claude/commands/compound/.
// Creates missing files and updates stale files. Returns (created, updated, error).
func InstallWorkflowCommands(repoRoot string) (int, int, error) {
	dir := filepath.Join(repoRoot, ".claude", "commands", "compound")
	return installMapToDir(dir, templates.CommandTemplates())
}

// InstallPhaseSkills writes phase SKILL.md files to .claude/skills/compound/<phase>/SKILL.md.
// Also writes reference files alongside skills. Creates missing and updates stale files.
// Returns (created, updated, error).
func InstallPhaseSkills(repoRoot string) (int, int, error) {
	created, updated := 0, 0
	for phase, content := range templates.PhaseSkills() {
		skillDir := filepath.Join(repoRoot, ".claude", "skills", "compound", phase)
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			return created, updated, fmt.Errorf("mkdir %s: %w", skillDir, err)
		}
		filePath := filepath.Join(skillDir, "SKILL.md")
		c, u, err := reconcileFile(filePath, content)
		if err != nil {
			return created, updated, err
		}
		if c {
			created++
		}
		if u {
			updated++
		}
	}

	// Install reference files
	for relPath, content := range templates.PhaseSkillReferences() {
		filePath := filepath.Join(repoRoot, ".claude", "skills", "compound", relPath)
		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			return created, updated, fmt.Errorf("mkdir %s: %w", filepath.Dir(filePath), err)
		}
		c, u, err := reconcileFile(filePath, content)
		if err != nil {
			return created, updated, err
		}
		if c {
			created++
		}
		if u {
			updated++
		}
	}

	return created, updated, nil
}

// InstallAgentRoleSkills writes agent role SKILL.md files to
// .claude/skills/compound/agents/<role>/SKILL.md.
// Creates missing and updates stale files. Returns (created, updated, error).
func InstallAgentRoleSkills(repoRoot string) (int, int, error) {
	created, updated := 0, 0
	for role, content := range templates.AgentRoleSkills() {
		skillDir := filepath.Join(repoRoot, ".claude", "skills", "compound", "agents", role)
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			return created, updated, fmt.Errorf("mkdir %s: %w", skillDir, err)
		}
		filePath := filepath.Join(skillDir, "SKILL.md")
		c, u, err := reconcileFile(filePath, content)
		if err != nil {
			return created, updated, err
		}
		if c {
			created++
		}
		if u {
			updated++
		}
	}
	return created, updated, nil
}

// InstallDocTemplates writes documentation .md files to docs/compound/.
// Substitutes {{VERSION}} and {{DATE}} placeholders. Creates missing and updates
// stale files (date-only changes are ignored). Returns (created, updated, error).
func InstallDocTemplates(repoRoot string, version string) (int, int, error) {
	dir := filepath.Join(repoRoot, "docs", "compound")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, 0, fmt.Errorf("mkdir %s: %w", dir, err)
	}

	created, updated := 0, 0
	date := time.Now().Format("2006-01-02")
	for filename, tmpl := range templates.DocTemplates() {
		filePath := filepath.Join(dir, filename)
		content := strings.ReplaceAll(tmpl, "{{VERSION}}", version)
		content = strings.ReplaceAll(content, "{{DATE}}", date)

		existing, err := os.ReadFile(filePath)
		if errors.Is(err, os.ErrNotExist) {
			if wErr := os.WriteFile(filePath, []byte(content), 0644); wErr != nil {
				return created, updated, fmt.Errorf("write %s: %w", filePath, wErr)
			}
			created++
			continue
		}
		if err != nil {
			return created, updated, fmt.Errorf("read %s: %w", filePath, err)
		}
		// Compare with date normalization to avoid spurious updates
		if normalizeDocDate(string(existing)) != normalizeDocDate(content) {
			if wErr := os.WriteFile(filePath, []byte(content), 0644); wErr != nil {
				return created, updated, fmt.Errorf("write %s: %w", filePath, wErr)
			}
			updated++
		}
	}
	return created, updated, nil
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

// PruneStaleTemplates removes managed files and directories that no longer
// exist in the current template set. Only touches compound/ namespaces.
// Returns count of items removed.
func PruneStaleTemplates(repoRoot string) (int, error) {
	pruned := 0

	// Flat directories: prune files not in current template set
	flatDirs := []struct {
		dir      string
		expected map[string]string
	}{
		{filepath.Join(repoRoot, ".claude", "agents", "compound"), templates.AgentTemplates()},
		{filepath.Join(repoRoot, ".claude", "commands", "compound"), templates.CommandTemplates()},
		{filepath.Join(repoRoot, "docs", "compound"), templates.DocTemplates()},
	}
	for _, fd := range flatDirs {
		n, err := pruneStaleFiles(fd.dir, fd.expected)
		if err != nil {
			return pruned, err
		}
		pruned += n
	}

	// Phase skills: prune stale phase directories (skip "agents/" subdir)
	skillsDir := filepath.Join(repoRoot, ".claude", "skills", "compound")
	n, err := pruneStaleSubdirs(skillsDir, templates.PhaseSkills(), []string{"agents"})
	if err != nil {
		return pruned, err
	}
	pruned += n

	// Phase skill internals: prune retired nested files/dirs (for example old
	// references under a still-valid phase directory).
	n, err = prunePhaseSkillInternals(skillsDir)
	if err != nil {
		return pruned, err
	}
	pruned += n

	// Agent role skills: prune stale role directories
	rolesDir := filepath.Join(repoRoot, ".claude", "skills", "compound", "agents")
	n, err = pruneStaleSubdirs(rolesDir, templates.AgentRoleSkills(), nil)
	if err != nil {
		return pruned, err
	}
	pruned += n

	return pruned, nil
}

// prunePhaseSkillInternals removes retired files and directories inside current
// phase skill directories while preserving the current SKILL.md and reference files.
func prunePhaseSkillInternals(skillsDir string) (int, error) {
	expectedFiles := make(map[string]bool)
	expectedDirs := make(map[string]bool)

	for phase := range templates.PhaseSkills() {
		expectedDirs[phase] = true
		expectedFiles[path.Join(phase, "SKILL.md")] = true
	}
	for relPath := range templates.PhaseSkillReferences() {
		expectedFiles[relPath] = true
		for dir := path.Dir(relPath); dir != "." && dir != ""; dir = path.Dir(dir) {
			expectedDirs[dir] = true
		}
	}

	return pruneManagedSubtree(skillsDir, "", expectedFiles, expectedDirs, map[string]bool{"agents": true})
}

// pruneStaleFiles removes files from dir that are not in the expected map (by filename key).
// Skips subdirectories. Returns count of files removed.
func pruneStaleFiles(dir string, expected map[string]string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("read %s: %w", dir, err)
	}
	pruned := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if _, ok := expected[entry.Name()]; !ok {
			if rErr := os.Remove(filepath.Join(dir, entry.Name())); rErr != nil {
				return pruned, fmt.Errorf("remove %s: %w", entry.Name(), rErr)
			}
			pruned++
		}
	}
	return pruned, nil
}

// pruneManagedSubtree removes files and directories below root that are not in
// the expected sets. Relative paths in expectedFiles/expectedDirs use slash
// separators. skipTopLevel names are preserved only at the root level.
func pruneManagedSubtree(
	root string,
	relDir string,
	expectedFiles map[string]bool,
	expectedDirs map[string]bool,
	skipTopLevel map[string]bool,
) (int, error) {
	dirPath := root
	if relDir != "" {
		dirPath = filepath.Join(root, filepath.FromSlash(relDir))
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("read %s: %w", dirPath, err)
	}

	pruned := 0
	for _, entry := range entries {
		relPath := entry.Name()
		if relDir != "" {
			relPath = path.Join(relDir, entry.Name())
		}

		if entry.IsDir() {
			if relDir == "" && skipTopLevel[entry.Name()] {
				continue
			}
			if !expectedDirs[relPath] {
				if rErr := os.RemoveAll(filepath.Join(root, filepath.FromSlash(relPath))); rErr != nil {
					return pruned, fmt.Errorf("remove %s: %w", relPath, rErr)
				}
				pruned++
				continue
			}

			n, recurseErr := pruneManagedSubtree(root, relPath, expectedFiles, expectedDirs, skipTopLevel)
			if recurseErr != nil {
				return pruned, recurseErr
			}
			pruned += n
			continue
		}

		if !expectedFiles[relPath] {
			if rErr := os.Remove(filepath.Join(root, filepath.FromSlash(relPath))); rErr != nil {
				return pruned, fmt.Errorf("remove %s: %w", relPath, rErr)
			}
			pruned++
		}
	}

	return pruned, nil
}

// pruneStaleSubdirs removes subdirectories from dir that are not in the expected map (by key).
// skip contains directory names to always preserve (e.g., "agents" within skills/compound/).
// Returns count of directories removed.
func pruneStaleSubdirs(dir string, expected map[string]string, skip []string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("read %s: %w", dir, err)
	}
	skipSet := make(map[string]bool, len(skip))
	for _, s := range skip {
		skipSet[s] = true
	}
	pruned := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if skipSet[entry.Name()] {
			continue
		}
		if _, ok := expected[entry.Name()]; !ok {
			if rErr := os.RemoveAll(filepath.Join(dir, entry.Name())); rErr != nil {
				return pruned, fmt.Errorf("remove %s: %w", entry.Name(), rErr)
			}
			pruned++
		}
	}
	return pruned, nil
}

// installMapToDir writes files from a map to a directory.
// Creates missing files and updates existing files whose content has changed.
// Returns (created count, updated count, error).
func installMapToDir(dir string, files map[string]string) (int, int, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, 0, fmt.Errorf("mkdir %s: %w", dir, err)
	}

	created, updated := 0, 0
	for filename, content := range files {
		filePath := filepath.Join(dir, filename)
		c, u, err := reconcileFile(filePath, content)
		if err != nil {
			return created, updated, err
		}
		if c {
			created++
		}
		if u {
			updated++
		}
	}
	return created, updated, nil
}
