package setup

import "fmt"

// InitProfile selects which template and hook groups are installed.
// Profiles are ordered: minimal < workflow < full. A hook or template
// is installed when its minimum profile is <= the selected profile.
type InitProfile string

const (
	// ProfileMinimal installs only lesson-capture plumbing: lessons dir,
	// AGENTS.md integration section, plugin.json, and two Claude Code hooks
	// (SessionStart/PreCompact prime + UserPromptSubmit reminder).
	// No commands, no phase skills, no agent role skills, no docs, no research.
	ProfileMinimal InitProfile = "minimal"

	// ProfileWorkflow adds the five-phase cook-it workflow on top of minimal:
	// all commands, phase skills, agent role skills, doc templates, plus the
	// phase-related hooks (phase-guard, post-read, phase-audit,
	// post-tool-failure, post-tool-success). Excludes the research tree.
	ProfileWorkflow InitProfile = "workflow"

	// ProfileFull is every template group plus the research tree
	// (docs/compound/research/). This matches the pre-profiles behavior.
	ProfileFull InitProfile = "full"
)

// defaultProfile is applied when InitOptions.Profile is unset.
// It MUST remain ProfileFull for backward compatibility.
const defaultProfile = ProfileFull

// profileRank maps profiles to ordered ranks. Higher rank = more installed.
var profileRank = map[InitProfile]int{
	ProfileMinimal:  0,
	ProfileWorkflow: 1,
	ProfileFull:     2,
}

// validateProfile accepts the empty string (treated as default) plus the
// three named constants. Case-sensitive: "MINIMAL" is rejected.
func validateProfile(p InitProfile) error {
	if p == "" {
		return nil
	}
	if _, ok := profileRank[p]; !ok {
		return fmt.Errorf("unknown profile %q: valid values are %q, %q, %q",
			string(p), ProfileMinimal, ProfileWorkflow, ProfileFull)
	}
	return nil
}

// resolveProfile returns the effective profile, applying the default when unset.
func resolveProfile(p InitProfile) InitProfile {
	if p == "" {
		return defaultProfile
	}
	return p
}

// profileIncludes reports whether the given `required` profile level is
// satisfied by `selected`. Use this to gate hook/template installation.
//
//	profileIncludes(ProfileWorkflow, ProfileMinimal) → false (minimal selected, workflow required)
//	profileIncludes(ProfileMinimal,  ProfileFull)    → true
func profileIncludes(required, selected InitProfile) bool {
	return profileRank[selected] >= profileRank[required]
}
