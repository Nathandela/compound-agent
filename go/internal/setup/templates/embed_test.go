package templates

import (
	"strings"
	"testing"
)

func TestAgentTemplates(t *testing.T) {
	agents := AgentTemplates()
	if len(agents) == 0 {
		t.Fatal("expected agent templates, got none")
	}

	// Verify expected agents exist
	expected := []string{
		"repo-analyst.md", "memory-analyst.md", "audit.md",
		"doc-gardener.md", "cct-subagent.md", "drift-detector.md",
		"external-reviewer-gemini.md", "external-reviewer-codex.md",
		"lessons-reviewer.md", "lint-classifier.md",
	}
	for _, name := range expected {
		content, ok := agents[name]
		if !ok {
			t.Errorf("missing agent template: %s", name)
			continue
		}
		if !strings.Contains(content, "---") {
			t.Errorf("agent %s missing frontmatter", name)
		}
	}
	t.Logf("agent templates: %d", len(agents))
}

func TestCommandTemplates(t *testing.T) {
	commands := CommandTemplates()
	if len(commands) == 0 {
		t.Fatal("expected command templates, got none")
	}

	// Verify expected commands exist
	expected := []string{
		"spec-dev.md", "plan.md", "work.md", "review.md",
		"compound.md", "cook-it.md", "research.md", "test-clean.md",
		"learn-that.md", "check-that.md", "prime.md",
	}
	for _, name := range expected {
		content, ok := commands[name]
		if !ok {
			t.Errorf("missing command template: %s", name)
			continue
		}
		if !strings.Contains(content, "name: compound:") && !strings.Contains(content, "# ") {
			t.Errorf("command %s missing expected content", name)
		}
	}
	t.Logf("command templates: %d", len(commands))
}

func TestPhaseSkills(t *testing.T) {
	skills := PhaseSkills()
	if len(skills) == 0 {
		t.Fatal("expected phase skills, got none")
	}

	// Verify expected phases exist
	expected := []string{
		"spec-dev", "plan", "work", "review", "compound",
		"cook-it", "researcher", "test-cleaner", "agentic", "architect",
		"qa-engineer",
	}
	for _, phase := range expected {
		content, ok := skills[phase]
		if !ok {
			t.Errorf("missing phase skill: %s", phase)
			continue
		}
		if !strings.Contains(content, "---") {
			t.Errorf("phase skill %s missing frontmatter", phase)
		}
	}
	t.Logf("phase skills: %d", len(skills))
}

func TestPhaseSkills_QualityGatePlaceholders(t *testing.T) {
	skills := PhaseSkills()

	// Skills that must have quality gate placeholders
	needsPlaceholders := []string{"cook-it", "review", "work", "compound", "agentic", "test-cleaner"}
	for _, phase := range needsPlaceholders {
		content, ok := skills[phase]
		if !ok {
			t.Errorf("missing phase skill: %s", phase)
			continue
		}
		if !strings.Contains(content, "{{QUALITY_GATE_TEST}}") {
			t.Errorf("phase skill %s missing {{QUALITY_GATE_TEST}} placeholder", phase)
		}
		if !strings.Contains(content, "{{QUALITY_GATE_LINT}}") {
			t.Errorf("phase skill %s missing {{QUALITY_GATE_LINT}} placeholder", phase)
		}
		// Verify no hardcoded pnpm commands remain
		if strings.Contains(content, "pnpm test") || strings.Contains(content, "pnpm lint") {
			t.Errorf("phase skill %s still has hardcoded pnpm commands", phase)
		}
	}
}

func TestPhaseSkillReferences(t *testing.T) {
	refs := PhaseSkillReferences()
	if len(refs) == 0 {
		t.Fatal("expected phase skill references, got none")
	}

	// Verify spec-dev reference
	if _, ok := refs["spec-dev/references/spec-guide.md"]; !ok {
		t.Error("missing spec-dev/references/spec-guide.md")
	}

	// Verify architect advisory-fleet reference
	if _, ok := refs["architect/references/advisory-fleet.md"]; !ok {
		t.Error("missing architect/references/advisory-fleet.md")
	}

	// Verify qa-engineer references
	expectedQAEngineer := []string{
		"qa-engineer/references/exploratory-testing.md",
		"qa-engineer/references/browser-automation.md",
		"qa-engineer/references/constitution-schema.md",
	}
	for _, refPath := range expectedQAEngineer {
		if _, ok := refs[refPath]; !ok {
			t.Errorf("missing %s", refPath)
		}
	}

	// Verify architect infinity-loop reference directory (nested)
	expectedInfinityLoop := []string{
		"architect/references/infinity-loop/README.md",
		"architect/references/infinity-loop/pre-flight.md",
		"architect/references/infinity-loop/memory-safety.md",
		"architect/references/infinity-loop/epic-ordering.md",
		"architect/references/infinity-loop/logging.md",
		"architect/references/infinity-loop/review-fleet.md",
		"architect/references/infinity-loop/troubleshooting.md",
	}
	for _, refPath := range expectedInfinityLoop {
		if _, ok := refs[refPath]; !ok {
			t.Errorf("missing %s", refPath)
		}
	}
	t.Logf("phase skill references: %d", len(refs))
}

func TestAgentRoleSkills(t *testing.T) {
	roles := AgentRoleSkills()
	if len(roles) == 0 {
		t.Fatal("expected agent role skills, got none")
	}

	// Verify expected roles exist
	expected := []string{
		"repo-analyst", "memory-analyst", "security-reviewer",
		"architecture-reviewer", "performance-reviewer",
		"test-coverage-reviewer", "simplicity-reviewer",
		"context-analyzer", "lesson-extractor", "pattern-matcher",
		"solution-writer", "test-writer", "implementer",
		"compounding", "audit", "doc-gardener", "cct-subagent",
		"drift-detector", "scenario-coverage-reviewer",
		"security-injection", "security-secrets", "security-auth",
		"security-data", "security-deps",
	}
	for _, role := range expected {
		content, ok := roles[role]
		if !ok {
			t.Errorf("missing agent role skill: %s", role)
			continue
		}
		if !strings.Contains(content, "---") {
			t.Errorf("agent role skill %s missing frontmatter", role)
		}
	}
	t.Logf("agent role skills: %d", len(roles))
}

func TestDocTemplates(t *testing.T) {
	docs := DocTemplates()
	if len(docs) == 0 {
		t.Fatal("expected doc templates, got none")
	}

	// Verify expected docs exist
	expected := []string{
		"README.md", "WORKFLOW.md", "CLI_REFERENCE.md",
		"SKILLS.md", "INTEGRATION.md",
	}
	for _, name := range expected {
		content, ok := docs[name]
		if !ok {
			t.Errorf("missing doc template: %s", name)
			continue
		}
		// Verify placeholders are present
		if !strings.Contains(content, "{{VERSION}}") {
			t.Errorf("doc %s missing {{VERSION}} placeholder", name)
		}
		if !strings.Contains(content, "{{DATE}}") {
			t.Errorf("doc %s missing {{DATE}} placeholder", name)
		}
	}
	t.Logf("doc templates: %d", len(docs))
}

func TestDocTemplates_QualityGatePlaceholders(t *testing.T) {
	docs := DocTemplates()
	// WORKFLOW.md should have quality gate placeholders
	content, ok := docs["WORKFLOW.md"]
	if !ok {
		t.Fatal("missing WORKFLOW.md doc template")
	}
	if !strings.Contains(content, "{{QUALITY_GATE_TEST}}") {
		t.Error("WORKFLOW.md missing {{QUALITY_GATE_TEST}} placeholder")
	}
	if !strings.Contains(content, "{{QUALITY_GATE_LINT}}") {
		t.Error("WORKFLOW.md missing {{QUALITY_GATE_LINT}} placeholder")
	}
	if strings.Contains(content, "pnpm test") || strings.Contains(content, "pnpm lint") {
		t.Error("WORKFLOW.md still has hardcoded pnpm commands")
	}
}

func TestAgentsMdTemplate(t *testing.T) {
	tmpl := AgentsMdTemplate()
	if tmpl == "" {
		t.Fatal("AGENTS.md template is empty")
	}
	if !strings.Contains(tmpl, CompoundAgentSectionHeader) {
		t.Error("AGENTS.md template missing section header")
	}
	if !strings.Contains(tmpl, AgentsSectionStartMarker) {
		t.Error("AGENTS.md template missing start marker")
	}
	if !strings.Contains(tmpl, AgentsSectionEndMarker) {
		t.Error("AGENTS.md template missing end marker")
	}
}

func TestClaudeMdReference(t *testing.T) {
	ref := ClaudeMdReference()
	if ref == "" {
		t.Fatal("CLAUDE.md reference is empty")
	}
	if !strings.Contains(ref, ClaudeRefStartMarker) {
		t.Error("CLAUDE.md reference missing start marker")
	}
	if !strings.Contains(ref, ClaudeRefEndMarker) {
		t.Error("CLAUDE.md reference missing end marker")
	}
}

func TestPluginJSON(t *testing.T) {
	pj := PluginJSON()
	if pj == "" {
		t.Fatal("plugin.json template is empty")
	}
	if !strings.Contains(pj, "compound-agent") {
		t.Error("plugin.json missing compound-agent name")
	}
	if !strings.Contains(pj, "{{VERSION}}") {
		t.Error("plugin.json missing {{VERSION}} placeholder")
	}
}

func TestResearchDocs(t *testing.T) {
	docs := ResearchDocs()
	if len(docs) == 0 {
		t.Fatal("expected research docs, got none")
	}

	// Verify expected research files exist (spot check key paths)
	expected := []string{
		"index.md",
		"security/overview.md",
		"security/injection-patterns.md",
		"tdd/test-driven-development-methodology.md",
		"code-review/systematic-review-methodology.md",
		"learning-systems/knowledge-compounding-for-agents.md",
		"property-testing/property-based-testing-and-invariants.md",
	}
	for _, relPath := range expected {
		content, ok := docs[relPath]
		if !ok {
			t.Errorf("missing research doc: %s", relPath)
			continue
		}
		if len(content) == 0 {
			t.Errorf("research doc %s is empty", relPath)
		}
	}

	// Verify nested directories are included
	hasNested := false
	for key := range docs {
		if strings.Contains(key, "/") {
			hasNested = true
			break
		}
	}
	if !hasNested {
		t.Error("research docs should include nested paths (e.g., security/overview.md)")
	}

	t.Logf("research docs: %d", len(docs))
}

func TestConstants(t *testing.T) {
	if CompoundAgentSectionHeader == "" {
		t.Error("CompoundAgentSectionHeader is empty")
	}
	if ClaudeRefStartMarker == "" {
		t.Error("ClaudeRefStartMarker is empty")
	}
	if ClaudeRefEndMarker == "" {
		t.Error("ClaudeRefEndMarker is empty")
	}
	if AgentsSectionStartMarker == "" {
		t.Error("AgentsSectionStartMarker is empty")
	}
	if AgentsSectionEndMarker == "" {
		t.Error("AgentsSectionEndMarker is empty")
	}
}
