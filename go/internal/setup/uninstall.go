package setup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/setup/templates"
)

// UninstallMode selects the tier of uninstall.
type UninstallMode int

const (
	// UninstallHooksOnly removes only the managed hooks from settings.json.
	// Templates, lessons, runtime state, and marker sections are preserved.
	UninstallHooksOnly UninstallMode = iota

	// UninstallTemplates additionally removes the compound/ template dirs and
	// .claude/plugin.json.
	UninstallTemplates

	// UninstallAll additionally removes .compound-agent/ runtime state and
	// strips compound-agent marker blocks from AGENTS.md, .claude/CLAUDE.md,
	// root .gitignore, and .claude/.gitignore. NEVER touches .claude/lessons/
	// or .claude/compound-agent.json (user-owned data/config).
	UninstallAll
)

// UninstallOptions controls what Uninstall removes.
type UninstallOptions struct {
	Mode UninstallMode
}

// UninstallResult reports what was removed.
type UninstallResult struct {
	HooksRemoved     bool
	TemplatesRemoved []string // compound/ template paths removed
	RuntimeRemoved   bool     // .compound-agent/ removed
	MarkersStripped  []string // files from which compound-agent blocks were stripped
	Empty            bool     // true when nothing was found to uninstall
}

// Uninstall reverses the effect of InitRepo for the selected mode.
// Lessons data (.claude/lessons/) and user config (.claude/compound-agent.json)
// are ALWAYS preserved.
func Uninstall(repoRoot string, opts UninstallOptions) (*UninstallResult, error) {
	result := &UninstallResult{}

	if err := uninstallHooks(repoRoot, result); err != nil {
		return nil, err
	}
	if opts.Mode >= UninstallTemplates {
		if err := uninstallTemplates(repoRoot, result); err != nil {
			return nil, err
		}
	}
	if opts.Mode >= UninstallAll {
		if err := uninstallRuntimeAndMarkers(repoRoot, result); err != nil {
			return nil, err
		}
	}

	result.Empty = !result.HooksRemoved &&
		len(result.TemplatesRemoved) == 0 &&
		!result.RuntimeRemoved &&
		len(result.MarkersStripped) == 0
	return result, nil
}

// uninstallHooks removes the managed compound-agent hooks from settings.json.
func uninstallHooks(repoRoot string, result *UninstallResult) error {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("read settings: %w", err)
	}
	if RemoveAllHooks(settings) {
		if err := WriteClaudeSettings(settingsPath, settings); err != nil {
			return fmt.Errorf("write settings: %w", err)
		}
		result.HooksRemoved = true
	}
	return nil
}

// uninstallTemplates removes the compound/ template directories and plugin.json.
// Real I/O errors (permission denied, read-only FS) propagate so the user
// sees an actionable failure instead of a false-positive "removed" report.
func uninstallTemplates(repoRoot string, result *UninstallResult) error {
	removed, err := removeTemplateDirs(repoRoot)
	if err != nil {
		return err
	}
	result.TemplatesRemoved = removed

	pluginPath := filepath.Join(repoRoot, ".claude", "plugin.json")
	existed, err := removeIfPresent(pluginPath)
	if err != nil {
		return fmt.Errorf("remove .claude/plugin.json: %w", err)
	}
	if existed {
		result.TemplatesRemoved = append(result.TemplatesRemoved, ".claude/plugin.json")
	}
	return nil
}

// uninstallRuntimeAndMarkers removes .compound-agent/ and strips managed
// marker blocks from AGENTS.md, CLAUDE.md, and gitignore files.
func uninstallRuntimeAndMarkers(repoRoot string, result *UninstallResult) error {
	runtimeDir := filepath.Join(repoRoot, ArtifactRoot)
	if info, err := os.Stat(runtimeDir); err == nil && info.IsDir() {
		if err := os.RemoveAll(runtimeDir); err != nil {
			return fmt.Errorf("remove %s: %w", runtimeDir, err)
		}
		result.RuntimeRemoved = true
	}
	stripped, err := stripAllMarkers(repoRoot)
	if err != nil {
		return err
	}
	result.MarkersStripped = stripped
	return nil
}

// PlanUninstall reports what Uninstall would remove without touching anything.
// Used for the dry-run / confirmation message.
func PlanUninstall(repoRoot string, opts UninstallOptions) []string {
	plan := planHooks(repoRoot)
	if opts.Mode >= UninstallTemplates {
		plan = append(plan, planTemplates(repoRoot)...)
	}
	if opts.Mode >= UninstallAll {
		plan = append(plan, planRuntimeAndMarkers(repoRoot)...)
	}
	return plan
}

// planHooks returns a single-entry slice if any managed hook is present,
// or an empty slice otherwise. Hooks are reported as a single line rather
// than per-type because users care about "are hooks installed" more than
// "which hook types are installed".
func planHooks(repoRoot string) []string {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := ReadClaudeSettings(settingsPath)
	if err != nil {
		return nil
	}
	hooksMap, ok := settings["hooks"].(map[string]any)
	if !ok {
		return nil
	}
	for _, spec := range managedHookSpecs {
		arr, ok := hooksMap[spec.hookType].([]any)
		if !ok {
			continue
		}
		if hasHookMarker(arr, spec.markers) {
			return []string{"managed hooks in .claude/settings.json"}
		}
	}
	return nil
}

// planTemplates lists template paths that would be removed.
func planTemplates(repoRoot string) []string {
	var plan []string
	for _, rel := range templateDirsToRemove() {
		if _, err := os.Stat(filepath.Join(repoRoot, rel)); err == nil {
			plan = append(plan, rel+"/")
		}
	}
	if _, err := os.Stat(filepath.Join(repoRoot, ".claude", "plugin.json")); err == nil {
		plan = append(plan, ".claude/plugin.json")
	}
	return plan
}

// planRuntimeAndMarkers lists runtime dir + files with managed marker blocks.
func planRuntimeAndMarkers(repoRoot string) []string {
	var plan []string
	if _, err := os.Stat(filepath.Join(repoRoot, ArtifactRoot)); err == nil {
		plan = append(plan, ArtifactRoot+"/ (runtime state)")
	}
	for _, f := range markerFiles() {
		path := filepath.Join(repoRoot, f)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if containsAnyMarker(string(data)) {
			plan = append(plan, fmt.Sprintf("%s (compound-agent markers)", f))
		}
	}
	return plan
}

// --- helpers ---

func templateDirsToRemove() []string {
	return []string{
		".claude/agents/compound",
		".claude/commands/compound",
		".claude/skills/compound",
		"docs/compound",
	}
}

func removeTemplateDirs(repoRoot string) ([]string, error) {
	var removed []string
	for _, rel := range templateDirsToRemove() {
		full := filepath.Join(repoRoot, rel)
		info, err := os.Stat(full)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			continue
		}
		if err := os.RemoveAll(full); err != nil {
			return removed, fmt.Errorf("remove %s: %w", rel, err)
		}
		removed = append(removed, rel)
	}
	return removed, nil
}

// removeIfPresent removes path, suppressing ErrNotExist. Returns
// (existed, err):
//   - (true,  nil)   on successful removal
//   - (false, nil)   when the file was absent (idempotent no-op)
//   - (false, err)   on any real I/O error (permission, read-only FS, etc.)
//
// Callers should propagate err so users see actionable failures instead of a
// false-positive "removed" report.
func removeIfPresent(path string) (bool, error) {
	err := os.Remove(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}

func markerFiles() []string {
	return []string{
		"AGENTS.md",
		".claude/CLAUDE.md",
		".gitignore",
		".claude/.gitignore",
	}
}

// stripAllMarkers removes compound-agent-managed blocks from marker files.
// Files that end up empty after stripping are deleted.
func stripAllMarkers(repoRoot string) ([]string, error) {
	var stripped []string
	for _, rel := range markerFiles() {
		path := filepath.Join(repoRoot, rel)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		before := string(data)
		after := stripMarkers(before)
		if after == before {
			continue
		}
		stripped = append(stripped, rel)
		if strings.TrimSpace(after) == "" {
			_ = os.Remove(path)
			continue
		}
		if err := os.WriteFile(path, []byte(after), 0644); err != nil {
			return stripped, fmt.Errorf("write %s: %w", rel, err)
		}
	}
	return stripped, nil
}

// stripMarkers removes every known compound-agent-managed block from s.
// Blocks are delimited by start/end comment markers (see templates/embed.go).
func stripMarkers(s string) string {
	for _, pair := range markerPairs() {
		s = removeBlockBetween(s, pair.start, pair.end)
	}
	// Also drop the "# compound-agent managed" block in .gitignore files
	// (used in root .gitignore and .claude/.gitignore).
	s = removeGitignoreBlock(s)
	return s
}

type markerPair struct{ start, end string }

func markerPairs() []markerPair {
	return []markerPair{
		{templates.AgentsSectionStartMarker, templates.AgentsSectionEndMarker},
		{templates.ClaudeRefStartMarker, templates.ClaudeRefEndMarker},
	}
}

// removeBlockBetween deletes the substring from the first occurrence of start
// through the first subsequent end marker (inclusive). Adjacent newlines
// surrounding the block are normalized to avoid leaving double blank lines.
func removeBlockBetween(s, start, end string) string {
	for {
		i := strings.Index(s, start)
		if i < 0 {
			return s
		}
		rest := s[i+len(start):]
		j := strings.Index(rest, end)
		if j < 0 {
			// Unbalanced marker — delete from start to end-of-string as a best-effort cleanup.
			return strings.TrimRight(s[:i], "\n") + "\n"
		}
		endIdx := i + len(start) + j + len(end)
		// Consume one trailing newline if present.
		if endIdx < len(s) && s[endIdx] == '\n' {
			endIdx++
		}
		// Consume a preceding newline if the resulting join would be double-blank.
		prefix := s[:i]
		if strings.HasSuffix(prefix, "\n\n") {
			prefix = prefix[:len(prefix)-1]
		}
		s = prefix + s[endIdx:]
	}
}

// removeGitignoreBlock drops the "# compound-agent managed" block from a
// .gitignore-style file. The block starts with the marker line and runs
// until a blank line or end of file.
func removeGitignoreBlock(s string) string {
	const marker = "# compound-agent managed"
	idx := strings.Index(s, marker)
	if idx < 0 {
		return s
	}
	// Walk back to start of the marker line.
	start := idx
	for start > 0 && s[start-1] != '\n' {
		start--
	}
	rest := s[start:]
	blankIdx := strings.Index(rest, "\n\n")
	var end int
	if blankIdx >= 0 {
		end = start + blankIdx + 1 // keep the first \n, drop until the second
	} else {
		end = len(s)
	}
	prefix := strings.TrimRight(s[:start], "\n")
	suffix := s[end:]
	if prefix == "" {
		return strings.TrimLeft(suffix, "\n")
	}
	if suffix == "" {
		return prefix + "\n"
	}
	return prefix + "\n" + strings.TrimLeft(suffix, "\n")
}

func containsAnyMarker(s string) bool {
	for _, pair := range markerPairs() {
		if strings.Contains(s, pair.start) {
			return true
		}
	}
	return strings.Contains(s, "# compound-agent managed")
}
