package cli

import (
	"strings"
	"testing"
)

func TestImprovePhaseHeader_StartsConditional(t *testing.T) {
	t.Parallel()
	header := improvePhaseHeader()
	if !strings.Contains(header, "FAILED_COUNT -eq 0") {
		t.Error("expected FAILED_COUNT check")
	}
	if !strings.Contains(header, "Improvement phase") {
		t.Error("expected improvement phase comment")
	}
}

func TestImproveTopicDiscovery_DefinesGetTopics(t *testing.T) {
	t.Parallel()
	s := improveTopicDiscovery()
	if !strings.Contains(s, "get_topics()") {
		t.Error("expected get_topics function definition")
	}
	if !strings.Contains(s, "IMPROVE_DIR") {
		t.Error("expected IMPROVE_DIR variable reference")
	}
	if !strings.Contains(s, "basename") {
		t.Error("expected basename call for topic extraction")
	}
	if !strings.Contains(s, "return 1") {
		t.Error("expected error return when no topics found")
	}
}

func TestImprovePromptBuilder_DefinesBuildImprovePrompt(t *testing.T) {
	t.Parallel()
	s := improvePromptBuilder()
	if !strings.Contains(s, "build_improve_prompt()") {
		t.Error("expected build_improve_prompt function definition")
	}
	if !strings.Contains(s, "IMPROVED") {
		t.Error("expected IMPROVED marker in prompt")
	}
	if !strings.Contains(s, "NO_IMPROVEMENT") {
		t.Error("expected NO_IMPROVEMENT marker in prompt")
	}
	if !strings.Contains(s, "FAILED") {
		t.Error("expected FAILED marker in prompt")
	}
	if !strings.Contains(s, "ONE focused improvement") {
		t.Error("expected single-improvement instruction")
	}
}

func TestImproveMarkerDetection_DefinesDetectFunction(t *testing.T) {
	t.Parallel()
	s := improveMarkerDetection()
	if !strings.Contains(s, "detect_improve_marker()") {
		t.Error("expected detect_improve_marker function definition")
	}
	for _, marker := range []string{"IMPROVED", "NO_IMPROVEMENT", "FAILED"} {
		if !strings.Contains(s, marker) {
			t.Errorf("expected %q marker in detection function", marker)
		}
	}
	if !strings.Contains(s, "tracefile") {
		t.Error("expected tracefile fallback in detection")
	}
}

func TestImproveObservability_DefinesStatusFunctions(t *testing.T) {
	t.Parallel()
	s := improveObservability()
	if !strings.Contains(s, "write_improve_status()") {
		t.Error("expected write_improve_status function")
	}
	if !strings.Contains(s, "log_improve_result()") {
		t.Error("expected log_improve_result function")
	}
	if !strings.Contains(s, "IMPROVE_STATUS_FILE") {
		t.Error("expected IMPROVE_STATUS_FILE variable")
	}
	if !strings.Contains(s, "IMPROVE_EXEC_LOG") {
		t.Error("expected IMPROVE_EXEC_LOG variable")
	}
}

func TestImproveMainLoopInit_InterpolatesOptions(t *testing.T) {
	t.Parallel()
	s := improveMainLoopInit(loopImproveOptions{maxIters: 15, timeBudget: 7200})
	if !strings.Contains(s, "MAX_ITERS=15") {
		t.Error("expected MAX_ITERS=15")
	}
	if !strings.Contains(s, "TIME_BUDGET=7200") {
		t.Error("expected TIME_BUDGET=7200")
	}
	if !strings.Contains(s, "IMPROVED_COUNT=0") {
		t.Error("expected IMPROVED_COUNT initialization")
	}
	if !strings.Contains(s, "git diff --quiet") {
		t.Error("expected dirty tree check")
	}
}

func TestImproveMainLoopInit_ZeroTimeBudget(t *testing.T) {
	t.Parallel()
	s := improveMainLoopInit(loopImproveOptions{maxIters: 5, timeBudget: 0})
	if !strings.Contains(s, "TIME_BUDGET=0") {
		t.Error("expected TIME_BUDGET=0 for unlimited")
	}
	if !strings.Contains(s, "MAX_ITERS=5") {
		t.Error("expected MAX_ITERS=5")
	}
}

func TestImproveMainLoopBody_HandlesAllMarkers(t *testing.T) {
	t.Parallel()
	s := improveMainLoopBody()
	if !strings.Contains(s, "(improved)") {
		t.Error("expected improved case")
	}
	if !strings.Contains(s, "(no_improvement)") {
		t.Error("expected no_improvement case")
	}
	if !strings.Contains(s, "(failed|*)") {
		t.Error("expected failed/wildcard case")
	}
	if !strings.Contains(s, "git reset --hard") {
		t.Error("expected git reset for rollback")
	}
	if !strings.Contains(s, "CONSECUTIVE_NO_IMPROVE") {
		t.Error("expected diminishing returns tracking")
	}
}

func TestImprovePhaseFooter_ExitsCorrectly(t *testing.T) {
	t.Parallel()
	s := improvePhaseFooter()
	if !strings.Contains(s, "IMPROVE_RESULT") {
		t.Error("expected IMPROVE_RESULT check")
	}
	if !strings.Contains(s, "exit 0") {
		t.Error("expected exit 0 on success")
	}
	if !strings.Contains(s, "exit 1") {
		t.Error("expected exit 1 on failure")
	}
}

func TestLoopScriptImprovePhase_ComposesAllSections(t *testing.T) {
	t.Parallel()
	phase := loopScriptImprovePhase(loopImproveOptions{maxIters: 3, timeBudget: 600})

	sections := []string{
		"get_topics()",
		"build_improve_prompt()",
		"detect_improve_marker()",
		"write_improve_status()",
		"log_improve_result()",
		"MAX_ITERS=3",
		"TIME_BUDGET=600",
	}
	for _, section := range sections {
		if !strings.Contains(phase, section) {
			t.Errorf("composed phase missing %q", section)
		}
	}
}

func TestImproveMainLoopBody_DiminishingReturnsThreshold(t *testing.T) {
	t.Parallel()
	s := improveMainLoopBody()
	if !strings.Contains(s, "CONSECUTIVE_NO_IMPROVE -ge 2") {
		t.Error("expected diminishing returns threshold of 2")
	}
	if !strings.Contains(s, "Diminishing returns") {
		t.Error("expected diminishing returns log message")
	}
}

func TestImproveMainLoopInit_DryRunSupport(t *testing.T) {
	t.Parallel()
	s := improveMainLoopInit(loopImproveOptions{maxIters: 1, timeBudget: 0})
	if !strings.Contains(s, "IMPROVE_DRY_RUN") {
		t.Error("expected dry run support")
	}
}

func TestImproveMainLoopInit_DangerouslySkipPermissions(t *testing.T) {
	t.Parallel()
	s := improveMainLoopInit(loopImproveOptions{maxIters: 1, timeBudget: 0})
	if !strings.Contains(s, "--dangerously-skip-permissions") {
		t.Error("expected --dangerously-skip-permissions flag in claude invocation")
	}
}
