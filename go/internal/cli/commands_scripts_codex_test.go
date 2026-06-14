package cli

// Codex implementer tests for `ca loop --implementer codex`.
// TDD: written FAIL-BEFORE / PASS-AFTER. The codex engine is PID-based (like goose:
// CA_BACKEND=p, set -m process group, wait+watchdog, no worktree harvest) and uses a
// PLAIN model name (default gpt-5.5-codex) so the goose provider/model and
// --review-models gates must NOT fire. The default --implementer claude path and the
// goose path must both stay byte-identical (proven by their own guard tests).

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Enum: --implementer now accepts codex and gemini (default still claude) ---

func TestLoopCmd_ImplementerAcceptsCodexAndGemini(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for i, impl := range []string{"codex", "gemini"} {
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		out := filepath.Join(dir, impl+".sh")
		var model string
		switch impl {
		case "codex":
			model = "gpt-5.5-codex"
		case "gemini":
			model = "gemini-3.1-pro"
		}
		_, err := executeCommand(root, "loop", "-o", out, "--implementer", impl, "--model", model)
		if err != nil {
			t.Fatalf("--implementer %s (#%d) should be accepted, got: %v", impl, i, err)
		}
	}
	// Default is still claude.
	lc := loopCmd()
	if f := lc.Flags().Lookup("implementer"); f == nil || f.DefValue != "claude" {
		t.Errorf("--implementer default must remain 'claude', got %v", f)
	}
}

// --- Enum: foo still rejected, message lists all four valid values ---

func TestLoopCmd_InvalidImplementerStillRejected(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "foo.sh"), "--implementer", "foo")
	if err == nil {
		t.Fatal("expected error for invalid --implementer value 'foo'")
	}
	for _, valid := range []string{"claude", "goose", "codex", "gemini"} {
		if !strings.Contains(err.Error(), valid) {
			t.Errorf("error message must list valid value %q, got: %v", valid, err)
		}
	}
}

// --- Gate bypass: codex/gemini accept a PLAIN model name (no provider/ slash) ---

func TestLoopCmd_CodexGeminiAcceptPlainModel(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	cases := []struct{ impl, model string }{
		{"codex", "gpt-5.5-codex"},
		{"gemini", "gemini-3.1-pro"},
	}
	for _, c := range cases {
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, c.impl+"-plain.sh"),
			"--implementer", c.impl, "--model", c.model)
		if err != nil {
			t.Errorf("--implementer %s must accept the plain model %q (no slash), got: %v", c.impl, c.model, err)
		}
	}
}

// --- Gate: --review-models stays goose-only (rejected for codex/gemini) ---

func TestLoopCmd_CodexGeminiRejectReviewModels(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	for _, impl := range []string{"codex", "gemini"} {
		var model string
		if impl == "codex" {
			model = "gpt-5.5-codex"
		} else {
			model = "gemini-3.1-pro"
		}
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, impl+"-rm.sh"),
			"--implementer", impl, "--model", model,
			"--review-models", "security=ollama/qwen2.5-coder:14b")
		if err == nil {
			t.Fatalf("--review-models must be rejected for --implementer %s (goose-only)", impl)
		}
		if !strings.Contains(err.Error(), "goose") {
			t.Errorf("error should explain --review-models is goose-only, got: %v", err)
		}
	}
}

// --- Codex dispatch uses codex exec ---

func TestLoopCmd_CodexDispatchUsesCodexExec(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "codex exec") {
		t.Errorf("codex agent_dispatch must run 'codex exec', body:\n%s", dispatch)
	}
	// Proven invocation flags: workspace-write sandbox, never-approval, skip-git-repo-check.
	if !strings.Contains(dispatch, "--sandbox workspace-write") {
		t.Errorf("codex agent_dispatch must use --sandbox workspace-write, body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, `approval_policy="never"`) {
		t.Errorf("codex agent_dispatch must set -c approval_policy=\"never\", body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "--skip-git-repo-check") {
		t.Errorf("codex agent_dispatch must pass --skip-git-repo-check, body:\n%s", dispatch)
	}
	// CRITICAL: stdin must be redirected from /dev/null or codex exec hangs.
	if !strings.Contains(dispatch, "< /dev/null") {
		t.Errorf("codex agent_dispatch MUST redirect stdin '< /dev/null' or it hangs, body:\n%s", dispatch)
	}
	// Forbidden post-exec global flags (rejected by codex).
	for _, forbidden := range []string{"--full-auto", "--ask-for-approval"} {
		if strings.Contains(dispatch, forbidden) {
			t.Errorf("codex agent_dispatch must NOT use %q after exec, body:\n%s", forbidden, dispatch)
		}
	}
	if !strings.Contains(dispatch, "AGENT_HANDLE=$!") {
		t.Errorf("codex agent_dispatch must set AGENT_HANDLE=$! (background subshell PID), body:\n%s", dispatch)
	}
	// Must NOT dispatch via claude --bg or goose run on the codex path.
	if strings.Contains(script, "claude --bg") {
		t.Error("codex script must NOT dispatch via 'claude --bg'")
	}
	if strings.Contains(dispatch, "goose run") {
		t.Errorf("codex agent_dispatch must NOT run goose, body:\n%s", dispatch)
	}
}

// --- Codex dispatch runs in its own process group (set -m / set +m) ---

func TestLoopCmd_CodexDispatchSetsOwnProcessGroup(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "set -m") {
		t.Errorf("codex agent_dispatch must enable job control (set -m), body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "set +m") {
		t.Errorf("codex agent_dispatch must restore set +m, body:\n%s", dispatch)
	}
	stop := extractShellFunc(t, script, "agent_stop")
	if !strings.Contains(stop, `kill -TERM -- -"$handle"`) {
		t.Errorf("codex agent_stop must kill the process group, body:\n%s", stop)
	}
}

// --- Codex poll uses kill -0, no state.json ---

func TestLoopCmd_CodexPollUsesKill0(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	poll := extractShellFunc(t, script, "agent_poll")
	if !strings.Contains(poll, "kill -0") {
		t.Errorf("codex agent_poll must use 'kill -0' for a PID poll, body:\n%s", poll)
	}
	if !strings.Contains(poll, "echo running") || !strings.Contains(poll, "echo done") {
		t.Errorf("codex agent_poll must echo running/done, body:\n%s", poll)
	}
	if strings.Contains(script, "state.json") {
		t.Error("codex script must not poll claude bg state.json")
	}
}

// --- Codex collect/cleanup are in-tree, no worktree harvest ---

func TestLoopCmd_CodexCollectInTreeNoHarvest(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	for _, forbidden := range []string{"git worktree", "git merge --no-ff", "claude rm", "state.json"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("codex script must not harvest worktrees / poll bg state: found %q", forbidden)
		}
	}
}

// --- Codex emits its implementer marker and the p backend ---

func TestLoopCmd_CodexEmitsImplementerMarker(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	if !strings.Contains(script, "CA_IMPLEMENTER=codex") {
		t.Error("codex script must emit CA_IMPLEMENTER=codex")
	}
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("codex script must set CA_BACKEND=p (PID-based)")
	}
	// Implementer prereq must be codex, NOT claude.
	if !strings.Contains(script, `command -v codex >/dev/null || die "codex CLI required"`) {
		t.Error("codex script must require the codex CLI")
	}
	if strings.Contains(script, `command -v claude >/dev/null || die "claude CLI required"`) {
		t.Error("codex script must NOT require the claude CLI as the implementer prereq")
	}
	// No goose provider/model derivation on the codex path (plain model name).
	for _, forbidden := range []string{"GOOSE_PROVIDER", "GOOSE_MODEL", "CA_IMPLEMENTER=goose"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("codex script must NOT contain goose-only bytes %q", forbidden)
		}
	}
	// bd stays.
	if !strings.Contains(script, "command -v bd >/dev/null") {
		t.Error("codex script must still require the bd CLI")
	}
}

// --- Codex header references codex sessions, not Claude Code / goose ---

func TestLoopCmd_CodexHeaderReferencesEngine(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	if !strings.Contains(script, "# Autonomously processes beads epics via codex sessions.") {
		t.Error("codex script header must read 'via codex sessions'")
	}
	if strings.Contains(script, "via Claude Code sessions") {
		t.Error("codex script header must NOT reference Claude Code sessions")
	}
	if strings.Contains(script, "via goose sessions") {
		t.Error("codex script header must NOT reference goose sessions")
	}
}

// --- Codex prompt requires the marker and an explicit commit ---

func TestLoopCmd_CodexPromptHasMarkerAndCommit(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	if !strings.Contains(script, "\nEPIC_COMPLETE\n") {
		t.Error("codex build_prompt must require EPIC_COMPLETE on its own line")
	}
	if !strings.Contains(script, "EPIC_FAILED") {
		t.Error("codex build_prompt must mention EPIC_FAILED")
	}
	if !strings.Contains(script, "HUMAN_REQUIRED:") {
		t.Error("codex build_prompt must mention HUMAN_REQUIRED:")
	}
	// Codex does not auto-commit: explicit git add/commit/push.
	if !strings.Contains(script, "git add -A") {
		t.Error("codex build_prompt must instruct an explicit 'git add -A'")
	}
	if !strings.Contains(script, "git commit") {
		t.Error("codex build_prompt must instruct an explicit 'git commit'")
	}
	if !strings.Contains(script, "git push") {
		t.Error("codex build_prompt must instruct an explicit 'git push'")
	}
}

// --- Codex prompt invokes the ca primitives ladder ---

func TestLoopCmd_CodexPromptInvokesCaPrimitives(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	prompt := extractShellFunc(t, script, "build_prompt")
	for _, primitive := range []string{"ca search", "ca knowledge", "ca phase-check", "ca learn", "ca verify-gates"} {
		if !strings.Contains(prompt, primitive) {
			t.Errorf("codex build_prompt must invoke %q, body:\n%s", primitive, prompt)
		}
	}
}

// --- Codex preflight checks codex login status, skips claude-bg preflight ---

func TestLoopCmd_CodexPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	if !strings.Contains(script, "codex_preflight") {
		t.Error("codex script must include a codex_preflight function")
	}
	if !strings.Contains(script, "command -v codex") {
		t.Error("codex preflight must check 'command -v codex'")
	}
	// Auth is ChatGPT login: a soft (warn, not die) login-status probe.
	if !strings.Contains(script, "codex login status") {
		t.Error("codex preflight must probe 'codex login status'")
	}
}

// --- Codex skips claude-bg-specific preflight ---

func TestLoopCmd_CodexSkipsClaudePreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	for _, forbidden := range []string{"bootstrap_preflight", "bgIsolation", "disclaimer"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("codex script must NOT include claude-bg-only %q", forbidden)
		}
	}
}

// --- detect_marker is byte-identical between codex and claude ---

func TestLoopCmd_CodexDetectMarkerUnchanged(t *testing.T) {
	t.Parallel()
	claude := generateLoopScriptViaCmd(t)
	codex := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
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
	if extract(claude) != extract(codex) {
		t.Error("detect_marker must be byte-identical between claude and codex")
	}
}

// --- Codex reuses the goose bd-state marker fallback wrapper ---

func TestLoopCmd_CodexMarkerFallsBackToBdState(t *testing.T) {
	t.Parallel()
	codex := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex")
	wrapper := extractShellFunc(t, codex, "detect_marker_with_bd_state")
	if !strings.Contains(wrapper, "detect_marker") {
		t.Errorf("detect_marker_with_bd_state must delegate to detect_marker, body:\n%s", wrapper)
	}
	if !strings.Contains(wrapper, `"none"`) {
		t.Errorf("detect_marker_with_bd_state must only fall back when the marker is none, body:\n%s", wrapper)
	}
	if !strings.Contains(wrapper, "bd show") || !strings.Contains(wrapper, "parse_json '.status'") {
		t.Errorf("detect_marker_with_bd_state must read status via bd show + parse_json '.status', body:\n%s", wrapper)
	}
	if !strings.Contains(wrapper, "closed") || !strings.Contains(wrapper, "echo complete") {
		t.Errorf("detect_marker_with_bd_state must map a closed epic to complete, body:\n%s", wrapper)
	}
	if !strings.Contains(codex, `MARKER=$(detect_marker_with_bd_state "$EPIC_ID" "$LOGFILE" "$TRACEFILE")`) {
		t.Error("codex collect site must use detect_marker_with_bd_state with EPIC_ID")
	}
}

// --- Codex implementer review reuses the CLI-reviewer dispatch, agent_invoke runs codex ---

func TestLoopCmd_CodexImplementerReviewUsesCliReviewers(t *testing.T) {
	t.Parallel()
	// codex/gemini are the only CLI-direct reviewers valid for the codex implementer:
	// a claude reviewer would route through agent_invoke (which runs codex here), so
	// it is rejected at flag-validation time (codex review P2).
	script := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5.5-codex",
		"--reviewers", "codex,gemini")
	// REVIEW_MODEL feeds the implementer fix-session (codex exec -m). Without an
	// explicit --review-model it must default to the codex engine model, NOT a
	// claude id that 'codex exec' would reject.
	if !strings.Contains(script, "REVIEW_MODEL='gpt-5.5-codex'") {
		t.Error("codex review fix-session REVIEW_MODEL must default to 'gpt-5.5-codex', not the claude default")
	}
	if strings.Contains(script, "REVIEW_MODEL='claude-opus-4-7[1m]'") {
		t.Error("codex review must NOT keep the claude REVIEW_MODEL default")
	}
	// The CLI-reviewer wiring must be present (not the goose fleet).
	for _, fn := range []string{"detect_reviewers", "spawn_reviewers", "feed_implementer"} {
		if !strings.Contains(script, fn) {
			t.Errorf("codex implementer review must wire %q (CLI-reviewer dispatch)", fn)
		}
	}
	// No goose review fleet on the codex path.
	if strings.Contains(script, "goose run --recipe") {
		t.Error("codex implementer review must NOT spawn the goose review fleet")
	}
	// feed_implementer's fix-session must run codex, not claude: agent_invoke routes to codex exec.
	invoke := extractShellFunc(t, script, "agent_invoke")
	if !strings.Contains(invoke, "codex exec") {
		t.Errorf("codex agent_invoke must run 'codex exec' (review fix-session), body:\n%s", invoke)
	}
	// agent_invoke must consume the -p flag and pass the prompt positionally with stdin redirected.
	if !strings.Contains(invoke, "< /dev/null") {
		t.Errorf("codex agent_invoke must redirect stdin '< /dev/null', body:\n%s", invoke)
	}
	if strings.Contains(invoke, "claude --") {
		t.Errorf("codex agent_invoke must NOT fall through to claude, body:\n%s", invoke)
	}
}

// --- Codex review model defaults to the codex engine, explicit flag wins ---

func TestLoopCmd_CodexReviewModelDefaultAndOverride(t *testing.T) {
	t.Parallel()
	// No --review-model: defaults to the codex engine model so the fix-session's
	// 'codex exec -m' gets a valid id.
	def := generateLoopScriptViaCmd(t, "--implementer", "codex", "--reviewers", "codex")
	if !strings.Contains(def, "REVIEW_MODEL='gpt-5.5-codex'") {
		t.Error("codex review-model must default to 'gpt-5.5-codex' when --review-model is omitted")
	}
	// Explicit --review-model still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "codex", "--reviewers", "codex",
		"--review-model", "gpt-5-codex-mini")
	if !strings.Contains(override, "REVIEW_MODEL='gpt-5-codex-mini'") {
		t.Error("explicit --review-model must override the codex default")
	}
}

// --- Codex default model is the codex default, not the claude default ---

func TestLoopCmd_CodexDefaultModelIsCodex(t *testing.T) {
	t.Parallel()
	// No --model: the codex implementer must default to gpt-5.5-codex, NOT the
	// global claude default. An explicit --model still wins.
	script := generateLoopScriptViaCmd(t, "--implementer", "codex")
	if !strings.Contains(script, "MODEL='gpt-5.5-codex'") {
		t.Error("codex without --model must default MODEL to 'gpt-5.5-codex'")
	}
	if strings.Contains(script, "claude-opus-4-7[1m]") {
		t.Error("codex script must NOT inherit the claude default model when --model is omitted")
	}
	// Explicit override still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "codex", "--model", "gpt-5-codex-mini")
	if !strings.Contains(override, "MODEL='gpt-5-codex-mini'") {
		t.Error("explicit --model must override the codex default")
	}
}

// --- Bash syntax for codex variants (plain model + default model) ---

func TestLoopCmd_BashSyntax_Codex(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	variants := [][]string{
		{"--implementer", "codex", "--model", "gpt-5.5-codex"},
		{"--implementer", "codex"}, // default model
		{"--implementer", "codex", "--model", "gpt-5.5-codex", "--reviewers", "codex,gemini", "--review-every", "2"},
	}
	for i, flags := range variants {
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		outPath := filepath.Join(dir, "loop-codex.sh")
		args := append([]string{"loop", "-o", outPath, "--force"}, flags...)
		if _, err := executeCommand(root, args...); err != nil {
			t.Fatalf("generate failed (variant %d): %v", i, err)
		}
		out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
		if err != nil {
			t.Errorf("bash -n failed on codex loop script (variant %d): %v\n%s", i, err, string(out))
		}
	}
}
