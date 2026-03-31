package hook

import "fmt"

// ValidSkillPhases lists all valid phase values for skill frontmatter.
// This is a superset of Phases (cook-it cycle) — it also includes standalone
// phases like "architect" that operate outside the 5-phase cycle.
var ValidSkillPhases = []string{
	"spec-dev", "plan", "work", "review", "compound", "architect",
}

// validSkillPhaseSet provides O(1) lookup for IsValidSkillPhase.
var validSkillPhaseSet = func() map[string]bool {
	m := make(map[string]bool, len(ValidSkillPhases))
	for _, p := range ValidSkillPhases {
		m[p] = true
	}
	return m
}()

// IsValidSkillPhase returns true if phase is a recognized skill phase value.
func IsValidSkillPhase(phase string) bool {
	return validSkillPhaseSet[phase]
}

// ResolveSkillPath returns the canonical skill file path for a given phase.
// This replaces the hardcoded fmt.Sprintf pattern in phase_guard.go.
func ResolveSkillPath(phase string) string {
	return fmt.Sprintf(".claude/skills/compound/%s/SKILL.md", phase)
}
