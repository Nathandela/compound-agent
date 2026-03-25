//go:build sqlite_fts5

package templates

import (
	"regexp"
	"testing"
)

// TestTemplateDrift_ReviewerNamesMatchAgentRoleSkills verifies that every
// reviewer name mentioned in the review SKILL.md role-skill paths and bold
// references has a corresponding agent-role-skill directory in the embedded
// templates. This prevents drift when reviewer agent directories are renamed
// but the review template is not updated to match.
//
// Extraction targets precise references only (brace-expanded paths, bold
// names, backtick-quoted names). The tier description shorthand (e.g.,
// "security, test-coverage") is intentionally excluded since those are
// informal abbreviations, not agent directory names.
func TestTemplateDrift_ReviewerNamesMatchAgentRoleSkills(t *testing.T) {
	review := requireSkill(t, PhaseSkills(), "review")
	validRoles := AgentRoleSkills()

	// Pattern 1: Brace-expanded role skill paths {name1,name2,...}
	braceRe := regexp.MustCompile(`\{([\w,-]+)\}`)
	// Pattern 2: Bold reviewer names **name** that contain a hyphen (agent names)
	boldRe := regexp.MustCompile(`\*\*([\w]+-[\w-]+)\*\*`)
	// Pattern 3: Backtick-quoted agent names `name` that contain a hyphen
	backtickRe := regexp.MustCompile("`(\\w+-[\\w-]+)`")
	// Pattern 4: Comma-separated names after "including" in tier lines
	includingRe := regexp.MustCompile(`including\s+([\w-]+(?:,\s*[\w-]+)*)`)
	// Hyphenated name token extractor
	hyphenatedRe := regexp.MustCompile(`[\w]+-[\w-]+`)

	nameSet := make(map[string]bool)

	// Extract from brace-expanded paths (most precise: these are directory names)
	for _, m := range braceRe.FindAllStringSubmatch(review, -1) {
		for _, n := range hyphenatedRe.FindAllString(m[1], -1) {
			nameSet[n] = true
		}
	}

	// Extract bold agent names from prose sections
	for _, m := range boldRe.FindAllStringSubmatch(review, -1) {
		nameSet[m[1]] = true
	}

	// Extract backtick-quoted agent names
	for _, m := range backtickRe.FindAllStringSubmatch(review, -1) {
		nameSet[m[1]] = true
	}

	// Extract names from "including X, Y, Z" tier descriptions
	for _, m := range includingRe.FindAllStringSubmatch(review, -1) {
		for _, n := range hyphenatedRe.FindAllString(m[1], -1) {
			nameSet[n] = true
		}
	}

	// Remove non-agent tokens that match the hyphen pattern but aren't agent names
	nonAgentTokens := []string{
		"ca-search", "P0-P3", "P1-P2", "well-known",
		"role-name", "sqlite-fts5", "go-embed",
	}
	for _, tok := range nonAgentTokens {
		delete(nameSet, tok)
	}

	if len(nameSet) == 0 {
		t.Fatal("failed to extract any reviewer names from review SKILL.md")
	}

	// Known names that must be extracted as a baseline regression check.
	expectedMinimum := []string{
		"security-reviewer",
		"architecture-reviewer",
		"performance-reviewer",
		"test-coverage-reviewer",
		"simplicity-reviewer",
		"scenario-coverage-reviewer",
		"pattern-matcher",
		"cct-subagent",
		"doc-gardener",
		"drift-detector",
		"runtime-verifier",
	}
	for _, name := range expectedMinimum {
		if !nameSet[name] {
			t.Errorf("expected reviewer %q was not extracted from review template -- regex may need updating", name)
		}
	}

	// Verify each extracted name has a matching agent role skill directory.
	for name := range nameSet {
		if _, ok := validRoles[name]; !ok {
			t.Errorf("reviewer %q is referenced in review SKILL.md but has no agent-role-skill directory", name)
		}
	}

	t.Logf("verified %d reviewer names against %d agent role skills", len(nameSet), len(validRoles))
}
