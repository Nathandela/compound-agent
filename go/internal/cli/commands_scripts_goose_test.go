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

// --- FIX-6: --implementer goose + --reviewers is rejected (Phase 3 not ready) ---

func TestLoopCmd_GooseRejectsReviewers(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())
	dir := t.TempDir()
	_, err := executeCommand(root, "loop", "-o", filepath.Join(dir, "rev.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat",
		"--reviewers", "claude-sonnet")
	if err == nil {
		t.Fatal("expected error: --reviewers is not supported with --implementer goose")
	}
	if !strings.Contains(err.Error(), "reviewers") || !strings.Contains(err.Error(), "goose") {
		t.Errorf("error should explain reviewers are unsupported with goose, got: %v", err)
	}

	// Sanity: goose without --reviewers still succeeds.
	root2 := &cobra.Command{Use: "ca"}
	root2.AddCommand(loopCmd())
	_, err = executeCommand(root2, "loop", "-o", filepath.Join(dir, "norev.sh"),
		"--implementer", "goose", "--model", "deepseek/deepseek-chat")
	if err != nil {
		t.Errorf("goose without --reviewers should succeed, got: %v", err)
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

// --- Bash syntax check for the goose variants ---

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
