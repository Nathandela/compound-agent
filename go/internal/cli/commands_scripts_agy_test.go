package cli

// Agy implementer tests for `ca loop --implementer agy`.
// TDD: written FAIL-BEFORE / PASS-AFTER. The agy engine is PID-based (like goose
// and codex: CA_BACKEND=p, set -m process group, wait+watchdog, no worktree harvest)
// and uses a PLAIN model name (default gemini-3.1-pro, served by agy) so the goose
// provider/model and --review-models gates must NOT fire. The default --implementer
// claude path and the goose/codex paths must all stay byte-identical (proven by their
// own guard tests). The shared enum/gate tests (codex+agy) live in
// commands_scripts_codex_test.go.

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// --- Agy dispatch uses agy -p --dangerously-skip-permissions --model --print-timeout ---

func TestLoopCmd_AgyDispatchUsesAgyP(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "agy -p") {
		t.Errorf("agy agent_dispatch must run 'agy -p', body:\n%s", dispatch)
	}
	// Confirmed invocation flags: --dangerously-skip-permissions auto-approves tool
	// use, --model selects the model, --print-timeout raises the print-mode wait cap.
	if !strings.Contains(dispatch, "--dangerously-skip-permissions") {
		t.Errorf("agy agent_dispatch must pass --dangerously-skip-permissions, body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, `--model "$model"`) {
		t.Errorf("agy agent_dispatch must pass --model \"$model\", body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "--print-timeout 1h") {
		t.Errorf("agy agent_dispatch must pass --print-timeout 1h, body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "AGENT_HANDLE=$!") {
		t.Errorf("agy agent_dispatch must set AGENT_HANDLE=$! (background subshell PID), body:\n%s", dispatch)
	}
	// Must NOT dispatch via claude --bg, goose run, codex exec, or the old gemini CLI.
	if strings.Contains(script, "claude --bg") {
		t.Error("agy script must NOT dispatch via 'claude --bg'")
	}
	if strings.Contains(dispatch, "goose run") {
		t.Errorf("agy agent_dispatch must NOT run goose, body:\n%s", dispatch)
	}
	if strings.Contains(dispatch, "codex exec") {
		t.Errorf("agy agent_dispatch must NOT run codex, body:\n%s", dispatch)
	}
	if strings.Contains(dispatch, "gemini -p") || strings.Contains(dispatch, "--yolo") {
		t.Errorf("agy agent_dispatch must NOT run the old gemini CLI / --yolo, body:\n%s", dispatch)
	}
}

// --- Agy dispatch runs in its own process group (set -m / set +m) ---

func TestLoopCmd_AgyDispatchSetsOwnProcessGroup(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	dispatch := extractShellFunc(t, script, "agent_dispatch")
	if !strings.Contains(dispatch, "set -m") {
		t.Errorf("agy agent_dispatch must enable job control (set -m), body:\n%s", dispatch)
	}
	if !strings.Contains(dispatch, "set +m") {
		t.Errorf("agy agent_dispatch must restore set +m, body:\n%s", dispatch)
	}
	stop := extractShellFunc(t, script, "agent_stop")
	if !strings.Contains(stop, `kill -TERM -- -"$handle"`) {
		t.Errorf("agy agent_stop must kill the process group, body:\n%s", stop)
	}
}

// --- Agy poll uses kill -0, no state.json ---

func TestLoopCmd_AgyPollUsesKill0(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	poll := extractShellFunc(t, script, "agent_poll")
	if !strings.Contains(poll, "kill -0") {
		t.Errorf("agy agent_poll must use 'kill -0' for a PID poll, body:\n%s", poll)
	}
	if !strings.Contains(poll, "echo running") || !strings.Contains(poll, "echo done") {
		t.Errorf("agy agent_poll must echo running/done, body:\n%s", poll)
	}
	if strings.Contains(script, "state.json") {
		t.Error("agy script must not poll claude bg state.json")
	}
}

// --- Agy collect/cleanup are in-tree, no worktree harvest ---

func TestLoopCmd_AgyCollectInTreeNoHarvest(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	for _, forbidden := range []string{"git worktree", "git merge --no-ff", "claude rm", "state.json"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("agy script must not harvest worktrees / poll bg state: found %q", forbidden)
		}
	}
}

// --- Agy emits its implementer marker and the p backend ---

func TestLoopCmd_AgyEmitsImplementerMarker(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "CA_IMPLEMENTER=agy") {
		t.Error("agy script must emit CA_IMPLEMENTER=agy")
	}
	if !strings.Contains(script, "CA_BACKEND=p") {
		t.Error("agy script must set CA_BACKEND=p (PID-based)")
	}
	// Implementer prereq must be agy, NOT claude.
	if !strings.Contains(script, `command -v agy >/dev/null || die "agy CLI required"`) {
		t.Error("agy script must require the agy CLI")
	}
	if strings.Contains(script, `command -v claude >/dev/null || die "claude CLI required"`) {
		t.Error("agy script must NOT require the claude CLI as the implementer prereq")
	}
	// No goose provider/model derivation on the agy path (plain model name).
	for _, forbidden := range []string{"GOOSE_PROVIDER", "GOOSE_MODEL", "CA_IMPLEMENTER=goose", "CA_IMPLEMENTER=codex"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("agy script must NOT contain other-engine bytes %q", forbidden)
		}
	}
	// bd stays.
	if !strings.Contains(script, "command -v bd >/dev/null") {
		t.Error("agy script must still require the bd CLI")
	}
}

// --- Agy header references agy sessions, not Claude Code / goose / codex ---

func TestLoopCmd_AgyHeaderReferencesEngine(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "# Autonomously processes beads epics via agy sessions.") {
		t.Error("agy script header must read 'via agy sessions'")
	}
	if strings.Contains(script, "via Claude Code sessions") {
		t.Error("agy script header must NOT reference Claude Code sessions")
	}
	if strings.Contains(script, "via goose sessions") {
		t.Error("agy script header must NOT reference goose sessions")
	}
	if strings.Contains(script, "via codex sessions") {
		t.Error("agy script header must NOT reference codex sessions")
	}
}

// --- Agy prompt requires the marker and an explicit commit ---

func TestLoopCmd_AgyPromptHasMarkerAndCommit(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "\nEPIC_COMPLETE\n") {
		t.Error("agy build_prompt must require EPIC_COMPLETE on its own line")
	}
	if !strings.Contains(script, "EPIC_FAILED") {
		t.Error("agy build_prompt must mention EPIC_FAILED")
	}
	if !strings.Contains(script, "HUMAN_REQUIRED:") {
		t.Error("agy build_prompt must mention HUMAN_REQUIRED:")
	}
	// Agy does not auto-commit: explicit git add/commit/push.
	if !strings.Contains(script, "git add -A") {
		t.Error("agy build_prompt must instruct an explicit 'git add -A'")
	}
	if !strings.Contains(script, "git commit") {
		t.Error("agy build_prompt must instruct an explicit 'git commit'")
	}
	if !strings.Contains(script, "git push") {
		t.Error("agy build_prompt must instruct an explicit 'git push'")
	}
	if !strings.Contains(script, "agy does NOT auto-commit") {
		t.Error("agy build_prompt prose must say 'agy does NOT auto-commit'")
	}
}

// --- Agy prompt invokes the ca primitives ladder ---

func TestLoopCmd_AgyPromptInvokesCaPrimitives(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	prompt := extractShellFunc(t, script, "build_prompt")
	for _, primitive := range []string{"ca search", "ca knowledge", "ca phase-check", "ca learn", "ca verify-gates"} {
		if !strings.Contains(prompt, primitive) {
			t.Errorf("agy build_prompt must invoke %q, body:\n%s", primitive, prompt)
		}
	}
}

// --- Agy preflight checks command -v agy, warns on default model, no API key, skips claude-bg ---

func TestLoopCmd_AgyPreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	if !strings.Contains(script, "agy_preflight") {
		t.Error("agy script must include an agy_preflight function")
	}
	if !strings.Contains(script, "command -v agy") {
		t.Error("agy preflight must check 'command -v agy'")
	}
	// Auth is OAuth via the Antigravity app: there is NO API key env var requirement.
	if strings.Contains(script, "GEMINI_API_KEY") {
		t.Error("agy preflight must NOT require GEMINI_API_KEY (OAuth, no API key env)")
	}
	if strings.Contains(script, "AGY_API_KEY") {
		t.Error("agy preflight must NOT require AGY_API_KEY (OAuth, no API key env)")
	}
	// Soft note that the default model may not be served (warn, not die).
	if !strings.Contains(script, "gemini-3.1-pro") {
		t.Error("agy preflight must note the default gemini-3.1-pro model")
	}
}

// --- Agy skips claude-bg-specific preflight ---

func TestLoopCmd_AgySkipsClaudePreflight(t *testing.T) {
	t.Parallel()
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	for _, forbidden := range []string{"bootstrap_preflight", "bgIsolation", "disclaimer"} {
		if strings.Contains(script, forbidden) {
			t.Errorf("agy script must NOT include claude-bg-only %q", forbidden)
		}
	}
}

// --- detect_marker is byte-identical between agy and claude ---

func TestLoopCmd_AgyDetectMarkerUnchanged(t *testing.T) {
	t.Parallel()
	claude := generateLoopScriptViaCmd(t)
	agy := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
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
	if extract(claude) != extract(agy) {
		t.Error("detect_marker must be byte-identical between claude and agy")
	}
}

// --- Agy reuses the goose bd-state marker fallback wrapper ---

func TestLoopCmd_AgyMarkerFallsBackToBdState(t *testing.T) {
	t.Parallel()
	agy := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro")
	wrapper := extractShellFunc(t, agy, "detect_marker_with_bd_state")
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
	if !strings.Contains(agy, `MARKER=$(detect_marker_with_bd_state "$EPIC_ID" "$LOGFILE" "$TRACEFILE")`) {
		t.Error("agy collect site must use detect_marker_with_bd_state with EPIC_ID")
	}
}

// --- Agy implementer review reuses the CLI-reviewer dispatch, agent_invoke runs agy ---

func TestLoopCmd_AgyImplementerReviewUsesCliReviewers(t *testing.T) {
	t.Parallel()
	// agy/codex are the only CLI-direct reviewers valid for the agy implementer:
	// a claude reviewer would route through agent_invoke (which runs agy here), so
	// it is rejected at flag-validation time (codex review P2).
	script := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-3.1-pro",
		"--reviewers", "agy,codex")
	// REVIEW_MODEL feeds the implementer fix-session (agy --dangerously-skip-permissions
	// --model). Without an explicit --review-model it must default to the agy engine
	// model, NOT a claude id that agy would reject.
	if !strings.Contains(script, "REVIEW_MODEL='gemini-3.1-pro'") {
		t.Error("agy review fix-session REVIEW_MODEL must default to 'gemini-3.1-pro', not the claude default")
	}
	if strings.Contains(script, "REVIEW_MODEL='claude-opus-4-7[1m]'") {
		t.Error("agy review must NOT keep the claude REVIEW_MODEL default")
	}
	// The CLI-reviewer wiring must be present (not the goose fleet).
	for _, fn := range []string{"detect_reviewers", "spawn_reviewers", "feed_implementer"} {
		if !strings.Contains(script, fn) {
			t.Errorf("agy implementer review must wire %q (CLI-reviewer dispatch)", fn)
		}
	}
	// No goose review fleet on the agy path.
	if strings.Contains(script, "goose run --recipe") {
		t.Error("agy implementer review must NOT spawn the goose review fleet")
	}
	// feed_implementer's fix-session must run agy, not claude: agent_invoke routes to agy.
	invoke := extractShellFunc(t, script, "agent_invoke")
	if !strings.Contains(invoke, "agy") {
		t.Errorf("agy agent_invoke must run 'agy' (review fix-session), body:\n%s", invoke)
	}
	// agy takes the model via --dangerously-skip-permissions --model for non-interactive review.
	if !strings.Contains(invoke, "--dangerously-skip-permissions") {
		t.Errorf("agy agent_invoke must pass --dangerously-skip-permissions for non-interactive review, body:\n%s", invoke)
	}
	if strings.Contains(invoke, "claude --") {
		t.Errorf("agy agent_invoke must NOT fall through to claude, body:\n%s", invoke)
	}
}

// --- Agy review model defaults to the agy engine, explicit flag wins ---

func TestLoopCmd_AgyReviewModelDefaultAndOverride(t *testing.T) {
	t.Parallel()
	// No --review-model: defaults to the agy engine model so the fix-session's
	// 'agy --dangerously-skip-permissions --model' gets a valid id.
	def := generateLoopScriptViaCmd(t, "--implementer", "agy", "--reviewers", "agy")
	if !strings.Contains(def, "REVIEW_MODEL='gemini-3.1-pro'") {
		t.Error("agy review-model must default to 'gemini-3.1-pro' when --review-model is omitted")
	}
	// Explicit --review-model still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "agy", "--reviewers", "agy",
		"--review-model", "gemini-2.5-pro")
	if !strings.Contains(override, "REVIEW_MODEL='gemini-2.5-pro'") {
		t.Error("explicit --review-model must override the agy default")
	}
}

// --- Agy default model is the agy default, not the claude default ---

func TestLoopCmd_AgyDefaultModelIsGemini(t *testing.T) {
	t.Parallel()
	// No --model: the agy implementer must default to gemini-3.1-pro, NOT the
	// global claude default. An explicit --model still wins.
	script := generateLoopScriptViaCmd(t, "--implementer", "agy")
	if !strings.Contains(script, "MODEL='gemini-3.1-pro'") {
		t.Error("agy without --model must default MODEL to 'gemini-3.1-pro'")
	}
	if strings.Contains(script, "claude-opus-4-7[1m]") {
		t.Error("agy script must NOT inherit the claude default model when --model is omitted")
	}
	// Explicit override still wins.
	override := generateLoopScriptViaCmd(t, "--implementer", "agy", "--model", "gemini-2.5-pro")
	if !strings.Contains(override, "MODEL='gemini-2.5-pro'") {
		t.Error("explicit --model must override the agy default")
	}
}

// --- Deprecated alias: --implementer gemini still resolves to agy and warns ---

func TestLoopCmd_GeminiImplementerAliasResolvesToAgy(t *testing.T) {
	t.Parallel()
	// The standalone gemini CLI is removed; --implementer gemini is accepted as a
	// deprecated alias that normalizes to agy (one-line deprecation warning).
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-alias.sh")
	out, err := executeCommand(root, "loop", "-o", outPath, "--force",
		"--implementer", "gemini", "--model", "gemini-3.1-pro")
	if err != nil {
		t.Fatalf("--implementer gemini alias must be accepted, got error: %v\n%s", err, out)
	}
	if !strings.Contains(out, "deprecat") {
		t.Errorf("--implementer gemini must emit a deprecation warning, got: %q", out)
	}
	body, rerr := os.ReadFile(outPath)
	if rerr != nil {
		t.Fatalf("read generated script: %v", rerr)
	}
	script := string(body)
	if !strings.Contains(script, "CA_IMPLEMENTER=agy") {
		t.Error("--implementer gemini alias must generate the agy seam (CA_IMPLEMENTER=agy)")
	}
	if !strings.Contains(script, "agy -p") {
		t.Error("--implementer gemini alias must dispatch via 'agy -p'")
	}
}

func TestLoopCmd_AntigravityImplementerAliasResolvesToAgy(t *testing.T) {
	t.Parallel()
	// The antigravity groundwork target folded into agy; --implementer antigravity is
	// accepted as a deprecated alias that normalizes to agy (deprecation warning).
	// Mirrors the harness-side acceptance of antigravity (deprecatedHarnessAliases).
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop-alias.sh")
	out, err := executeCommand(root, "loop", "-o", outPath, "--force",
		"--implementer", "antigravity", "--model", "gemini-3.1-pro")
	if err != nil {
		t.Fatalf("--implementer antigravity alias must be accepted, got error: %v\n%s", err, out)
	}
	if !strings.Contains(out, "deprecat") {
		t.Errorf("--implementer antigravity must emit a deprecation warning, got: %q", out)
	}
	body, rerr := os.ReadFile(outPath)
	if rerr != nil {
		t.Fatalf("read generated script: %v", rerr)
	}
	script := string(body)
	if !strings.Contains(script, "CA_IMPLEMENTER=agy") {
		t.Error("--implementer antigravity alias must generate the agy seam (CA_IMPLEMENTER=agy)")
	}
	if !strings.Contains(script, "agy -p") {
		t.Error("--implementer antigravity alias must dispatch via 'agy -p'")
	}
}

// --- Bash syntax for agy variants (plain model + default model) ---

func TestLoopCmd_BashSyntax_Agy(t *testing.T) {
	t.Parallel()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	dir := t.TempDir()
	variants := [][]string{
		{"--implementer", "agy", "--model", "gemini-3.1-pro"},
		{"--implementer", "agy"}, // default model
		{"--implementer", "agy", "--model", "gemini-3.1-pro", "--reviewers", "agy,codex", "--review-every", "2"},
	}
	for i, flags := range variants {
		root := &cobra.Command{Use: "ca"}
		root.AddCommand(loopCmd())
		outPath := filepath.Join(dir, "loop-agy.sh")
		args := append([]string{"loop", "-o", outPath, "--force"}, flags...)
		if _, err := executeCommand(root, args...); err != nil {
			t.Fatalf("generate failed (variant %d): %v", i, err)
		}
		out, err := exec.Command("bash", "-n", outPath).CombinedOutput()
		if err != nil {
			t.Errorf("bash -n failed on agy loop script (variant %d): %v\n%s", i, err, string(out))
		}
	}
}
