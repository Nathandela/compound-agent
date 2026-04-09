package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/build"
)

// ArtifactRoot is the directory name for all compound-agent runtime artifacts
// (loop scripts, agent logs). It lives at the repository root and is gitignored.
const ArtifactRoot = ".compound-agent"

// ArtifactLogDir is the subdirectory inside ArtifactRoot for agent logs.
const ArtifactLogDir = "agent_logs"

// InitOptions controls what init creates.
type InitOptions struct {
	SkipHooks     bool
	SkipTemplates bool   // Skip installing agent/command/skill/doc templates.
	BinaryPath    string // Path to the Go binary for hook commands. Empty = npx fallback.
}

// InitResult reports what init did.
type InitResult struct {
	Success             bool
	HooksInstalled      bool
	HooksUpgraded       bool
	DirsCreated         []string
	FilesCreated        []string
	AgentsInstalled     int
	AgentsUpdated       int
	CommandsInstalled   int
	CommandsUpdated     int
	SkillsInstalled     int
	SkillsUpdated       int
	RoleSkillsInstalled int
	RoleSkillsUpdated   int
	DocsInstalled       int
	DocsUpdated         int
	ResearchInstalled   int
	ResearchUpdated     int
	TemplatesPruned     int
	AgentsMdUpdated     bool
	ClaudeMdUpdated     bool
	PluginCreated       bool
	PluginUpdated       bool
}

// initDirectories creates the .claude/ directory structure and index.jsonl.
func initDirectories(repoRoot string, result *InitResult) error {
	dirs := []string{
		filepath.Join(repoRoot, ".claude"),
		filepath.Join(repoRoot, ".claude", "lessons"),
		filepath.Join(repoRoot, ".claude", ".cache"),
		filepath.Join(repoRoot, ".claude", "agents", "compound"),
		filepath.Join(repoRoot, ".claude", "commands", "compound"),
		filepath.Join(repoRoot, ".claude", "skills", "compound"),
		filepath.Join(repoRoot, ArtifactRoot),
	}

	for _, dir := range dirs {
		_, statErr := os.Stat(dir)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
		if os.IsNotExist(statErr) {
			result.DirsCreated = append(result.DirsCreated, dir)
		}
	}

	indexPath := filepath.Join(repoRoot, ".claude", "lessons", "index.jsonl")
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		if err := os.WriteFile(indexPath, []byte{}, 0644); err != nil {
			return fmt.Errorf("create index.jsonl: %w", err)
		}
		result.FilesCreated = append(result.FilesCreated, indexPath)
	}

	if err := EnsureGitignore(repoRoot); err != nil {
		return err
	}
	if err := EnsureRootGitignore(repoRoot); err != nil {
		return err
	}
	return MigrateLegacyArtifacts(repoRoot)
}

// initHooks installs or upgrades Claude Code hooks in settings.json.
func initHooks(repoRoot string, binaryPath string, result *InitResult) error {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}

	needsInstall := !HasAllHooks(settings)
	needsUpgrade := HooksNeedUpgrade(settings, binaryPath)
	needsDedupe := HooksNeedDedupe(settings)

	if needsInstall || needsUpgrade || needsDedupe {
		AddAllHooks(settings, binaryPath)
		if err := WriteClaudeSettings(settingsPath, settings); err != nil {
			return fmt.Errorf("write settings: %w", err)
		}
		result.HooksUpgraded = needsUpgrade && !needsInstall
	}
	result.HooksInstalled = true
	return nil
}

// installTemplates installs all template assets (agents, commands, skills, docs).
// Detects the project stack to substitute quality gate placeholders.
func installTemplates(repoRoot string, result *InitResult) error {
	version := build.Version

	updated, err := UpdateAgentsMd(repoRoot)
	if err != nil {
		return fmt.Errorf("update AGENTS.md: %w", err)
	}
	result.AgentsMdUpdated = updated

	updated, err = EnsureClaudeMdReference(repoRoot)
	if err != nil {
		return fmt.Errorf("ensure CLAUDE.md reference: %w", err)
	}
	result.ClaudeMdUpdated = updated

	created, pluginUpdated, err := CreatePluginManifest(repoRoot, version)
	if err != nil {
		return fmt.Errorf("create plugin.json: %w", err)
	}
	result.PluginCreated = created
	result.PluginUpdated = pluginUpdated

	stack := DetectStack(repoRoot)
	return installTemplateGroups(repoRoot, version, stack, result)
}

// installTemplateGroups installs agent, command, skill, role skill, and doc templates.
// Stack info is used to substitute quality gate placeholders in skills and docs.
func installTemplateGroups(repoRoot string, version string, stack StackInfo, result *InitResult) error {
	type installFunc struct {
		fn   func() (int, int, error)
		setN func(int)
		setU func(int)
		name string
	}
	groups := []installFunc{
		{func() (int, int, error) { return InstallAgentTemplates(repoRoot) },
			func(n int) { result.AgentsInstalled = n }, func(u int) { result.AgentsUpdated = u }, "agent templates"},
		{func() (int, int, error) { return InstallWorkflowCommands(repoRoot) },
			func(n int) { result.CommandsInstalled = n }, func(u int) { result.CommandsUpdated = u }, "workflow commands"},
		{func() (int, int, error) { return InstallPhaseSkills(repoRoot, stack) },
			func(n int) { result.SkillsInstalled = n }, func(u int) { result.SkillsUpdated = u }, "phase skills"},
		{func() (int, int, error) { return InstallAgentRoleSkills(repoRoot) },
			func(n int) { result.RoleSkillsInstalled = n }, func(u int) { result.RoleSkillsUpdated = u }, "agent role skills"},
		{func() (int, int, error) { return InstallDocTemplates(repoRoot, version, stack) },
			func(n int) { result.DocsInstalled = n }, func(u int) { result.DocsUpdated = u }, "doc templates"},
		{func() (int, int, error) { return InstallResearchDocs(repoRoot) },
			func(n int) { result.ResearchInstalled = n }, func(u int) { result.ResearchUpdated = u }, "research docs"},
	}

	for _, g := range groups {
		n, u, err := g.fn()
		if err != nil {
			return fmt.Errorf("install %s: %w", g.name, err)
		}
		g.setN(n)
		g.setU(u)
	}

	pruned, err := PruneStaleTemplates(repoRoot)
	if err != nil {
		return fmt.Errorf("prune stale templates: %w", err)
	}
	result.TemplatesPruned = pruned

	if err := CompileSkillsIndex(repoRoot); err != nil {
		return fmt.Errorf("compile skills index: %w", err)
	}
	return nil
}

// InitRepo initializes compound-agent in a repository.
// Creates .claude/ structure, lessons index, and optionally installs hooks.
func InitRepo(repoRoot string, opts InitOptions) (*InitResult, error) {
	result := &InitResult{Success: true}

	if err := initDirectories(repoRoot, result); err != nil {
		return nil, err
	}

	if !opts.SkipHooks {
		if err := initHooks(repoRoot, opts.BinaryPath, result); err != nil {
			return nil, err
		}
	}

	if !opts.SkipTemplates {
		if err := installTemplates(repoRoot, result); err != nil {
			return nil, err
		}
	}

	return result, nil
}

// ArtifactRootPath returns the absolute path to the artifact root directory.
func ArtifactRootPath(repoRoot string) string {
	return filepath.Join(repoRoot, ArtifactRoot)
}

// ArtifactLogPath returns the absolute path to the agent logs directory.
func ArtifactLogPath(repoRoot string) string {
	return filepath.Join(repoRoot, ArtifactRoot, ArtifactLogDir)
}

// EnsureRootGitignore creates or updates the root .gitignore with .compound-agent/ entry.
func EnsureRootGitignore(repoRoot string) error {
	gitignorePath := filepath.Join(repoRoot, ".gitignore")

	marker := "# compound-agent managed"
	patterns := marker + "\n" + ArtifactRoot + "/\n"

	existing, err := os.ReadFile(gitignorePath)
	if err == nil {
		content := string(existing)
		if strings.Contains(content, marker) {
			// Already has marker — check if it has stale individual entries and update
			return updateRootGitignoreBlock(gitignorePath, content, marker, patterns)
		}
		// Append our block
		combined := strings.TrimRight(content, "\n") + "\n\n" + patterns
		return os.WriteFile(gitignorePath, []byte(combined), 0644)
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("read root .gitignore: %w", err)
	}

	return os.WriteFile(gitignorePath, []byte(patterns), 0644)
}

// updateRootGitignoreBlock replaces the existing compound-agent managed block with the new one.
// This handles migration from stale individual entries (agent_logs/, infinity-loop.sh, etc.)
// to the single .compound-agent/ entry.
func updateRootGitignoreBlock(path, content, marker, newBlock string) error {
	idx := strings.Index(content, marker)
	if idx < 0 {
		return nil
	}

	// Extract the existing managed block (from marker to next blank line or EOF)
	rest := content[idx:]
	endIdx := strings.Index(rest, "\n\n")

	var existingBlock string
	if endIdx >= 0 {
		existingBlock = rest[:endIdx+1] // include trailing \n
	} else {
		existingBlock = strings.TrimRight(rest, "\n") + "\n"
	}

	// If the block already matches, no-op
	if existingBlock == newBlock {
		return nil
	}

	// Replace the old block with the new one
	updated := content[:idx] + newBlock
	if endIdx >= 0 {
		updated += rest[endIdx+1:] // skip the first \n of \n\n, keep the rest
	}

	return os.WriteFile(path, []byte(updated), 0644)
}

// MigrateLegacyArtifacts detects and moves legacy artifacts from the project root
// into .compound-agent/. Prints a notice for each migrated item.
// If both legacy and new locations exist, skips with a warning.
func MigrateLegacyArtifacts(repoRoot string) error {
	artifactRoot := ArtifactRootPath(repoRoot)

	// Ensure artifact root exists
	if err := os.MkdirAll(artifactRoot, 0755); err != nil {
		return fmt.Errorf("create artifact root: %w", err)
	}

	// Items to migrate: {legacy relative path, destination relative to artifact root}
	items := []struct {
		legacy string // relative to repoRoot
		dest   string // relative to artifactRoot
	}{
		{"agent_logs", ArtifactLogDir},
		{"infinity-loop.sh", "infinity-loop.sh"},
		{"polish-loop.sh", "polish-loop.sh"},
		{"improvement-loop.sh", "improvement-loop.sh"},
		// Phase state files migrated from .claude/ to .compound-agent/
		{filepath.Join(".claude", ".ca-phase-state.json"), ".ca-phase-state.json"},
		{filepath.Join(".claude", ".ca-failure-state.json"), ".ca-failure-state.json"},
		{filepath.Join(".claude", ".ca-read-state.json"), ".ca-read-state.json"},
	}

	for _, item := range items {
		legacyPath := filepath.Join(repoRoot, item.legacy)
		destPath := filepath.Join(artifactRoot, item.dest)

		// Check if legacy exists
		if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
			continue
		}

		// Check for conflict: both exist
		if _, err := os.Stat(destPath); err == nil {
			fmt.Fprintf(os.Stderr, "⚠ Skipping migration of %s: both %s and %s exist\n",
				item.legacy, legacyPath, destPath)
			continue
		}

		// Ensure destination parent exists
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return fmt.Errorf("create destination dir for %s: %w", item.legacy, err)
		}

		// Move
		if err := os.Rename(legacyPath, destPath); err != nil {
			return fmt.Errorf("migrate %s: %w", item.legacy, err)
		}
		fmt.Fprintf(os.Stderr, "✓ Migrated %s → %s/%s\n", item.legacy, ArtifactRoot, item.dest)
	}

	return nil
}

// EnsureGitignore creates or updates .claude/.gitignore with required patterns.
func EnsureGitignore(repoRoot string) error {
	gitignorePath := filepath.Join(repoRoot, ".claude", ".gitignore")

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(gitignorePath), 0755); err != nil {
		return err
	}

	marker := "# compound-agent managed"
	patterns := marker + `
.cache/
*.sqlite
*.sqlite-shm
*.sqlite-wal
.ca-hints-shown
skills/compound/skills_index.json
`

	// If gitignore exists, check for our marker
	existing, err := os.ReadFile(gitignorePath)
	if err == nil {
		if strings.Contains(string(existing), marker) {
			return nil // Already has our patterns
		}
		// Append our patterns to existing content
		combined := strings.TrimRight(string(existing), "\n") + "\n" + patterns
		return os.WriteFile(gitignorePath, []byte(combined), 0644)
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("read .gitignore: %w", err)
	}

	return os.WriteFile(gitignorePath, []byte(patterns), 0644)
}
