package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/build"
)

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

	return EnsureGitignore(repoRoot)
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
.ca-phase-state.json
.ca-failure-state.json
.ca-read-state.json
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
