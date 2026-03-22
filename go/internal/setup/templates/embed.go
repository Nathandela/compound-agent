// Package templates provides embedded template files for compound-agent setup.
// Templates are embedded at compile time using //go:embed directives.
package templates

import (
	"embed"
	"io/fs"
	"path"
	"strings"
)

//go:embed agents/*.md
var agentsFS embed.FS

//go:embed commands/*.md
var commandsFS embed.FS

//go:embed skills/*/SKILL.md skills/*/references/*.md
var skillsFS embed.FS

//go:embed agent-role-skills/*/SKILL.md
var agentRoleSkillsFS embed.FS

//go:embed docs/*.md
var docsFS embed.FS

//go:embed agents-md.md
var agentsMdTemplate string

//go:embed claude-md-reference.md
var claudeMdReference string

//go:embed plugin.json
var pluginJSON string

// Markers for idempotent section detection.
const (
	CompoundAgentSectionHeader = "## Compound Agent Integration"
	ClaudeRefStartMarker       = "<!-- compound-agent:claude-ref:start -->"
	ClaudeRefEndMarker         = "<!-- compound-agent:claude-ref:end -->"
	AgentsSectionStartMarker   = "<!-- compound-agent:start -->"
	AgentsSectionEndMarker     = "<!-- compound-agent:end -->"
)

// AgentsMdTemplate returns the AGENTS.md section template.
func AgentsMdTemplate() string {
	return agentsMdTemplate
}

// ClaudeMdReference returns the CLAUDE.md reference snippet.
func ClaudeMdReference() string {
	return claudeMdReference
}

// PluginJSON returns the plugin.json template with {{VERSION}} placeholder.
func PluginJSON() string {
	return pluginJSON
}

// AgentTemplates returns a map of filename -> content for agent .md files.
func AgentTemplates() map[string]string {
	return readEmbedDir(agentsFS, "agents")
}

// CommandTemplates returns a map of filename -> content for command .md files.
func CommandTemplates() map[string]string {
	return readEmbedDir(commandsFS, "commands")
}

// PhaseSkills returns a map of phase-name -> SKILL.md content.
func PhaseSkills() map[string]string {
	result := make(map[string]string)
	_ = fs.WalkDir(skillsFS, "skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if path.Base(p) == "SKILL.md" {
			// Extract phase name: "skills/<phase>/SKILL.md" -> "<phase>"
			parts := strings.Split(p, "/")
			if len(parts) >= 3 {
				phase := parts[1]
				data, readErr := fs.ReadFile(skillsFS, p)
				if readErr == nil {
					result[phase] = string(data)
				}
			}
		}
		return nil
	})
	return result
}

// PhaseSkillReferences returns a map of "phase/relative-path" -> content
// for reference files alongside phase skills.
func PhaseSkillReferences() map[string]string {
	result := make(map[string]string)
	_ = fs.WalkDir(skillsFS, "skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if path.Base(p) == "SKILL.md" {
			return nil // Skip SKILL.md itself
		}
		// Path: "skills/<phase>/references/<file>.md"
		// Key: "<phase>/references/<file>.md"
		parts := strings.Split(p, "/")
		if len(parts) >= 2 {
			relPath := strings.Join(parts[1:], "/") // strip "skills/" prefix
			data, readErr := fs.ReadFile(skillsFS, p)
			if readErr == nil {
				result[relPath] = string(data)
			}
		}
		return nil
	})
	return result
}

// AgentRoleSkills returns a map of role-name -> SKILL.md content.
func AgentRoleSkills() map[string]string {
	result := make(map[string]string)
	_ = fs.WalkDir(agentRoleSkillsFS, "agent-role-skills", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if path.Base(p) == "SKILL.md" {
			// Extract role name: "agent-role-skills/<role>/SKILL.md" -> "<role>"
			parts := strings.Split(p, "/")
			if len(parts) >= 3 {
				role := parts[1]
				data, readErr := fs.ReadFile(agentRoleSkillsFS, p)
				if readErr == nil {
					result[role] = string(data)
				}
			}
		}
		return nil
	})
	return result
}

// DocTemplates returns a map of filename -> content for documentation .md files.
// Content includes {{VERSION}} and {{DATE}} placeholders for substitution.
func DocTemplates() map[string]string {
	return readEmbedDir(docsFS, "docs")
}

// readEmbedDir reads all files from an embedded FS directory into a map.
func readEmbedDir(fsys embed.FS, dir string) map[string]string {
	result := make(map[string]string)
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return result
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		data, readErr := fs.ReadFile(fsys, path.Join(dir, entry.Name()))
		if readErr == nil {
			result[entry.Name()] = string(data)
		}
	}
	return result
}
