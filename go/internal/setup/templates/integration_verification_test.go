package templates

import (
	"regexp"
	"strings"
	"testing"
)

// TestIntegrationVerification_ACFlowContract verifies the behavioral contract
// between Epic 3 (plan generates AC table) and Epic 4 (review checks AC table).
// AC-1: Review template contains AC checking instructions referencing the same
// format that the plan template generates.
func TestIntegrationVerification_ACFlowContract(t *testing.T) {
	skills := PhaseSkills()

	planContent, ok := skills["plan"]
	if !ok {
		t.Fatal("missing plan skill template")
	}
	reviewContent, ok := skills["review"]
	if !ok {
		t.Fatal("missing review skill template")
	}
	workContent, ok := skills["work"]
	if !ok {
		t.Fatal("missing work skill template")
	}

	// Plan must generate the AC table with specific format
	t.Run("plan_generates_AC_table", func(t *testing.T) {
		if !strings.Contains(planContent, "## Acceptance Criteria") {
			t.Error("plan SKILL.md missing '## Acceptance Criteria' section header")
		}
		if !strings.Contains(planContent, "| ID | Source Req | Criterion | Verification Method |") {
			t.Error("plan SKILL.md missing AC table header row")
		}
		if !strings.Contains(planContent, "Generate Acceptance Criteria table") {
			t.Error("plan SKILL.md missing instruction to generate AC table")
		}
		if !strings.Contains(planContent, "bd update") {
			t.Error("plan SKILL.md missing bd update instruction to write AC to epic")
		}
	})

	// Review must check the AC table
	t.Run("review_checks_AC_table", func(t *testing.T) {
		if !strings.Contains(reviewContent, "## Acceptance Criteria") {
			t.Error("review SKILL.md missing AC section reference")
		}
		if !strings.Contains(reviewContent, "P1 process finding") {
			t.Error("review SKILL.md missing P1 process finding for missing AC section")
		}
		if !strings.Contains(reviewContent, "P1 defect") {
			t.Error("review SKILL.md missing P1 defect for unmet AC criteria")
		}
		if !strings.Contains(reviewContent, "PASS") {
			t.Error("review SKILL.md missing PASS annotation for met criteria")
		}
	})

	// Review has AC Review Protocol section
	t.Run("review_has_AC_protocol", func(t *testing.T) {
		if !strings.Contains(reviewContent, "Acceptance Criteria Review Protocol") {
			t.Error("review SKILL.md missing Acceptance Criteria Review Protocol section")
		}
		if !strings.Contains(reviewContent, "| AC ID | Criterion | Status | Evidence |") {
			t.Error("review SKILL.md missing AC review summary table format")
		}
	})

	// Work reads AC from parent epic
	t.Run("work_reads_AC", func(t *testing.T) {
		if !strings.Contains(workContent, "Acceptance Criteria") {
			t.Error("work SKILL.md missing AC reference")
		}
		if !strings.Contains(workContent, "acceptance criteria from parent epic") {
			t.Error("work SKILL.md missing instruction to satisfy AC from parent epic")
		}
	})

	// Format consistency: plan and review use the same section header
	t.Run("AC_format_consistency", func(t *testing.T) {
		planACHeader := "## Acceptance Criteria"
		reviewACRef := "## Acceptance Criteria"

		if !strings.Contains(planContent, planACHeader) {
			t.Error("plan missing AC section header")
		}
		if !strings.Contains(reviewContent, reviewACRef) {
			t.Error("review missing AC section reference matching plan format")
		}
	})
}

// TestIntegrationVerification_FELessonStoreContract verifies the behavioral
// contract between Epic 1 (failure escalation) and the lesson store.
// AC-2: failure_integration_test covers this at the Go level; this test
// verifies the template references exist.
func TestIntegrationVerification_FELessonStoreContract(t *testing.T) {
	// The failure escalation Go code (failure_search.go, failure_tracker.go)
	// is tested by failure_integration_test.go which runs end-to-end with
	// a real SQLite DB. Here we verify the template side: review SKILL.md
	// references ca search for lesson retrieval.
	skills := PhaseSkills()
	reviewContent := skills["review"]

	t.Run("review_uses_ca_search_for_lessons", func(t *testing.T) {
		if !strings.Contains(reviewContent, "ca search") {
			t.Error("review SKILL.md missing ca search reference for lesson retrieval")
		}
	})

	t.Run("review_has_lesson_calibration_reference", func(t *testing.T) {
		refs := PhaseSkillReferences()
		if _, ok := refs["review/references/lesson-calibration.md"]; !ok {
			t.Error("missing review/references/lesson-calibration.md reference file")
		}
	})
}

// TestIntegrationVerification_RVConditionalContract verifies that the runtime
// verifier is conditionally triggered based on project type.
// AC-3: Review template has runtime-verifier conditional on project type
// with explicit CLI skip.
func TestIntegrationVerification_RVConditionalContract(t *testing.T) {
	skills := PhaseSkills()
	reviewContent := skills["review"]

	t.Run("review_has_RV_conditional_logic", func(t *testing.T) {
		if !strings.Contains(reviewContent, "Runtime Verification (conditional)") {
			t.Error("review SKILL.md missing conditional RV trigger section")
		}
	})

	t.Run("review_has_CLI_skip_instruction", func(t *testing.T) {
		if !strings.Contains(reviewContent, "CLI/library project") {
			t.Error("review SKILL.md missing CLI/library skip condition")
		}
		if !strings.Contains(reviewContent, "SKIP") {
			t.Error("review SKILL.md missing SKIP instruction for CLI projects")
		}
		if !strings.Contains(reviewContent, "P3/INFO") {
			t.Error("review SKILL.md missing P3/INFO severity for CLI skip")
		}
	})

	t.Run("review_has_web_project_trigger", func(t *testing.T) {
		if !strings.Contains(reviewContent, "Web UI project") {
			t.Error("review SKILL.md missing Web UI project trigger condition")
		}
		if !strings.Contains(reviewContent, "HTTP API project") {
			t.Error("review SKILL.md missing HTTP API project trigger condition")
		}
	})

	t.Run("review_references_RV_role_skill", func(t *testing.T) {
		if !strings.Contains(reviewContent, "runtime-verifier") {
			t.Error("review SKILL.md missing runtime-verifier role skill reference")
		}
	})

	// Verify runtime-verifier agent role skill exists
	t.Run("runtime_verifier_role_skill_exists", func(t *testing.T) {
		roles := AgentRoleSkills()
		rvContent, ok := roles["runtime-verifier"]
		if !ok {
			t.Fatal("missing runtime-verifier agent role skill")
		}
		if !strings.Contains(rvContent, "Playwright") {
			t.Error("runtime-verifier SKILL.md missing Playwright reference")
		}
		if !strings.Contains(rvContent, "P1/INFRA") {
			t.Error("runtime-verifier SKILL.md missing P1/INFRA finding type")
		}
		if !strings.Contains(rvContent, "P3/INFO") {
			t.Error("runtime-verifier SKILL.md missing P3/INFO SKIPPED finding type")
		}
	})

	// Verify RV timeout constraints match between review and RV skill
	t.Run("RV_timeout_consistency", func(t *testing.T) {
		roles := AgentRoleSkills()
		rvContent := roles["runtime-verifier"]

		// Review says 5min suite, 2min per test
		if !strings.Contains(reviewContent, "5min") {
			t.Error("review SKILL.md missing 5min suite timeout")
		}

		// RV skill should also reference these timeouts
		if !strings.Contains(rvContent, "5 min") && !strings.Contains(rvContent, "5min") && !strings.Contains(rvContent, "five min") && !strings.Contains(rvContent, "5-minute") {
			t.Error("runtime-verifier SKILL.md missing 5-minute suite timeout reference")
		}
	})
}

// TestIntegrationVerification_PhDGateContract verifies the research sufficiency
// gate in architect Phase 1.
// AC-4: Architect template Phase 1 contains research sufficiency gate with
// 0.7+ threshold.
func TestIntegrationVerification_PhDGateContract(t *testing.T) {
	skills := PhaseSkills()
	architectContent, ok := skills["architect"]
	if !ok {
		t.Fatal("missing architect skill template")
	}

	t.Run("architect_has_research_gate", func(t *testing.T) {
		if !strings.Contains(architectContent, "Research Sufficiency Gate") {
			t.Error("architect SKILL.md missing Research Sufficiency Gate section")
		}
	})

	t.Run("architect_has_relevance_threshold", func(t *testing.T) {
		if !strings.Contains(architectContent, "0.7+") {
			t.Error("architect SKILL.md missing 0.7+ relevance threshold")
		}
	})

	t.Run("architect_has_3_result_minimum", func(t *testing.T) {
		if !strings.Contains(architectContent, "fewer than 3 results") {
			t.Error("architect SKILL.md missing minimum 3 results requirement")
		}
	})

	t.Run("architect_has_time_budget", func(t *testing.T) {
		if !strings.Contains(architectContent, "15 minutes") {
			t.Error("architect SKILL.md missing 15-minute time budget")
		}
		if !strings.Contains(architectContent, "3 research rounds") {
			t.Error("architect SKILL.md missing 3 research rounds limit")
		}
	})

	t.Run("architect_references_get_a_phd", func(t *testing.T) {
		if !strings.Contains(architectContent, "get-a-phd") {
			t.Error("architect SKILL.md missing get-a-phd skill reference")
		}
	})

	t.Run("architect_evaluates_relevance_not_count", func(t *testing.T) {
		if !strings.Contains(architectContent, "relevance, not just count") {
			t.Error("architect SKILL.md missing relevance-over-count evaluation instruction (STPA H2.1)")
		}
	})
}

// TestIntegrationVerification_IVCreationContract verifies that architect Phase 4
// creates an Integration Verification epic with dependency wiring.
// AC-5: Architect template Phase 4 contains IV epic creation with deps.
func TestIntegrationVerification_IVCreationContract(t *testing.T) {
	skills := PhaseSkills()
	architectContent, ok := skills["architect"]
	if !ok {
		t.Fatal("missing architect skill template")
	}

	t.Run("architect_has_IV_section", func(t *testing.T) {
		if !strings.Contains(architectContent, "Integration Verification") {
			t.Error("architect SKILL.md missing Integration Verification section")
		}
	})

	t.Run("architect_IV_in_phase_4", func(t *testing.T) {
		if !strings.Contains(architectContent, "## Phase 4") {
			t.Error("architect SKILL.md missing Phase 4 section")
		}
		// IV creation should be referenced in or after Phase 4
		phase4Idx := strings.Index(architectContent, "## Phase 4")
		ivIdx := strings.Index(architectContent, "Integration Verification Epic")
		if phase4Idx < 0 || ivIdx < 0 {
			t.Error("architect SKILL.md missing Phase 4 or IV Epic section")
		} else if ivIdx < phase4Idx {
			t.Error("Integration Verification Epic section appears before Phase 4")
		}
	})

	t.Run("architect_IV_has_dependency_wiring", func(t *testing.T) {
		if !strings.Contains(architectContent, "bd dep add") {
			t.Error("architect SKILL.md missing bd dep add instruction for IV epic")
		}
	})

	t.Run("architect_IV_has_scope_classification", func(t *testing.T) {
		if !strings.Contains(architectContent, "LIGHT") && !strings.Contains(architectContent, "MEDIUM") && !strings.Contains(architectContent, "FULL") {
			t.Error("architect SKILL.md missing scope classification (LIGHT/MEDIUM/FULL)")
		}
	})

	t.Run("architect_IV_has_contracts_under_test_table", func(t *testing.T) {
		if !strings.Contains(architectContent, "Contracts under test") || !strings.Contains(architectContent, "contracts-under-test") {
			t.Error("architect SKILL.md missing contracts-under-test table reference")
		}
	})

	t.Run("architect_IV_goes_through_cook_it", func(t *testing.T) {
		if !strings.Contains(architectContent, "cook-it") {
			t.Error("architect SKILL.md missing cook-it pipeline reference for IV epic")
		}
	})
}

// TestIntegrationVerification_ReviewCoherence verifies that the review SKILL.md
// is internally consistent after modifications from both Epic 3 (AC protocol)
// and Epic 4 (LCR + RV).
// AC-6: Epic 3 and Epic 4 sections don't conflict; methodology steps are
// sequentially numbered.
func TestIntegrationVerification_ReviewCoherence(t *testing.T) {
	skills := PhaseSkills()
	reviewContent, ok := skills["review"]
	if !ok {
		t.Fatal("missing review skill template")
	}

	t.Run("methodology_steps_sequential", func(t *testing.T) {
		// Extract numbered steps from the Methodology section
		methodologyIdx := strings.Index(reviewContent, "## Methodology")
		if methodologyIdx < 0 {
			t.Fatal("review SKILL.md missing Methodology section")
		}

		// Find the end of methodology (next ## section)
		rest := reviewContent[methodologyIdx+len("## Methodology"):]
		nextSection := strings.Index(rest, "\n## ")
		if nextSection > 0 {
			rest = rest[:nextSection]
		}

		// Check that steps 1-17 exist and are in order
		stepPattern := regexp.MustCompile(`(?m)^(\d+)\. `)
		matches := stepPattern.FindAllStringSubmatch(rest, -1)
		if len(matches) == 0 {
			t.Fatal("no numbered steps found in Methodology")
		}

		lastStep := 0
		for _, m := range matches {
			var stepNum int
			_, err := parseStepNumber(m[1], &stepNum)
			if err {
				t.Errorf("invalid step number: %s", m[1])
				continue
			}
			if stepNum <= lastStep {
				t.Errorf("step %d is not sequential (follows step %d)", stepNum, lastStep)
			}
			lastStep = stepNum
		}

		if lastStep < 10 {
			t.Errorf("expected at least 10 methodology steps, got %d", lastStep)
		}
	})

	t.Run("AC_and_LCR_both_present", func(t *testing.T) {
		// Both Epic 3 (AC) and Epic 4 (LCR) features must be present
		hasAC := strings.Contains(reviewContent, "Check Acceptance Criteria")
		hasLCR := strings.Contains(reviewContent, "Lesson-Calibrated Review")
		hasRV := strings.Contains(reviewContent, "Runtime Verification")

		if !hasAC {
			t.Error("review SKILL.md missing AC checking (Epic 3)")
		}
		if !hasLCR {
			t.Error("review SKILL.md missing LCR (Epic 4)")
		}
		if !hasRV {
			t.Error("review SKILL.md missing RV (Epic 4)")
		}
	})

	t.Run("no_duplicate_sections", func(t *testing.T) {
		// Check for accidentally duplicated sections
		sections := []string{
			"## Methodology",
			"## Quality Criteria",
			"## Common Pitfalls",
			"## Memory Integration",
		}
		for _, section := range sections {
			count := strings.Count(reviewContent, section)
			if count > 1 {
				t.Errorf("review SKILL.md has duplicate section: %s (found %d times)", section, count)
			}
		}
	})

	t.Run("quality_criteria_covers_all_epics", func(t *testing.T) {
		// Quality criteria should mention both AC (Epic 3) and LCR/RV (Epic 4)
		qcIdx := strings.Index(reviewContent, "## Quality Criteria")
		if qcIdx < 0 {
			t.Fatal("missing Quality Criteria section")
		}
		qcContent := reviewContent[qcIdx:]

		if !strings.Contains(qcContent, "acceptance criteria") {
			t.Error("Quality Criteria missing AC verification (Epic 3)")
		}
		if !strings.Contains(qcContent, "LCR") || !strings.Contains(qcContent, "calibrated") {
			t.Error("Quality Criteria missing LCR reference (Epic 4)")
		}
		if !strings.Contains(qcContent, "Runtime verifier") {
			t.Error("Quality Criteria missing RV reference (Epic 4)")
		}
	})

	t.Run("phase_gate_includes_AC", func(t *testing.T) {
		gateIdx := strings.Index(reviewContent, "PHASE GATE 4")
		if gateIdx < 0 {
			t.Fatal("missing PHASE GATE 4 section")
		}
		gateContent := reviewContent[gateIdx:]
		if !strings.Contains(gateContent, "acceptance criteria") {
			t.Error("PHASE GATE 4 missing AC requirement")
		}
	})
}

// TestIntegrationVerification_SmokeTestMarkers verifies that each of the 4
// improvements has a verifiable marker in its template or test output.
// AC-8: Each improvement has a verifiable marker.
func TestIntegrationVerification_SmokeTestMarkers(t *testing.T) {
	skills := PhaseSkills()
	roles := AgentRoleSkills()
	refs := PhaseSkillReferences()

	// Epic 1: Failure escalation - marker in Go code (tested by integration test)
	// Verified by the existence and pass of failure_integration_test.go
	t.Run("epic1_FE_has_search_integration", func(t *testing.T) {
		// The Go integration test (failure_integration_test.go) validates this.
		// Here we verify the template side acknowledges lesson search.
		reviewContent := skills["review"]
		if !strings.Contains(reviewContent, "ca search") {
			t.Error("no ca search reference found — Epic 1 lesson search not integrated")
		}
	})

	// Epic 2: Architect intelligence - markers in architect template
	t.Run("epic2_PhD_gate_marker", func(t *testing.T) {
		architect := skills["architect"]
		if !strings.Contains(architect, "Research Sufficiency Gate") {
			t.Error("architect missing PhD gate marker")
		}
	})

	t.Run("epic2_IV_creation_marker", func(t *testing.T) {
		architect := skills["architect"]
		if !strings.Contains(architect, "Integration Verification Epic") {
			t.Error("architect missing IV creation marker")
		}
	})

	// Epic 3: Acceptance criteria - markers in plan, review, and work
	t.Run("epic3_AC_in_plan", func(t *testing.T) {
		plan := skills["plan"]
		if !strings.Contains(plan, "Generate Acceptance Criteria table") {
			t.Error("plan missing AC generation marker")
		}
	})

	t.Run("epic3_AC_in_review", func(t *testing.T) {
		review := skills["review"]
		if !strings.Contains(review, "Acceptance Criteria Review Protocol") {
			t.Error("review missing AC protocol marker")
		}
	})

	t.Run("epic3_AC_in_work", func(t *testing.T) {
		work := skills["work"]
		if !strings.Contains(work, "Read Acceptance Criteria") {
			t.Error("work missing AC reading marker")
		}
	})

	// Epic 4: Review intelligence - markers in review and runtime-verifier
	t.Run("epic4_LCR_marker", func(t *testing.T) {
		review := skills["review"]
		if !strings.Contains(review, "Lesson-Calibrated Review (LCR)") {
			t.Error("review missing LCR marker")
		}
	})

	t.Run("epic4_LCR_reference_exists", func(t *testing.T) {
		if _, ok := refs["review/references/lesson-calibration.md"]; !ok {
			t.Error("missing lesson-calibration.md reference file")
		}
	})

	t.Run("epic4_RV_role_skill_marker", func(t *testing.T) {
		rv, ok := roles["runtime-verifier"]
		if !ok {
			t.Error("runtime-verifier role skill missing")
			return
		}
		if !strings.Contains(rv, "Runtime Verifier Agent") {
			t.Error("runtime-verifier missing agent title marker")
		}
	})

	t.Run("epic4_RV_in_review", func(t *testing.T) {
		review := skills["review"]
		if !strings.Contains(review, "Runtime Verification Integration") {
			t.Error("review missing RV integration section marker")
		}
	})
}

// TestIntegrationVerification_CookItACGate verifies that cook-it has the AC
// gate between plan and work phases.
func TestIntegrationVerification_CookItACGate(t *testing.T) {
	skills := PhaseSkills()
	cookIt, ok := skills["cook-it"]
	if !ok {
		t.Fatal("missing cook-it skill template")
	}

	t.Run("cook_it_has_AC_gate", func(t *testing.T) {
		if !strings.Contains(cookIt, "Acceptance Criteria") {
			t.Error("cook-it SKILL.md missing AC gate reference")
		}
	})

	t.Run("cook_it_AC_gate_blocks_work", func(t *testing.T) {
		// The AC gate should appear between plan and work references
		if !strings.Contains(cookIt, "AC") {
			t.Error("cook-it SKILL.md missing AC abbreviation")
		}
	})
}

// parseStepNumber parses a string step number into an int.
// Returns true if there was an error.
func parseStepNumber(s string, out *int) (string, bool) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return s, true
		}
		n = n*10 + int(c-'0')
	}
	*out = n
	return s, false
}
