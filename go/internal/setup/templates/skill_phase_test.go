package templates

import (
	"strings"
	"testing"
)

// validSkillPhases are the phase values allowed in SKILL.md frontmatter.
// Must match hook.ValidSkillPhases.
var validSkillPhases = map[string]bool{
	"spec-dev": true, "plan": true, "work": true,
	"review": true, "compound": true, "architect": true,
}

// expectedPhaseMapping defines the expected phase for each skill directory.
// Skills without an entry here are expected to have NO phase (load-all fallback).
var expectedPhaseMapping = map[string]string{
	"spec-dev":           "spec-dev",
	"plan":               "plan",
	"work":               "work",
	"review":             "review",
	"compound":           "compound",
	"architect":          "architect",
	"researcher":         "spec-dev",
	"agentic":            "work",
	"test-cleaner":       "review",
	"build-great-things": "work",
	"qa-engineer":        "review",
	// cook-it: no phase (orchestrator, REQ-S3 fallback)
}

// extractPhase extracts the phase field from YAML frontmatter.
// Returns ("", false) if no phase field is found.
func extractPhase(content string) (string, bool) {
	lines := strings.Split(content, "\n")
	inFrontmatter := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			if inFrontmatter {
				break // end of frontmatter
			}
			inFrontmatter = true
			continue
		}
		if inFrontmatter && strings.HasPrefix(trimmed, "phase:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "phase:"))
			return val, true
		}
	}
	return "", false
}

// TestPhaseSkills_AllHaveValidPhaseField verifies that every SKILL.md that
// should have a phase field has one, and that the value is valid.
func TestPhaseSkills_AllHaveValidPhaseField(t *testing.T) {
	skills := PhaseSkills()

	for dir, expectedPhase := range expectedPhaseMapping {
		content, ok := skills[dir]
		if !ok {
			t.Errorf("missing skill: %s", dir)
			continue
		}
		phase, found := extractPhase(content)
		if !found {
			t.Errorf("skill %s: missing phase field in frontmatter", dir)
			continue
		}
		if phase != expectedPhase {
			t.Errorf("skill %s: phase = %q, want %q", dir, phase, expectedPhase)
		}
		if !validSkillPhases[phase] {
			t.Errorf("skill %s: invalid phase %q", dir, phase)
		}
	}
}

// TestPhaseSkills_CookItHasNoPhase verifies that cook-it (the orchestrator)
// does NOT have a phase field, relying on REQ-S3 load-all fallback.
func TestPhaseSkills_CookItHasNoPhase(t *testing.T) {
	skills := PhaseSkills()
	content, ok := skills["cook-it"]
	if !ok {
		t.Fatal("missing cook-it skill")
	}
	_, found := extractPhase(content)
	if found {
		t.Error("cook-it should NOT have a phase field (it is an orchestrator)")
	}
}

// TestPhaseSkills_PhaseValuesMatchPhaseState verifies that every phase value
// used in SKILL.md frontmatter is a recognized phase in ValidSkillPhases.
func TestPhaseSkills_PhaseValuesMatchPhaseState(t *testing.T) {
	skills := PhaseSkills()
	for dir, content := range skills {
		phase, found := extractPhase(content)
		if !found {
			continue // No phase = fallback, OK
		}
		if !validSkillPhases[phase] {
			t.Errorf("skill %s has unrecognized phase %q", dir, phase)
		}
	}
}

// TestPhaseSkills_FrontmatterHasRequiredFields verifies REQ-U3: every skill
// SHALL have name, description, phase in frontmatter. Phase is optional only
// for orchestrator skills (cook-it).
func TestPhaseSkills_FrontmatterHasRequiredFields(t *testing.T) {
	skills := PhaseSkills()
	orchestrators := map[string]bool{"cook-it": true}

	for dir, content := range skills {
		lines := strings.Split(content, "\n")
		hasName := false
		hasDescription := false
		hasPhase := false
		inFrontmatter := false

		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "---" {
				if inFrontmatter {
					break
				}
				inFrontmatter = true
				continue
			}
			if inFrontmatter {
				if strings.HasPrefix(trimmed, "name:") {
					hasName = true
				}
				if strings.HasPrefix(trimmed, "description:") {
					hasDescription = true
				}
				if strings.HasPrefix(trimmed, "phase:") {
					hasPhase = true
				}
			}
		}

		if !hasName {
			t.Errorf("skill %s: missing name in frontmatter (REQ-U3)", dir)
		}
		if !hasDescription {
			t.Errorf("skill %s: missing description in frontmatter (REQ-U3)", dir)
		}
		if !hasPhase && !orchestrators[dir] {
			t.Errorf("skill %s: missing phase in frontmatter (REQ-U3)", dir)
		}
	}
}
