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

	// Profile selects which template and hook groups to install.
	// Empty string uses defaultProfile (ProfileFull) for backward compatibility.
	// See InitProfile for semantics.
	Profile InitProfile

	// ConfirmPrune acknowledges that running a lower profile than what's
	// currently installed will delete workflow templates from disk.
	// Without this flag, InitRepo errors rather than prune silently.
	ConfirmPrune bool
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
// Only hooks whose minimum profile is <= the selected profile are installed.
// Hooks that don't belong to the selected profile are REMOVED so downgrading
// cleans up phase-guard etc.
func initHooks(repoRoot string, binaryPath string, profile InitProfile, result *InitResult) error {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}

	needsInstall := !HasAllHooksForProfile(settings, profile)
	needsUpgrade := HooksNeedUpgrade(settings, binaryPath)
	needsDedupe := HooksNeedDedupe(settings)
	hasOutOfProfile := hooksHaveOutOfProfileEntries(settings, profile)

	if needsInstall || needsUpgrade || needsDedupe || hasOutOfProfile {
		AddHooksForProfile(settings, binaryPath, profile)
		if err := WriteClaudeSettings(settingsPath, settings); err != nil {
			return fmt.Errorf("write settings: %w", err)
		}
		result.HooksUpgraded = needsUpgrade && !needsInstall
	}
	result.HooksInstalled = true
	return nil
}

// installTemplates installs template assets gated by the selected profile.
// AGENTS.md, CLAUDE.md, and plugin.json are installed for every profile
// (they're the lesson-capture interface). Template groups branch on profile.
//
// When the selected profile is lower than what's on disk, templates belonging
// to the higher profile would be pruned. To avoid silent data loss, this
// function refuses to prune without ConfirmPrune=true.
func installTemplates(repoRoot string, profile InitProfile, confirmPrune bool, result *InitResult) error {
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

	// Downgrade safety: if the expected set for this profile would delete
	// templates that exist on disk, require explicit acknowledgment.
	if !confirmPrune {
		if stale := detectOutOfProfileTemplates(repoRoot, profile); len(stale) > 0 {
			return fmt.Errorf(
				"profile %q would prune %d existing template path(s) (e.g. %s); "+
					"re-run with ConfirmPrune=true (CLI: --confirm-prune) to proceed",
				profile, len(stale), firstN(stale, 3))
		}
	}

	stack := DetectStack(repoRoot)
	return installTemplateGroups(repoRoot, version, stack, profile, result)
}

// firstN returns a comma-separated preview of up to n elements.
func firstN(ss []string, n int) string {
	if len(ss) > n {
		ss = ss[:n]
	}
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += ", "
		}
		out += s
	}
	return out
}

// installTemplateGroups installs agent, command, skill, role skill, and doc templates,
// gated by profile. Stack info substitutes quality gate placeholders.
//
// Profile gating:
//   - ProfileMinimal:  no template groups run
//   - ProfileWorkflow: agents, commands, phase skills, role skills, doc templates
//   - ProfileFull:     all groups + research tree
//
// The prune step always runs so that downgrades clean up what's no longer
// in the selected profile's expected set. (Downgrade safety is enforced at
// the installTemplates layer.)
func installTemplateGroups(repoRoot string, version string, stack StackInfo, profile InitProfile, result *InitResult) error {
	type installFunc struct {
		fn      func() (int, int, error)
		setN    func(int)
		setU    func(int)
		name    string
		minProf InitProfile
	}
	groups := []installFunc{
		{func() (int, int, error) { return InstallAgentTemplates(repoRoot) },
			func(n int) { result.AgentsInstalled = n }, func(u int) { result.AgentsUpdated = u }, "agent templates", ProfileWorkflow},
		{func() (int, int, error) { return InstallWorkflowCommands(repoRoot) },
			func(n int) { result.CommandsInstalled = n }, func(u int) { result.CommandsUpdated = u }, "workflow commands", ProfileWorkflow},
		{func() (int, int, error) { return InstallPhaseSkills(repoRoot, stack) },
			func(n int) { result.SkillsInstalled = n }, func(u int) { result.SkillsUpdated = u }, "phase skills", ProfileWorkflow},
		{func() (int, int, error) { return InstallAgentRoleSkills(repoRoot) },
			func(n int) { result.RoleSkillsInstalled = n }, func(u int) { result.RoleSkillsUpdated = u }, "agent role skills", ProfileWorkflow},
		{func() (int, int, error) { return InstallDocTemplates(repoRoot, version, stack) },
			func(n int) { result.DocsInstalled = n }, func(u int) { result.DocsUpdated = u }, "doc templates", ProfileWorkflow},
		{func() (int, int, error) { return InstallResearchDocs(repoRoot) },
			func(n int) { result.ResearchInstalled = n }, func(u int) { result.ResearchUpdated = u }, "research docs", ProfileFull},
	}

	for _, g := range groups {
		if !profileIncludes(g.minProf, profile) {
			continue
		}
		n, u, err := g.fn()
		if err != nil {
			return fmt.Errorf("install %s: %w", g.name, err)
		}
		g.setN(n)
		g.setU(u)
	}

	pruned, err := PruneForProfile(repoRoot, profile)
	if err != nil {
		return fmt.Errorf("prune stale templates: %w", err)
	}
	result.TemplatesPruned = pruned

	if profileIncludes(ProfileWorkflow, profile) {
		if err := CompileSkillsIndex(repoRoot); err != nil {
			return fmt.Errorf("compile skills index: %w", err)
		}
	}
	return nil
}

// InitRepo initializes compound-agent in a repository.
// Creates .claude/ structure, lessons index, and optionally installs hooks.
//
// The profile (opts.Profile) gates which template groups and hooks are
// installed. Invalid profiles error BEFORE any filesystem changes.
func InitRepo(repoRoot string, opts InitOptions) (*InitResult, error) {
	// Validate profile BEFORE any filesystem writes so callers can recover
	// cleanly from typos without leaving half-written state.
	if err := validateProfile(opts.Profile); err != nil {
		return nil, err
	}
	opts.Profile = resolveProfile(opts.Profile)

	result := &InitResult{Success: true}

	if err := initDirectories(repoRoot, result); err != nil {
		return nil, err
	}

	if !opts.SkipHooks {
		if err := initHooks(repoRoot, opts.BinaryPath, opts.Profile, result); err != nil {
			return nil, err
		}
	}

	if !opts.SkipTemplates {
		if err := installTemplates(repoRoot, opts.Profile, opts.ConfirmPrune, result); err != nil {
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
