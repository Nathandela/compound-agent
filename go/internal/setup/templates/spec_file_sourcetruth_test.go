package templates

import "testing"

// TestSpecFile_SourceOfTruth pins the spec-as-file source-of-truth contract
// across the phase skills. The spec FILE (docs/specs/<epic-id>-<slug>.md) is the
// single source of truth; the beads epic description becomes a short pointer stub.
// These are DESIGN-only string assertions: they verify the canonical SKILL.md
// content, not runtime behavior.

// specFileFallbackPhrase is the exact pointer-resolution fallback wording every
// downstream reader (work, review, compound) must carry for legacy epics.
const specFileFallbackPhrase = "fall back to reading the spec from the epic description"

// TestSpecFile_SpecDevWritesSpecFile asserts spec-dev owns the spec FILE: it
// references the docs/specs path + naming convention, the append-only
// "## Amendments" section, the "Spec:" pointer-stub language, and index.md
// registration.
func TestSpecFile_SpecDevWritesSpecFile(t *testing.T) {
	specDev := requireSkill(t, PhaseSkills(), "spec-dev")

	cases := []struct {
		name   string
		substr string
		msg    string
	}{
		{"specs_dir", "docs/specs/", "spec-dev missing docs/specs/ path"},
		{"file_naming", "<epic-id>-<slug>.md", "spec-dev missing <epic-id>-<slug>.md naming convention"},
		{"amendments_section", "## Amendments", "spec-dev missing ## Amendments section"},
		{"pointer_stub", "Spec:", "spec-dev missing Spec: pointer-stub language"},
		{"index_registration", "index.md", "spec-dev missing index.md registration"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertContains(t, specDev, tc.substr, tc.msg)
		})
	}
}

// TestSpecFile_PlanAppendsACVCToFile asserts the plan phase appends Acceptance
// Criteria / Verification Contract to the spec FILE (not the epic description):
// it both generates the AC table and references the docs/specs file.
func TestSpecFile_PlanAppendsACVCToFile(t *testing.T) {
	plan := requireSkill(t, PhaseSkills(), "plan")

	t.Run("generates_AC_table", func(t *testing.T) {
		assertContains(t, plan, "Generate Acceptance Criteria table", "plan missing AC table generation")
	})
	t.Run("targets_spec_file", func(t *testing.T) {
		assertContains(t, plan, "docs/specs", "plan missing docs/specs spec-file target for AC/VC")
	})
	t.Run("verification_contract", func(t *testing.T) {
		assertContains(t, plan, "Verification Contract", "plan missing Verification Contract")
	})
}

// TestSpecFile_DownstreamFallback asserts work, review, and compound each carry
// the exact pointer-resolution fallback phrase for legacy epics.
func TestSpecFile_DownstreamFallback(t *testing.T) {
	skills := PhaseSkills()
	for _, name := range []string{"work", "review", "compound"} {
		t.Run(name, func(t *testing.T) {
			content := requireSkill(t, skills, name)
			assertContains(t, content, specFileFallbackPhrase, name+" missing spec-file fallback phrase")
		})
	}
}

// TestSpecFile_CookItGateReferencesSpecFile asserts the cook-it gate references
// the spec file: both the Acceptance Criteria gate and the docs/specs location.
func TestSpecFile_CookItGateReferencesSpecFile(t *testing.T) {
	cookIt := requireSkill(t, PhaseSkills(), "cook-it")

	t.Run("acceptance_criteria_gate", func(t *testing.T) {
		assertContains(t, cookIt, "Acceptance Criteria", "cook-it gate missing Acceptance Criteria")
	})
	t.Run("spec_file_reference", func(t *testing.T) {
		assertContains(t, cookIt, "docs/specs", "cook-it gate missing docs/specs spec-file reference")
	})
}
