package templates

import (
	"strings"
	"testing"
)

// requireSkill loads a phase skill template, failing the test if missing.
func requireSkill(t *testing.T, skills map[string]string, name string) string {
	t.Helper()
	content, ok := skills[name]
	if !ok {
		t.Fatalf("missing %s skill template", name)
	}
	return content
}

// assertContains checks that content contains substr, reporting msg on failure.
func assertContains(t *testing.T, content, substr, msg string) {
	t.Helper()
	if !strings.Contains(content, substr) {
		t.Error(msg)
	}
}

// TestIntegrationVerification_ACFlowContract verifies the behavioral contract
// between Epic 3 (plan generates AC table) and Epic 4 (review checks AC table).
// AC-1: Review template contains AC checking instructions referencing the same
// format that the plan template generates.
func TestIntegrationVerification_ACFlowContract(t *testing.T) {
	skills := PhaseSkills()
	plan := requireSkill(t, skills, "plan")
	review := requireSkill(t, skills, "review")
	work := requireSkill(t, skills, "work")

	t.Run("plan_generates_AC_table", func(t *testing.T) {
		assertContains(t, plan, "## Acceptance Criteria", "missing AC section header")
		assertContains(t, plan, "| ID | Source Req | Criterion | Verification Method |", "missing AC table header row")
		assertContains(t, plan, "Generate Acceptance Criteria table", "missing AC generation instruction")
		assertContains(t, plan, "bd update", "missing bd update instruction to write AC")
	})

	t.Run("review_checks_AC_table", func(t *testing.T) {
		assertContains(t, review, "## Acceptance Criteria", "missing AC section reference")
		assertContains(t, review, "P1 process finding", "missing P1 for missing AC section")
		assertContains(t, review, "P1 defect", "missing P1 for unmet AC criteria")
		assertContains(t, review, "PASS", "missing PASS annotation for met criteria")
	})

	t.Run("review_has_AC_protocol", func(t *testing.T) {
		assertContains(t, review, "Acceptance Criteria Review Protocol", "missing AC protocol section")
		assertContains(t, review, "| AC ID | Criterion | Status | Evidence |", "missing AC review table")
	})

	t.Run("work_reads_AC", func(t *testing.T) {
		assertContains(t, work, "Acceptance Criteria", "missing AC reference")
		assertContains(t, work, "acceptance criteria from parent epic", "missing AC satisfaction instruction")
	})

	t.Run("AC_format_consistency", func(t *testing.T) {
		header := "## Acceptance Criteria"
		assertContains(t, plan, header, "plan missing AC header")
		assertContains(t, review, header, "review missing matching AC header")
	})
}

// TestIntegrationVerification_FELessonStoreContract verifies the behavioral
// contract between Epic 1 (failure escalation) and the lesson store.
// AC-2: The Go-level contract is tested by failure_integration_test.go in
// internal/hook/, which exercises failure_search.go + failure_tracker.go
// end-to-end with a real SQLite DB. This test verifies the template
// annotation side: review SKILL.md references lesson search for calibration.
func TestIntegrationVerification_FELessonStoreContract(t *testing.T) {
	skills := PhaseSkills()
	review := skills["review"]

	t.Run("review_template_references_lesson_search", func(t *testing.T) {
		assertContains(t, review, "ca search", "review missing ca search reference")
	})

	t.Run("lesson_calibration_reference_file_exists", func(t *testing.T) {
		refs := PhaseSkillReferences()
		if _, ok := refs["review/references/lesson-calibration.md"]; !ok {
			t.Error("missing review/references/lesson-calibration.md")
		}
	})
}

// TestIntegrationVerification_RVConditionalContract verifies that the runtime
// verifier is conditionally triggered by the epic-level Verification Contract.
// AC-3: Review template has runtime-verifier guidance tied to required evidence,
// while still preserving explicit web/API handling and CLI/library skips when
// runtime proof is not required.
func TestIntegrationVerification_RVConditionalContract(t *testing.T) {
	skills := PhaseSkills()
	review := requireSkill(t, skills, "review")

	t.Run("conditional_trigger", func(t *testing.T) {
		assertContains(t, review, "Runtime Verification (contract-driven)", "missing contract-driven RV section")
		assertContains(t, review, "Verification Contract", "missing Verification Contract reference")
	})

	t.Run("CLI_skip", func(t *testing.T) {
		assertContains(t, review, "CLI/library/service without runtime evidence", "missing CLI/library/service skip condition")
		assertContains(t, review, "SKIP", "missing SKIP instruction for CLI")
		assertContains(t, review, "P3/INFO", "missing P3/INFO severity for CLI skip")
	})

	t.Run("web_and_API_triggers", func(t *testing.T) {
		assertContains(t, review, "Web UI project", "missing Web UI trigger")
		assertContains(t, review, "HTTP API project", "missing HTTP API trigger")
	})

	t.Run("role_skill_reference", func(t *testing.T) {
		assertContains(t, review, "runtime-verifier", "missing RV role skill reference")
	})

	t.Run("role_skill_exists_with_content", func(t *testing.T) {
		roles := AgentRoleSkills()
		rv, ok := roles["runtime-verifier"]
		if !ok {
			t.Fatal("missing runtime-verifier agent role skill")
		}
		assertContains(t, rv, "Playwright", "RV missing Playwright reference")
		assertContains(t, rv, "P1/INFRA", "RV missing P1/INFRA finding type")
		assertContains(t, rv, "P3/INFO", "RV missing P3/INFO SKIPPED finding type")
	})

	t.Run("timeout_consistency", func(t *testing.T) {
		roles := AgentRoleSkills()
		rv := roles["runtime-verifier"]
		assertContains(t, review, "5min", "review missing 5min suite timeout")
		if !strings.Contains(rv, "5 min") && !strings.Contains(rv, "5min") &&
			!strings.Contains(rv, "5-minute") {
			t.Error("RV skill missing 5-minute suite timeout reference")
		}
	})
}
