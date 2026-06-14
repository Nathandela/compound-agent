package cli

// Goose implementer tests for `ca loop --implementer goose` (R1, R2, R6, R7).
// TDD: these are written FAIL-BEFORE / PASS-AFTER. The default --implementer claude
// path must stay byte-identical to the pre-change generator (R7).

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Flag existence and default ---

func TestLoopCmd_ImplementerFlagExistsDefaultClaude(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	lc := loopCmd()
	root.AddCommand(lc)
	f := lc.Flags().Lookup("implementer")
	if f == nil {
		t.Fatal("loop command must define --implementer flag")
	}
	if f.DefValue != "claude" {
		t.Errorf("--implementer default must be 'claude', got %q", f.DefValue)
	}
}

// --- Invalid --implementer value is rejected ---

func TestLoopCmd_InvalidImplementerRejected(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")
	_, err := executeCommand(root, "loop", "-o", outPath, "--implementer", "foo")
	if err == nil {
		t.Fatal("expected error for invalid --implementer value")
	}
	if !strings.Contains(err.Error(), "claude") || !strings.Contains(err.Error(), "goose") {
		t.Errorf("error message should mention valid values 'claude' and 'goose', got: %v", err)
	}
}

// --- Goose requires a provider/model reference for --model ---

func TestLoopCmd_GooseRequiresProviderModel(t *testing.T) {
	t.Parallel()
	// No slash: must error.
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "a.sh"),
		"--implementer", "goose", "--model", "deepseek-chat")
	if err == nil {
		t.Fatal("expected error: goose --model must be provider/model")
	}

	// Valid API ref.
	root2 := &cobra.Command{Use: "ca"}
	root2.AddCommand(loopCmd())
	_, err = executeCommand(root2, "loop", "-o", filepath.Join(dir, "b.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if err != nil {
		t.Errorf("valid provider/model deepseek/deepseek-chat should succeed, got: %v", err)
	}

	// Valid ollama ref (model half contains a colon, that is fine).
	root3 := &cobra.Command{Use: "ca"}
	root3.AddCommand(loopCmd())
	_, err = executeCommand(root3, "loop", "-o", filepath.Join(dir, "c.sh"),
		"--implementer", "goose", "--model", "ollama/qwen2.5-coder:14b")
	if err != nil {
		t.Errorf("valid provider/model ollama/qwen2.5-coder:14b should succeed, got: %v", err)
	}

	// FIX-5: multi-segment model halves are valid (provider = before the first
	// slash, model = everything after). E.g. an openrouter 3-segment ref.
	root4 := &cobra.Command{Use: "ca"}
	root4.AddCommand(loopCmd())
	_, err = executeCommand(root4, "loop", "-o", filepath.Join(dir, "d.sh"),
		"--implementer", "goose", "--model", "openrouter/anthropic/claude-3.5-sonnet")
	if err != nil {
		t.Errorf("multi-segment ref openrouter/anthropic/claude-3.5-sonnet should succeed, got: %v", err)
	}

	// Empty provider or model half must error.
	for _, bad := range []string{"/deepseek-chat", "deepseek/", "/"} {
		rootN := &cobra.Command{Use: "ca"}
		rootN.AddCommand(loopCmd())
		_, err := executeCommand(rootN, "loop", "-o", filepath.Join(dir, "bad.sh"),
			"--implementer", "goose", "--model", bad, "--force")
		if err == nil {
			t.Errorf("expected error for malformed provider/model %q", bad)
		}
	}
}

// --- Phase 3: --implementer goose now ACCEPTS --reviewers (open-model fleet) ---

func TestLoopCmd_GooseAcceptsFleetReviewers(t *testing.T) {
	t.Parallel()
	// Open-model specialty reviewers are accepted for the goose review fleet.
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "rev.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security,correctness,quality")
	if err != nil {
		t.Fatalf("goose should accept the open-model fleet reviewers, got: %v", err)
	}

	// Claude-only reviewer names are NOT valid for the goose fleet.
	root2 := &cobra.Command{Use: "ca"}
	root2.AddCommand(loopCmd())
	_, err = executeCommand(root2, "loop", "-o", filepath.Join(dir, "bad.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "claude-sonnet")
	if err == nil {
		t.Fatal("expected error: claude-sonnet is not a valid goose fleet reviewer")
	}
	if !strings.Contains(err.Error(), "claude-sonnet") {
		t.Errorf("error should name the bad reviewer, got: %v", err)
	}
	for _, valid := range []string{"security", "correctness", "quality"} {
		if !strings.Contains(err.Error(), valid) {
			t.Errorf("error should list valid goose reviewer %q, got: %v", valid, err)
		}
	}

	// Sanity: goose without --reviewers still succeeds.
	root3 := &cobra.Command{Use: "ca"}
	root3.AddCommand(loopCmd())
	_, err = executeCommand(root3, "loop", "-o", filepath.Join(dir, "norev.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if err != nil {
		t.Errorf("goose without --reviewers should succeed, got: %v", err)
	}
}

// --- Phase 3: goose review fleet uses subrecipes and reuses the cycle loop ---

func TestLoopCmd_GooseReviewFleetUsesSubrecipes(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t,
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security,correctness,quality")

	// Review config + the configured reviewers are emitted.
	if !strings.Contains(script, "REVIEW_REVIEWERS='security correctness quality'") {
		t.Error("goose review fleet must list the specialty reviewers in REVIEW_REVIEWERS")
	}
	// The fleet drives goose subrecipes, not claude reviewers.
	if !strings.Contains(script, "goose run") || !strings.Contains(script, "--recipe") {
		t.Error("goose review fleet must dispatch reviewers via 'goose run --recipe'")
	}
	for _, sub := range []string{"review-security", "review-correctness", "review-quality"} {
		if !strings.Contains(script, sub) {
			t.Errorf("goose review fleet must reference subrecipe %q", sub)
		}
	}
	// The fleet scopes reviewers to the diff range.
	if !strings.Contains(script, "diff_range") {
		t.Error("goose review fleet must pass a diff_range param to the subrecipes")
	}
	// Aggregation is reused from the shared cycle loop (run_review_phase + markers).
	if !strings.Contains(script, "run_review_phase") {
		t.Error("goose review fleet must reuse run_review_phase")
	}
	if !strings.Contains(script, "^REVIEW_APPROVED$") {
		t.Error("goose review fleet must reuse the anchored REVIEW_APPROVED aggregation check")
	}
	// It is actually called in the loop.
	if !strings.Contains(script, `run_review_phase "final"`) {
		t.Error("goose review fleet must be invoked (run_review_phase final)")
	}
	// Must NOT spawn claude reviewers on the goose path.
	if strings.Contains(script, "claude --bg") || strings.Contains(script, "bg_dispatch_reviewer") {
		t.Error("goose review fleet must NOT dispatch claude reviewers")
	}
}

// --- Phase 3: goose review fleet is genuinely multi-model (per-reviewer pins) ---

func TestLoopCmd_GooseReviewFleetPerReviewerModels(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t,
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security,quality",
		"--review-models", "security=ollama/qwen2.5-coder:14b,quality=glm/glm-4-plus")

	spawn := extractShellFunc(t, script, "spawn_reviewers")
	// spawn_reviewers must export a per-reviewer GOOSE_PROVIDER/GOOSE_MODEL before
	// each 'goose run' so the fleet is heterogeneous, not single-model.
	if !strings.Contains(spawn, "GOOSE_PROVIDER") || !strings.Contains(spawn, "GOOSE_MODEL") {
		t.Errorf("spawn_reviewers must set per-reviewer GOOSE_PROVIDER/GOOSE_MODEL, body:\n%s", spawn)
	}
	// The two configured reviewers must resolve to DIFFERENT models.
	if !strings.Contains(script, "ollama/qwen2.5-coder:14b") {
		t.Error("review fleet must wire the security reviewer to its pinned model ollama/qwen2.5-coder:14b")
	}
	if !strings.Contains(script, "glm/glm-4-plus") {
		t.Error("review fleet must wire the quality reviewer to its pinned model glm/glm-4-plus")
	}
	// The two models are distinct (different-model assertion).
	if strings.Count(script, "ollama/qwen2.5-coder:14b") == 0 ||
		strings.Contains("ollama/qwen2.5-coder:14b", "glm/glm-4-plus") {
		t.Error("the two reviewers must resolve to different models")
	}
}

// --- Invalid --review-models entries are rejected ---

func TestLoopCmd_GooseReviewModelsRejectsUnknownReviewer(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "bad.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security",
		"--review-models", "bogus=ollama/qwen2.5-coder:14b")
	if err == nil {
		t.Fatal("expected error: 'bogus' is not a valid goose fleet reviewer for --review-models")
	}
	if !strings.Contains(err.Error(), "bogus") {
		t.Errorf("error should name the bad reviewer, got: %v", err)
	}
}

// --- --review-models only applies to the goose implementer ---

func TestLoopCmd_ReviewModelsRejectedForClaude(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "c.sh"),
		"--reviewers", "claude-sonnet",
		"--review-models", "security=ollama/qwen2.5-coder:14b")
	if err == nil {
		t.Fatal("expected error: --review-models is goose-only")
	}
	if !strings.Contains(err.Error(), "goose") {
		t.Errorf("error should explain --review-models is goose-only, got: %v", err)
	}
}

// --- Unpinned goose reviewers inherit the loop's model (single-model default) ---

func TestLoopCmd_GooseReviewFleetUnpinnedInherits(t *testing.T) {
	t.Parallel()
	// No --review-models: every reviewer must inherit, i.e. spawn_reviewers must
	// not force GOOSE_PROVIDER/GOOSE_MODEL when the pin ref is empty.
	script := generateLoopScriptViaCmd(t,
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security,correctness,quality")
	model := extractShellFunc(t, script, "goose_reviewer_model")
	// The lookup exists and, with no pins, returns empty for every reviewer.
	if !strings.Contains(model, `echo ""`) {
		t.Errorf("goose_reviewer_model must default to empty (inherit) when unpinned, body:\n%s", model)
	}
	for _, r := range []string{"(security)", "(correctness)", "(quality)"} {
		if strings.Contains(model, r) {
			t.Errorf("unpinned goose_reviewer_model must not contain a pin case %q, body:\n%s", r, model)
		}
	}
	// spawn_reviewers only exports when the ref is non-empty.
	spawn := extractShellFunc(t, script, "spawn_reviewers")
	if !strings.Contains(spawn, `if [ -n "$ref" ]; then`) {
		t.Errorf("spawn_reviewers must only export GOOSE_PROVIDER/MODEL when a pin ref is set, body:\n%s", spawn)
	}
}

// --- Phase 3: goose review fleet is read-only and emits no claude flags ---

func TestLoopCmd_GooseReviewFleetReadOnly(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t,
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security")
	// No claude-specific reviewer flags leak into the goose fleet.
	for _, forbidden := range []string{"--session-id", "--yolo", "codex exec"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("goose review fleet must not emit claude/gemini/codex flag %q", forbidden)
		}
	}
}

// --- Phase 3: bash syntax for the goose fleet variant ---

func TestLoopCmd_BashSyntax_GooseReviewFleet(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-goose-fleet.sh")
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	_, err := executeCommand(root, "loop", "-o", outPath,
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "security,correctness,quality", "--review-every", "2")
	if err != nil {
		t.Fatalf("generate failed: %v", err)
	}
	out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
	if err != nil {
		t.Errorf("bash -n failed on goose review-fleet script: %v\n%s", err, string(out))
	}
}

// --- REGRESSION (load-bearing): default claude path is byte-identical (R7) ---

func TestLoopCmd_DefaultClaudeByteIdentical(t *testing.T) {
	t.Parallel()
	// `ca loop` (no implementer) and `ca loop --implementer claude` must be identical,
	// modulo the timestamp header line which is generated from time.Now(). To compare
	// content deterministically we strip the "# Date:" header line from both.
	stripDate := func(s string) string {
		var out []string
		for _, line := range strings.Split(s, "\n") {
			if strings.HasPrefix(line, "# Date:") {
				continue
			}
			out = append(out, line)
		}
		return strings.Join(out, "\n")
	}

	def := stripDate(generateLoopScriptViaCmd(t))
	claude := stripDate(generateLoopScriptViaCmd(t, "--implementer", "claude"))
	if def != claude {
		t.Error("ca loop and ca loop --implementer claude must produce identical scripts")
	}

	// The default script must keep the claude prerequisite line EXACTLY.
	if !strings.Contains(def, `command -v claude >/dev/null || die "claude CLI required"`) {
		t.Error("default script must keep the exact claude CLI prerequisite line")
	}
	// The default script must keep bootstrap_preflight (bg backend).
	if !strings.Contains(def, "bootstrap_preflight") {
		t.Error("default script must keep bootstrap_preflight")
	}
	// The default script must NOT contain any goose / implementer-marker bytes.
	for _, forbidden := range []string{"goose", "CA_IMPLEMENTER", "GOOSE_PROVIDER", "GOOSE_MODEL"} {
		if strings.Contains(def, forbidden) {
			t.Errorf("default claude script must NOT contain %q (R7 byte-identity)", forbidden)
		}
	}

	// The seam wrapper must delegate to the claude impl byte-for-byte.
	if loopScriptSeam("bg", false) != loopScriptSeamImpl("claude", "bg", false) {
		t.Error("loopScriptSeam(bg,false) must equal loopScriptSeamImpl(claude,bg,false)")
	}
	if loopScriptSeam("p", true) != loopScriptSeamImpl("claude", "p", true) {
		t.Error("loopScriptSeam(p,true) must equal loopScriptSeamImpl(claude,p,true)")
	}
}

// --- Goose emits implementer + provider/model config ---

func TestLoopCmd_GooseEmitsImplementerAndProviderModel(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if !strings.Contains(script, "CA_IMPLEMENTER=goose") {
		t.Error("goose script must emit CA_IMPLEMENTER=goose")
	}
	if !strings.Contains(script, "GOOSE_PROVIDER=${MODEL%%/*}") {
		t.Error("goose script must derive GOOSE_PROVIDER from MODEL via ${MODEL%%/*}")
	}
	if !strings.Contains(script, "GOOSE_MODEL=${MODEL#*/}") {
		t.Error("goose script must derive GOOSE_MODEL from MODEL via ${MODEL#*/}")
	}
	if !strings.Contains(script, "export GOOSE_PROVIDER GOOSE_MODEL") {
		t.Error("goose script must export GOOSE_PROVIDER and GOOSE_MODEL")
	}
	// Implementer prereq must be goose, not claude.
	if !strings.Contains(script, `command -v goose >/dev/null || die "goose CLI required"`) {
		t.Error("goose script must require the goose CLI")
	}
	if strings.Contains(script, `command -v claude >/dev/null || die "claude CLI required"`) {
		t.Error("goose script must NOT require the claude CLI as the implementer prereq")
	}
	// bd stays for both.
	if !strings.Contains(script, "command -v bd >/dev/null") {
		t.Error("goose script must still require the bd CLI")
	}
}

// --- Goose script header references goose, not Claude Code sessions ---

func TestLoopCmd_GooseHeaderReferencesGoose(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	// The generated goose script's header comment must describe goose sessions,
	// not Claude Code sessions. (The claude header stays byte-identical, proven by
	// TestLoopCmd_DefaultClaudeByteIdentical.)
	if !strings.Contains(script, "# Autonomously processes beads epics via goose sessions.") {
		t.Error("goose script header must read 'via goose sessions'")
	}
	if strings.Contains(script, "via Claude Code sessions") {
		t.Error("goose script header must NOT reference Claude Code sessions")
	}
}

// --- Goose dispatch uses goose run ---

func TestLoopCmd_GooseDispatchUsesGooseRun(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if !strings.Contains(script, "goose run") {
		t.Error("goose agent_dispatch must run 'goose run'")
	}
	if !strings.Contains(script, "--no-session") {
		t.Error("goose agent_dispatch must use --no-session")
	}
	if !strings.Contains(script, "AGENT_HANDLE=$!") {
		t.Error("goose agent_dispatch must set AGENT_HANDLE=$! (background subshell PID)")
	}
	// Must NOT dispatch via claude --bg on the goose path.
	if strings.Contains(script, "claude --bg") {
		t.Error("goose script must NOT dispatch via 'claude --bg'")
	}
}

// extractShellFunc returns the body of `name() { ... }` from a bash script,
// matching braces so nested blocks (subshells, if/then) are included. The
// returned string is the content between the opening and the matching closing
// brace (exclusive). Fails the test if the function is not found.
func extractShellFunc(t *testing.T, script, name string) string {
	t.Helper()
	header := name + "() {"
	start := strings.Index(script, header)
	if start < 0 {
		t.Fatalf("function %s not found", name)
	}
	i := start + len(header)
	depth := 1
	bodyStart := i
	for i < len(script) {
		switch script[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return script[bodyStart:i]
			}
		}
		i++
	}
	t.Fatalf("unbalanced braces in function %s", name)
	return ""
}

// --- FIX-7: agent_dispatch is async (background + PID handle), agent_invoke is sync ---

func TestLoopCmd_GooseDispatchVsInvokeDistinction(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")

	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, `goose run --no-session -i "$promptfile"`) {
		t.Errorf("agent_dispatch must run 'goose run --no-session -i \"$promptfile\"', body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "AGENT_HANDLE=$!") {
		t.Errorf("agent_dispatch must set AGENT_HANDLE=$! (background PID handle), body:\n%s", dispatch)
	}

	invoke := extractShellFunc(t, script, "agent_invoke")
	if strings.Contains(invoke, "AGENT_HANDLE=$!") {
		t.Errorf("agent_invoke must be synchronous (no AGENT_HANDLE=$!), body:\n%s", invoke)
	}
	// Synchronous: no line backgrounds the goose run with a trailing '&'.
	for _, line := range strings.Split(invoke, "\n") {
		trimmed := strings.TrimRight(strings.TrimSpace(line), " ")
		if strings.HasSuffix(trimmed, "&") && !strings.HasSuffix(trimmed, "&&") {
			t.Errorf("agent_invoke must not background any command (trailing '&'), line: %q", line)
		}
	}
}

// --- FIX-1: goose agent_dispatch puts the background subshell in its own process group ---

func TestLoopCmd_GooseDispatchSetsOwnProcessGroup(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")

	dispatch := extractShellFunc(t, script, "agent_dispatch")
	// macOS has no setsid; `set -m` (monitor mode) gives the backgrounded
	// subshell its own process group so kill -- -PID reaches the goose child.
	if !strings.Contains(dispatch, "set -m") {
		t.Errorf("goose agent_dispatch must enable job control (set -m) so $! leads its own process group, body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "set +m") {
		t.Errorf("goose agent_dispatch must restore set +m after dispatch, body:\n%s", dispatch)
	}
	// AGENT_HANDLE must still be the backgrounded subshell PID.
	if !strings.Contains(dispatch, "AGENT_HANDLE=$!") {
		t.Errorf("goose agent_dispatch must keep AGENT_HANDLE=$!, body:\n%s", dispatch)
	}
	// agent_stop must still kill the process group, then fall back to the PID.
	stop := extractShellFunc(t, script, "agent_stop")
	if !strings.Contains(stop, `kill -TERM -- -"$handle"`) {
		t.Errorf("goose agent_stop must kill the process group (kill -TERM -- -\"$handle\"), body:\n%s", stop)
	}
}

// --- Goose poll uses kill -0 ---

func TestLoopCmd_GoosePollUsesKill0(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if !strings.Contains(script, "kill -0") {
		t.Error("goose agent_poll must use 'kill -0' for a PID poll")
	}
	if !strings.Contains(script, "echo running") || !strings.Contains(script, "echo done") {
		t.Error("goose agent_poll must echo running/done")
	}
	// PID poll, no state.json on the goose path.
	if strings.Contains(script, "state.json") {
		t.Error("goose script must not poll claude bg state.json")
	}
}

// --- Goose collect/cleanup are in-tree, no worktree harvest ---

func TestLoopCmd_GooseCollectInTreeNoHarvest(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	for _, forbidden := range []string{"git worktree", "git merge --no-ff", "claude rm"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("goose script must not harvest worktrees: found %q", forbidden)
		}
	}
}

// --- Goose prompt requires the marker and an explicit commit ---

func TestLoopCmd_GoosePromptHasMarkerAndCommit(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	// Marker on its own line.
	if !strings.Contains(script, "\nEPIC_COMPLETE\n") {
		t.Error("goose build_prompt must require EPIC_COMPLETE on its own line")
	}
	if !strings.Contains(script, "EPIC_FAILED") {
		t.Error("goose build_prompt must mention EPIC_FAILED")
	}
	if !strings.Contains(script, "HUMAN_REQUIRED:") {
		t.Error("goose build_prompt must mention HUMAN_REQUIRED:")
	}
	// Explicit commit: goose does not auto-commit.
	if !strings.Contains(script, "git add -A") {
		t.Error("goose build_prompt must instruct an explicit 'git add -A'")
	}
	if !strings.Contains(script, "git commit") {
		t.Error("goose build_prompt must instruct an explicit 'git commit'")
	}
	if !strings.Contains(script, "git push") {
		t.Error("goose build_prompt must instruct an explicit 'git push'")
	}
}

// --- Goose skips claude-specific preflight, has a goose preflight ---

func TestLoopCmd_GooseSkipsClaudePreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if strings.Contains(script, "bootstrap_preflight") {
		t.Error("goose script must NOT include bootstrap_preflight (claude-bg only)")
	}
	if strings.Contains(script, "bgIsolation") {
		t.Error("goose script must NOT reference worktree.bgIsolation")
	}
	if strings.Contains(script, "disclaimer") {
		t.Error("goose script must NOT reference the bypass-disclaimer probe")
	}
	if !strings.Contains(script, "goose_preflight") {
		t.Error("goose script must include a goose_preflight function")
	}
	if !strings.Contains(script, "command -v goose") {
		t.Error("goose preflight must check 'command -v goose'")
	}
}

// --- Goose preflight: ollama context vs API key ---

func TestLoopCmd_GoosePreflightOllamaContext(t *testing.T) {
	t.Parallel()
	ollama := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "ollama/qwen2.5-coder:14b")
	if !strings.Contains(ollama, "OLLAMA_CONTEXT_LENGTH") {
		t.Error("ollama goose preflight must reference OLLAMA_CONTEXT_LENGTH")
	}
	if !strings.Contains(ollama, "ollama pull") {
		t.Error("ollama goose preflight must reference 'ollama pull' remediation")
	}
	// FIX-3: the model-pulled check must capture the model list once and use a
	// fixed-string (grep -Fq) match to avoid false "not pulled" failures from
	// regex-special characters in the model ref (e.g. the colon in :14b).
	if !strings.Contains(ollama, `_ollama_models="$(ollama list 2>/dev/null || true)"`) {
		t.Error("ollama preflight must capture the model list once into _ollama_models")
	}
	if !strings.Contains(ollama, `grep -Fq -- "$GOOSE_MODEL"`) {
		t.Error("ollama preflight must use a fixed-string match (grep -Fq -- \"$GOOSE_MODEL\")")
	}
	// The old, false-positive-prone pipeline must be gone.
	if strings.Contains(ollama, `ollama list 2>/dev/null | grep -q "$GOOSE_MODEL"`) {
		t.Error("ollama preflight must not use the unanchored 'ollama list | grep -q' pipeline")
	}

	api := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	// API provider preflight must name the provider's API key env var in remediation.
	if !strings.Contains(api, "API key") && !strings.Contains(api, "API_KEY") {
		t.Error("API goose preflight must reference the provider API key env var")
	}
}

// --- GOOSE_TOOLSHIM is wired for ollama (local models emit no native tool_calls) ---

func TestLoopCmd_GooseOllamaExportsToolshim(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "ollama/qwen2.5-coder:14b")
	// The toolshim export is gated on the runtime-derived $GOOSE_PROVIDER so the
	// generator stays simple and the bash conditional decides at runtime.
	if !strings.Contains(script, `if [ "$GOOSE_PROVIDER" = "ollama" ]`) {
		t.Error("goose script must guard the toolshim export on [ \"$GOOSE_PROVIDER\" = \"ollama\" ]")
	}
	// No-clobber export using parameter-default expansion.
	if !strings.Contains(script, `export GOOSE_TOOLSHIM="${GOOSE_TOOLSHIM:-1}"`) {
		t.Error(`goose script must emit export GOOSE_TOOLSHIM="${GOOSE_TOOLSHIM:-1}"`)
	}
	// The explanatory rationale must be present.
	if !strings.Contains(script, "local ollama models do not emit native tool_calls") {
		t.Error("goose script must explain why ollama needs GOOSE_TOOLSHIM (local models do not emit native tool_calls)")
	}
}

// --- Non-ollama (API) providers get no unconditional toolshim export ---

func TestLoopCmd_GooseNonOllamaNoToolshim(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	// There must be no unconditional/forced toolshim export. The runtime guard
	// keyed on $GOOSE_PROVIDER may still be present (bash decides at runtime), but
	// a bare `export GOOSE_TOOLSHIM=1` would force it on for deepseek.
	if strings.Contains(script, "export GOOSE_TOOLSHIM=1") {
		t.Error("non-ollama goose script must NOT contain an unconditional export GOOSE_TOOLSHIM=1")
	}
}

// --- The toolshim export is no-clobber: a user-set value wins ---

func TestLoopCmd_GooseToolshimNoClobber(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "ollama/qwen2.5-coder:14b")
	// Parameter-default expansion (${GOOSE_TOOLSHIM:-1}) preserves a user-set value
	// instead of force-setting 1, which a bare `GOOSE_TOOLSHIM=1` would clobber.
	if !strings.Contains(script, "${GOOSE_TOOLSHIM:-1}") {
		t.Error("toolshim export must use no-clobber default expansion ${GOOSE_TOOLSHIM:-1}")
	}
	if strings.Contains(script, "export GOOSE_TOOLSHIM=1\n") {
		t.Error("toolshim export must not use a bare clobbering export GOOSE_TOOLSHIM=1")
	}
}

// --- detect_marker is identical for goose and claude (R2) ---

func TestLoopCmd_GooseDetectMarkerUnchanged(t *testing.T) {
	t.Parallel()
	claude := generateLoopScriptViaCmd(t)
	goose := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	extract := func(s string) string {
		start := strings.Index(s, "detect_marker() {")
		if start < 0 {
			t.Fatal("detect_marker not found")
		}
		end := strings.Index(s[start:], "\n}\n")
		if end < 0 {
			t.Fatal("detect_marker close not found")
		}
		return s[start : start+end+3]
	}
	if extract(claude) != extract(goose) {
		t.Error("detect_marker must be byte-identical between claude and goose (R2)")
	}
}

// --- FIX-2: goose marker detection falls back to the beads epic status ---

func TestLoopCmd_GooseMarkerFallsBackToBdState(t *testing.T) {
	t.Parallel()
	goose := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")

	// A goose-only wrapper consults beads when the log/trace carries no marker.
	wrapper := extractShellFunc(t, goose, "detect_marker_with_bd_state")
	// It must first delegate to the byte-frozen detect_marker.
	if !strings.Contains(wrapper, "detect_marker") {
		t.Errorf("detect_marker_with_bd_state must delegate to detect_marker, body:\n%s", wrapper)
	}
	// Only when detect_marker returns "none" does it consult beads.
	if !strings.Contains(wrapper, `"none"`) {
		t.Errorf("detect_marker_with_bd_state must only fall back when the marker is none, body:\n%s", wrapper)
	}
	// Fallback reads the epic status via bd show + parse_json .status.
	if !strings.Contains(wrapper, "bd show") || !strings.Contains(wrapper, "parse_json '.status'") {
		t.Errorf("detect_marker_with_bd_state must read status via bd show + parse_json '.status', body:\n%s", wrapper)
	}
	// A closed epic maps to complete.
	if !strings.Contains(wrapper, "closed") || !strings.Contains(wrapper, "echo complete") {
		t.Errorf("detect_marker_with_bd_state must map a closed epic to complete, body:\n%s", wrapper)
	}

	// The goose collect site must call the wrapper, not bare detect_marker.
	if !strings.Contains(goose, `MARKER=$(detect_marker_with_bd_state "$EPIC_ID" "$LOGFILE" "$TRACEFILE")`) {
		t.Error("goose collect site must use detect_marker_with_bd_state with EPIC_ID")
	}
}

// --- Bash syntax check for the goose variants ---

// --- Goose preflight API-key check uses indirect expansion, not eval (no injection) ---

func TestLoopCmd_GoosePreflightNoEvalInjection(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	// The API-key emptiness check must use bash indirect expansion ${!key_var:-},
	// which does NOT re-parse the value, instead of eval (which executes any
	// command substitution embedded in a hostile provider half of --model).
	if !strings.Contains(script, "${!key_var") {
		t.Error("goose preflight must use bash indirect expansion ${!key_var:-} for the API-key check")
	}
	// The eval-based form must be gone: it re-parses the parameter expansion and
	// is a command-injection vector via the provider derived from --model.
	if strings.Contains(script, `eval "printf`) {
		t.Error("goose preflight must NOT use eval for the API-key check (injection vector)")
	}
	if strings.Contains(script, `eval "printf '%s' \"\${$key_var`) {
		t.Error("goose preflight must NOT eval the key_var parameter expansion (injection vector)")
	}
}

// --- Goose implementer prompt invokes the ca primitives (search/knowledge/phase-check/learn) ---

func TestLoopCmd_GoosePromptInvokesCaPrimitives(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	prompt := extractShellFunc(t, script, "build_prompt")
	// The driving prompt must actually invoke the compound primitives, not rely on
	// .goosehints being honored. Pre-phase prior-art lookups:
	for _, primitive := range []string{"ca search", "ca knowledge"} {
		if !strings.Contains(prompt, primitive) {
			t.Errorf("goose build_prompt must invoke %q for prior art, body:\n%s", primitive, prompt)
		}
	}
	// Phase gating and compound capture:
	if !strings.Contains(prompt, "ca phase-check") {
		t.Errorf("goose build_prompt must gate phase transitions with 'ca phase-check', body:\n%s", prompt)
	}
	if !strings.Contains(prompt, "ca learn") {
		t.Errorf("goose build_prompt must invoke 'ca learn' to capture lessons, body:\n%s", prompt)
	}
	if !strings.Contains(prompt, "ca verify-gates") {
		t.Errorf("goose build_prompt must invoke 'ca verify-gates' as the final gate, body:\n%s", prompt)
	}
}

// --- The dead commented recipe fork is not advertised in agent_dispatch ---

func TestLoopCmd_GooseDispatchNoDeadRecipeComment(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "goose", "--model", "deepseek/deepseek-chat")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	// The inline-prompt path is the implementer wiring; the recipe must not be
	// advertised as a commented-out alternative that is never run.
	if strings.Contains(dispatch, "compound-cook-it") {
		t.Errorf("agent_dispatch must not advertise the dead compound-cook-it recipe fork, body:\n%s", dispatch)
	}
}

func TestLoopCmd_BashSyntax_Goose(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	for _, model := range []string{"deepseek/deepseek-chat", "ollama/qwen2.5-coder:14b"} {
		dir := t.TempDir()
		outPath := filepath.Join(dir, "loop-goose.sh")
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		_, err := executeCommand(root, "loop", "-o", outPath,
			"--implementer", "goose", "--model", model)
		if err != nil {
			t.Fatalf("generate failed for %s: %v", model, err)
		}
		out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
		if err != nil {
			t.Errorf("bash -n failed on goose loop script (%s): %v\n%s", model, err, string(out))
		}
		_ = os.Remove(outPath)
	}
}
