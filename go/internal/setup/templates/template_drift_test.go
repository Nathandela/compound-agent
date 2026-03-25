//go:build sqlite_fts5

package templates

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

// TestTemplateDrift_ResearchSourceMatchesEmbed verifies that the source
// research tree (docs/compound/research/) and the embedded copy
// (go/internal/setup/templates/docs/research/) contain exactly the same
// set of files. Catches drift when a file is added to the source but not
// copied into the embedded templates (or vice versa).
func TestTemplateDrift_ResearchSourceMatchesEmbed(t *testing.T) {
	// Walk up from the test file to find the repo root (contains go.mod).
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	repoRoot := wd
	for {
		if _, err := os.Stat(filepath.Join(repoRoot, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(repoRoot)
		if parent == repoRoot {
			t.Skip("could not find repo root (go.mod)")
			return
		}
		repoRoot = parent
	}
	// Go up one more level since go.mod is inside go/
	repoRoot = filepath.Dir(repoRoot)

	sourceDir := filepath.Join(repoRoot, "docs", "compound", "research")
	if _, err := os.Stat(sourceDir); os.IsNotExist(err) {
		t.Skip("source research dir not found (running outside repo)")
		return
	}

	// Collect source files
	sourceFiles := make(map[string]bool)
	err = filepath.Walk(sourceDir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(sourceDir, p)
		sourceFiles[filepath.ToSlash(rel)] = true
		return nil
	})
	if err != nil {
		t.Fatalf("walk source: %v", err)
	}

	// Collect embedded files
	embeddedFiles := ResearchDocs()

	// Check source -> embedded
	for f := range sourceFiles {
		if _, ok := embeddedFiles[f]; !ok {
			t.Errorf("source file %q exists in docs/compound/research/ but not in embedded templates", f)
		}
	}

	// Check embedded -> source
	for f := range embeddedFiles {
		if !sourceFiles[f] {
			t.Errorf("embedded file %q exists in templates but not in docs/compound/research/", f)
		}
	}

	t.Logf("verified %d source files match %d embedded files", len(sourceFiles), len(embeddedFiles))
}

// TestTemplateDrift_ResearchReferencesResolve verifies that all
// docs/compound/research/ path references in skill and agent-role-skill
// templates point to files that exist in the embedded research tree.
func TestTemplateDrift_ResearchReferencesResolve(t *testing.T) {
	researchDocs := ResearchDocs()

	// Build set of known research directories
	researchDirs := make(map[string]bool)
	for relPath := range researchDocs {
		for dir := filepath.Dir(relPath); dir != "." && dir != ""; dir = filepath.Dir(dir) {
			researchDirs[dir] = true
		}
	}

	// Pattern: docs/compound/research/some/path
	refRe := regexp.MustCompile("`docs/compound/research/([^`]+)`")

	// Check all phase skills
	for phase, content := range PhaseSkills() {
		for _, m := range refRe.FindAllStringSubmatch(content, -1) {
			checkResearchRef(t, "skill:"+phase, m[1], researchDocs, researchDirs)
		}
	}
	for relPath, content := range PhaseSkillReferences() {
		for _, m := range refRe.FindAllStringSubmatch(content, -1) {
			checkResearchRef(t, "skill-ref:"+relPath, m[1], researchDocs, researchDirs)
		}
	}

	// Check all agent role skills
	for role, content := range AgentRoleSkills() {
		for _, m := range refRe.FindAllStringSubmatch(content, -1) {
			checkResearchRef(t, "role:"+role, m[1], researchDocs, researchDirs)
		}
	}
	for relPath, content := range AgentRoleSkillReferences() {
		for _, m := range refRe.FindAllStringSubmatch(content, -1) {
			checkResearchRef(t, "role-ref:"+relPath, m[1], researchDocs, researchDirs)
		}
	}
}

// checkResearchRef validates a single research path reference.
func checkResearchRef(t *testing.T, source, ref string, docs map[string]string, dirs map[string]bool) {
	t.Helper()
	ref = strings.TrimSuffix(ref, "/")
	// Could be a file or directory reference
	if _, ok := docs[ref]; ok {
		return // exact file match
	}
	if dirs[ref] {
		return // directory reference
	}
	t.Errorf("%s references docs/compound/research/%s which does not exist in embedded research tree", source, ref)
}
