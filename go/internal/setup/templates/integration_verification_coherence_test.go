package templates

import (
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// TestIntegrationVerification_PhDGateContract verifies the research sufficiency
// gate in architect Phase 1.
// AC-4: Architect template Phase 1 contains research sufficiency gate with
// 0.7+ threshold.
func TestIntegrationVerification_PhDGateContract(t *testing.T) {
	architect := requireSkill(t, PhaseSkills(), "architect")

	t.Run("research_gate_exists", func(t *testing.T) {
		assertContains(t, architect, "Research Sufficiency Gate", "missing gate section")
	})
	t.Run("relevance_threshold", func(t *testing.T) {
		assertContains(t, architect, "0.7+", "missing 0.7+ threshold")
	})
	t.Run("3_result_minimum", func(t *testing.T) {
		assertContains(t, architect, "fewer than 3 results", "missing 3-result minimum")
	})
	t.Run("time_budget", func(t *testing.T) {
		assertContains(t, architect, "15 minutes", "missing 15-minute budget")
		assertContains(t, architect, "3 research rounds", "missing 3-round limit")
	})
	t.Run("get_a_phd_reference", func(t *testing.T) {
		assertContains(t, architect, "get-a-phd", "missing get-a-phd reference")
	})
	t.Run("relevance_over_count", func(t *testing.T) {
		assertContains(t, architect, "relevance, not just count", "missing STPA H2.1")
	})
}

// TestIntegrationVerification_IVCreationContract verifies that architect Phase 4
// creates an Integration Verification epic with dependency wiring.
// AC-5: Architect template Phase 4 contains IV epic creation with deps.
func TestIntegrationVerification_IVCreationContract(t *testing.T) {
	architect := requireSkill(t, PhaseSkills(), "architect")

	t.Run("IV_section_exists", func(t *testing.T) {
		assertContains(t, architect, "Integration Verification", "missing IV section")
	})
	t.Run("IV_after_phase_4", func(t *testing.T) {
		phase4Idx := strings.Index(architect, "## Phase 4")
		ivIdx := strings.Index(architect, "Integration Verification Epic")
		if phase4Idx < 0 || ivIdx < 0 {
			t.Fatal("missing Phase 4 or IV Epic section")
		}
		if ivIdx < phase4Idx {
			t.Error("IV Epic section appears before Phase 4")
		}
	})
	t.Run("dependency_wiring", func(t *testing.T) {
		assertContains(t, architect, "bd dep add", "missing dep wiring instruction")
	})
	t.Run("scope_classification", func(t *testing.T) {
		hasAll := strings.Contains(architect, "LIGHT") &&
			strings.Contains(architect, "MEDIUM") &&
			strings.Contains(architect, "FULL")
		if !hasAll {
			t.Error("missing scope classification (LIGHT/MEDIUM/FULL)")
		}
	})
	t.Run("contracts_under_test_table", func(t *testing.T) {
		has := strings.Contains(architect, "Contracts under test") ||
			strings.Contains(architect, "contracts-under-test")
		if !has {
			t.Error("missing contracts-under-test table reference")
		}
	})
	t.Run("cook_it_pipeline", func(t *testing.T) {
		assertContains(t, architect, "cook-it", "missing cook-it reference for IV")
	})
}

// TestIntegrationVerification_ReviewCoherence verifies that the review SKILL.md
// is internally consistent after modifications from both Epic 3 (AC protocol)
// and Epic 4 (LCR + RV).
// AC-6: Epic 3 and Epic 4 sections don't conflict; methodology steps are
// sequentially numbered.
func TestIntegrationVerification_ReviewCoherence(t *testing.T) {
	review := requireSkill(t, PhaseSkills(), "review")

	t.Run("methodology_steps_sequential", func(t *testing.T) {
		verifySequentialSteps(t, review)
	})
	t.Run("AC_and_LCR_both_present", func(t *testing.T) {
		assertContains(t, review, "Check Acceptance Criteria", "missing AC (Epic 3)")
		assertContains(t, review, "Lesson-Calibrated Review", "missing LCR (Epic 4)")
		assertContains(t, review, "Runtime Verification", "missing RV (Epic 4)")
	})
	t.Run("no_duplicate_sections", func(t *testing.T) {
		for _, section := range []string{
			"## Methodology", "## Quality Criteria",
			"## Common Pitfalls", "## Memory Integration",
		} {
			if c := strings.Count(review, section); c > 1 {
				t.Errorf("duplicate section: %s (found %d times)", section, c)
			}
		}
	})
	t.Run("quality_criteria_covers_all_epics", func(t *testing.T) {
		qcIdx := strings.Index(review, "## Quality Criteria")
		if qcIdx < 0 {
			t.Fatal("missing Quality Criteria section")
		}
		qc := review[qcIdx:]
		assertContains(t, qc, "acceptance criteria", "QC missing AC (Epic 3)")
		if !strings.Contains(qc, "LCR") && !strings.Contains(qc, "calibrated") {
			t.Error("QC missing LCR reference (Epic 4)")
		}
		assertContains(t, qc, "Runtime verifier", "QC missing RV (Epic 4)")
	})
	t.Run("phase_gate_includes_AC", func(t *testing.T) {
		gateIdx := strings.Index(review, "PHASE GATE 4")
		if gateIdx < 0 {
			t.Fatal("missing PHASE GATE 4")
		}
		assertContains(t, review[gateIdx:], "acceptance criteria", "gate missing AC")
	})
}

// verifySequentialSteps checks that numbered methodology steps are in order.
func verifySequentialSteps(t *testing.T, review string) {
	t.Helper()
	methodIdx := strings.Index(review, "## Methodology")
	if methodIdx < 0 {
		t.Fatal("missing Methodology section")
	}
	rest := review[methodIdx+len("## Methodology"):]
	if end := strings.Index(rest, "\n## "); end > 0 {
		rest = rest[:end]
	}

	stepRe := regexp.MustCompile(`(?m)^(\d+)\. `)
	matches := stepRe.FindAllStringSubmatch(rest, -1)
	if len(matches) == 0 {
		t.Fatal("no numbered steps found")
	}

	lastStep := 0
	for _, m := range matches {
		n, err := strconv.Atoi(m[1])
		if err != nil {
			t.Errorf("invalid step number: %s", m[1])
			continue
		}
		if n <= lastStep {
			t.Errorf("step %d not sequential (follows %d)", n, lastStep)
		}
		lastStep = n
	}
	if lastStep < 10 {
		t.Errorf("expected >=10 methodology steps, got %d", lastStep)
	}
}

// TestIntegrationVerification_SmokeTestMarkers verifies that each of the 4
// improvements has a verifiable marker in its template or test output.
// AC-8: Each improvement has a verifiable marker.
func TestIntegrationVerification_SmokeTestMarkers(t *testing.T) {
	skills := PhaseSkills()
	roles := AgentRoleSkills()
	refs := PhaseSkillReferences()

	// Epic 1: FE lesson search (Go-level verified by failure_integration_test)
	t.Run("epic1_FE_template_annotation", func(t *testing.T) {
		assertContains(t, skills["review"], "ca search", "review missing lesson search")
	})
	// Epic 2: Architect intelligence
	t.Run("epic2_PhD_gate", func(t *testing.T) {
		assertContains(t, skills["architect"], "Research Sufficiency Gate", "missing PhD gate")
	})
	t.Run("epic2_IV_creation", func(t *testing.T) {
		assertContains(t, skills["architect"], "Integration Verification Epic", "missing IV")
	})
	// Epic 3: Acceptance criteria
	t.Run("epic3_AC_plan", func(t *testing.T) {
		assertContains(t, skills["plan"], "Generate Acceptance Criteria table", "plan missing AC")
	})
	t.Run("epic3_AC_review", func(t *testing.T) {
		assertContains(t, skills["review"], "Acceptance Criteria Review Protocol", "review missing AC")
	})
	t.Run("epic3_AC_work", func(t *testing.T) {
		assertContains(t, skills["work"], "Read Acceptance Criteria", "work missing AC")
	})
	// Epic 4: Review intelligence
	t.Run("epic4_LCR", func(t *testing.T) {
		assertContains(t, skills["review"], "Lesson-Calibrated Review (LCR)", "missing LCR")
	})
	t.Run("epic4_LCR_reference", func(t *testing.T) {
		if _, ok := refs["review/references/lesson-calibration.md"]; !ok {
			t.Error("missing lesson-calibration.md reference")
		}
	})
	t.Run("epic4_RV_role_skill", func(t *testing.T) {
		rv, ok := roles["runtime-verifier"]
		if !ok {
			t.Fatal("missing runtime-verifier role skill")
		}
		assertContains(t, rv, "Runtime Verifier Agent", "RV missing agent title")
	})
	t.Run("epic4_RV_in_review", func(t *testing.T) {
		assertContains(t, skills["review"], "Runtime Verification Integration", "missing RV section")
	})
}

// TestIntegrationVerification_CookItACGate verifies that cook-it has the AC
// gate between plan and work phases (positional check).
func TestIntegrationVerification_CookItACGate(t *testing.T) {
	cookIt := requireSkill(t, PhaseSkills(), "cook-it")

	t.Run("AC_gate_exists", func(t *testing.T) {
		assertContains(t, cookIt, "Acceptance Criteria", "missing AC gate reference")
	})

	t.Run("AC_gate_positioned_after_plan_before_work", func(t *testing.T) {
		planGateIdx := strings.Index(cookIt, "After Plan")
		acIdx := strings.Index(cookIt, "Acceptance Criteria")
		workGateIdx := strings.Index(cookIt, "After Work")

		if planGateIdx < 0 {
			t.Fatal("cook-it missing 'After Plan' gate")
		}
		if acIdx < 0 {
			t.Fatal("cook-it missing AC reference")
		}
		if workGateIdx < 0 {
			t.Fatal("cook-it missing 'After Work' gate")
		}
		if acIdx < planGateIdx {
			t.Error("AC gate appears before plan gate")
		}
		if acIdx > workGateIdx {
			t.Error("AC gate appears after work gate")
		}
	})
}
