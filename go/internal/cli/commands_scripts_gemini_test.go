package cli

// Gemini implementer tests for `ca loop --implementer gemini`.
// TDD: written FAIL-BEFORE / PASS-AFTER. The gemini engine is PID-based (like goose
// and codex: CA_BACKEND=p, set -m process group, wait+watchdog, no worktree harvest)
// and uses a PLAIN model name (default gemini-3.1-pro) so the goose provider/model and
// --review-models gates must NOT fire. The default --implementer claude path and the
// goose/codex paths must all stay byte-identical (proven by their own guard tests).
// The shared enum/gate tests (codex+gemini) live in commands_scripts_codex_test.go.

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Gemini dispatch uses gemini -p --yolo ---

func TestLoopCmd_GeminiDispatchUsesGeminiP(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "gemini -p") {
		t.Errorf("gemini agent_dispatch must run 'gemini -p', body:\n%s", dispatch)
	}
	// Proven invocation flags: --yolo for non-interactive auto-approval, -m for the model.
	if !strings.Contains(dispatch, "--yolo") {
		t.Errorf("gemini agent_dispatch must pass --yolo, body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, `-m "$model"`) {
		t.Errorf("gemini agent_dispatch must pass -m \"$model\", body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "AGENT_HANDLE=$!") {
		t.Errorf("gemini agent_dispatch must set AGENT_HANDLE=$! (background subshell PID), body:\n%s", dispatch)
	}
	// Must NOT dispatch via claude --bg, goose run, or codex exec on the gemini path.
	if strings.Contains(script, "claude --bg") {
		t.Error("gemini script must NOT dispatch via 'claude --bg'")
	}
	if strings.Contains(dispatch, "goose run") {
		t.Errorf("gemini agent_dispatch must NOT run goose, body:\n%s", dispatch)
	}
	if strings.Contains(dispatch, "codex exec") {
		t.Errorf("gemini agent_dispatch must NOT run codex, body:\n%s", dispatch)
	}
}

// --- Gemini dispatch runs in its own process group (set -m / set +m) ---

func TestLoopCmd_GeminiDispatchSetsOwnProcessGroup(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "set -m") {
		t.Errorf("gemini agent_dispatch must enable job control (set -m), body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "set +m") {
		t.Errorf("gemini agent_dispatch must restore set +m, body:\n%s", dispatch)
	}
	stop := extractShellFunc(t, script, "agent_stop")
	if !strings.Contains(stop, `kill -TERM -- -"$handle"`) {
		t.Errorf("gemini agent_stop must kill the process group, body:\n%s", stop)
	}
}

// --- Gemini poll uses kill -0, no state.json ---

func TestLoopCmd_GeminiPollUsesKill0(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	poll := extractShellFunc(t, script, "agent_poll")
	if !strings.Contains(poll, "kill -0") {
		t.Errorf("gemini agent_poll must use 'kill -0' for a PID poll, body:\n%s", poll)
	}
	if !strings.Contains(poll, "echo running") || !strings.Contains(poll, "echo done") {
		t.Errorf("gemini agent_poll must echo running/done, body:\n%s", poll)
	}
	if strings.Contains(script, "state.json") {
		t.Error("gemini script must not poll claude bg state.json")
	}
}

// --- Gemini collect/cleanup are in-tree, no worktree harvest ---

func TestLoopCmd_GeminiCollectInTreeNoHarvest(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	for _, forbidden := range []string{"git worktree", "git merge --no-ff", "claude rm", "state.json"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("gemini script must not harvest worktrees / poll bg state: found %q", forbidden)
		}
	}
}

// --- Gemini emits its implementer marker and the p backend ---

func TestLoopCmd_GeminiEmitsImplementerMarker(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "CA_IMPLEMENTER=gemini") {
		t.Error("gemini script must emit CA_IMPLEMENTER=gemini")
	}
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("gemini script must set CA_BACKEND=p (PID-based)")
	}
	// Implementer prereq must be gemini, NOT claude.
	if !strings.Contains(script, `command -v gemini >/dev/null || die "gemini CLI required"`) {
		t.Error("gemini script must require the gemini CLI")
	}
	if strings.Contains(script, `command -v claude >/dev/null || die "claude CLI required"`) {
		t.Error("gemini script must NOT require the claude CLI as the implementer prereq")
	}
	// No goose provider/model derivation on the gemini path (plain model name).
	for _, forbidden := range []string{"GOOSE_PROVIDER", "GOOSE_MODEL", "CA_IMPLEMENTER=goose", "CA_IMPLEMENTER=codex"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("gemini script must NOT contain other-engine bytes %q", forbidden)
		}
	}
	// bd stays.
	if !strings.Contains(script, "command -v bd >/dev/null") {
		t.Error("gemini script must still require the bd CLI")
	}
}

// --- Gemini header references gemini sessions, not Claude Code / goose / codex ---

func TestLoopCmd_GeminiHeaderReferencesEngine(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "# Autonomously processes beads epics via gemini sessions.") {
		t.Error("gemini script header must read 'via gemini sessions'")
	}
	if strings.Contains(script, "via Claude Code sessions") {
		t.Error("gemini script header must NOT reference Claude Code sessions")
	}
	if strings.Contains(script, "via goose sessions") {
		t.Error("gemini script header must NOT reference goose sessions")
	}
	if strings.Contains(script, "via codex sessions") {
		t.Error("gemini script header must NOT reference codex sessions")
	}
}

// --- Gemini prompt requires the marker and an explicit commit ---

func TestLoopCmd_GeminiPromptHasMarkerAndCommit(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "\nEPIC_COMPLETE\n") {
		t.Error("gemini build_prompt must require EPIC_COMPLETE on its own line")
	}
	if !strings.Contains(script, "EPIC_FAILED") {
		t.Error("gemini build_prompt must mention EPIC_FAILED")
	}
	if !strings.Contains(script, "HUMAN_REQUIRED:") {
		t.Error("gemini build_prompt must mention HUMAN_REQUIRED:")
	}
	// Gemini does not auto-commit: explicit git add/commit/push.
	if !strings.Contains(script, "git add -A") {
		t.Error("gemini build_prompt must instruct an explicit 'git add -A'")
	}
	if !strings.Contains(script, "git commit") {
		t.Error("gemini build_prompt must instruct an explicit 'git commit'")
	}
	if !strings.Contains(script, "git push") {
		t.Error("gemini build_prompt must instruct an explicit 'git push'")
	}
}

// --- Gemini prompt invokes the ca primitives ladder ---

func TestLoopCmd_GeminiPromptInvokesCaPrimitives(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	prompt := extractShellFunc(t, script, "build_prompt")
	for _, primitive := range []string{"ca search", "ca knowledge", "ca phase-check", "ca learn", "ca verify-gates"} {
		if !strings.Contains(prompt, primitive) {
			t.Errorf("gemini build_prompt must invoke %q, body:\n%s", primitive, prompt)
		}
	}
}

// --- Gemini preflight requires GEMINI_API_KEY, warns on default model, skips claude-bg ---

func TestLoopCmd_GeminiPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "gemini_preflight") {
		t.Error("gemini script must include a gemini_preflight function")
	}
	if !strings.Contains(script, "command -v gemini") {
		t.Error("gemini preflight must check 'command -v gemini'")
	}
	// Auth = GEMINI_API_KEY env: a hard die if it is empty.
	if !strings.Contains(script, "GEMINI_API_KEY") {
		t.Error("gemini preflight must require GEMINI_API_KEY")
	}
	// Soft warn that the default model may not be served by the current CLI.
	if !strings.Contains(script, "gemini-3.1-pro") {
		t.Error("gemini preflight must warn about the default gemini-3.1-pro availability")
	}
}

// --- Gemini skips claude-bg-specific preflight ---

func TestLoopCmd_GeminiSkipsClaudePreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	for _, forbidden := range []string{"bootstrap_preflight", "bgIsolation", "disclaimer"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("gemini script must NOT include claude-bg-only %q", forbidden)
		}
	}
}

// --- detect_marker is byte-identical between gemini and claude ---

func TestLoopCmd_GeminiDetectMarkerUnchanged(t *testing.T) {
	t.Parallel()
	claude := generateLoopScriptViaCmd(t)
	gemini := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
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
	if extract(claude) != extract(gemini) {
		t.Error("detect_marker must be byte-identical between claude and gemini")
	}
}

// --- Gemini reuses the goose bd-state marker fallback wrapper ---

func TestLoopCmd_GeminiMarkerFallsBackToBdState(t *testing.T) {
	t.Parallel()
	gemini := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro")
	wrapper := extractShellFunc(t, gemini, "detect_marker_with_bd_state")
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
	if !strings.Contains(gemini, `MARKER=$(detect_marker_with_bd_state "$EPIC_ID" "$LOGFILE" "$TRACEFILE")`) {
		t.Error("gemini collect site must use detect_marker_with_bd_state with EPIC_ID")
	}
}

// --- Gemini implementer review reuses the CLI-reviewer dispatch, agent_invoke runs gemini ---

func TestLoopCmd_GeminiImplementerReviewUsesCliReviewers(t *testing.T) {
	t.Parallel()
	// gemini/codex are the only CLI-direct reviewers valid for the gemini implementer:
	// a claude reviewer would route through agent_invoke (which runs gemini here), so
	// it is rejected at flag-validation time (codex review P2).
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-3.1-pro",
		"--reviewers", "gemini,codex")
	// REVIEW_MODEL feeds the implementer fix-session (gemini --yolo -m). Without an
	// explicit --review-model it must default to the gemini engine model, NOT a
	// claude id that gemini would reject.
	if !strings.Contains(script, "REVIEW_MODEL='gemini-3.1-pro'") {
		t.Error("gemini review fix-session REVIEW_MODEL must default to 'gemini-3.1-pro', not the claude default")
	}
	if strings.Contains(script, "REVIEW_MODEL='claude-opus-4-7[1m]'") {
		t.Error("gemini review must NOT keep the claude REVIEW_MODEL default")
	}
	// The CLI-reviewer wiring must be present (not the goose fleet).
	for _, fn := range []string{"detect_reviewers", "spawn_reviewers", "feed_implementer"} {
		if !strings.Contains(script, fn) {
			t.Errorf("gemini implementer review must wire %q (CLI-reviewer dispatch)", fn)
		}
	}
	// No goose review fleet on the gemini path.
	if strings.Contains(script, "goose run --recipe") {
		t.Error("gemini implementer review must NOT spawn the goose review fleet")
	}
	// feed_implementer's fix-session must run gemini, not claude: agent_invoke routes to gemini.
	invoke := extractShellFunc(t, script, "agent_invoke")
	if !strings.Contains(invoke, "gemini") {
		t.Errorf("gemini agent_invoke must run 'gemini' (review fix-session), body:\n%s", invoke)
	}
	// gemini takes -p natively, so the shared 'agent_invoke "$MODEL" -p "$prompt"' passes through.
	if !strings.Contains(invoke, "--yolo") {
		t.Errorf("gemini agent_invoke must pass --yolo for non-interactive review, body:\n%s", invoke)
	}
	if strings.Contains(invoke, "claude --") {
		t.Errorf("gemini agent_invoke must NOT fall through to claude, body:\n%s", invoke)
	}
}

// --- Gemini review model defaults to the gemini engine, explicit flag wins ---

func TestLoopCmd_GeminiReviewModelDefaultAndOverride(t *testing.T) {
	t.Parallel()
	// No --review-model: defaults to the gemini engine model so the fix-session's
	// 'gemini --yolo -m' gets a valid id.
	def := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--reviewers", "gemini")
	if !strings.Contains(def, "REVIEW_MODEL='gemini-3.1-pro'") {
		t.Error("gemini review-model must default to 'gemini-3.1-pro' when --review-model is omitted")
	}
	// Explicit --review-model still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--reviewers", "gemini",
		"--review-model", "gemini-2.5-pro")
	if !strings.Contains(override, "REVIEW_MODEL='gemini-2.5-pro'") {
		t.Error("explicit --review-model must override the gemini default")
	}
}

// --- Gemini default model is the gemini default, not the claude default ---

func TestLoopCmd_GeminiDefaultModelIsGemini(t *testing.T) {
	t.Parallel()
	// No --model: the gemini implementer must default to gemini-3.1-pro, NOT the
	// global claude default. An explicit --model still wins.
	script := generateLoopScriptViaCmd(t, "--implementer", "gemini")
	if !strings.Contains(script, "MODEL='gemini-3.1-pro'") {
		t.Error("gemini without --model must default MODEL to 'gemini-3.1-pro'")
	}
	if strings.Contains(script, "claude-opus-4-7[1m]") {
		t.Error("gemini script must NOT inherit the claude default model when --model is omitted")
	}
	// Explicit override still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "gemini", "--model", "gemini-2.5-pro")
	if !strings.Contains(override, "MODEL='gemini-2.5-pro'") {
		t.Error("explicit --model must override the gemini default")
	}
}

// --- Bash syntax for gemini variants (plain model + default model) ---

func TestLoopCmd_BashSyntax_Gemini(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	variants := [][]string{
		{"--implementer", "gemini", "--model", "gemini-3.1-pro"},
		{"--implementer", "gemini"}, // default model
		{"--implementer", "gemini", "--model", "gemini-3.1-pro", "--reviewers", "gemini,codex", "--review-every", "2"},
	}
	for i, flags := range variants {
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		outPath := filepath.Join(dir, "loop-gemini.sh")
		args := append([]string{"loop", "-o", outPath, "--force"}, flags...)
		if _, err := executeCommand(root, args...); err != nil {
			t.Fatalf("generate failed (variant %d): %v", i, err)
		}
		out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
		if err != nil {
			t.Errorf("bash -n failed on gemini loop script (variant %d): %v\n%s", i, err, string(out))
		}
	}
}
