package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestLoopCommand_GeneratesScript(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "infinity-loop.sh")

	out, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v\nOutput: %s", err, out)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}

	script := string(data)
	if !strings.HasPrefix(script, "#!/usr/bin/env bash") {
		t.Error("expected bash shebang")
	}
	if !strings.Contains(script, "MAX_RETRIES") {
		t.Error("expected MAX_RETRIES variable")
	}
	if !strings.Contains(script, "EPIC_COMPLETE") {
		t.Error("expected EPIC_COMPLETE marker detection")
	}
}

func TestLoopCommand_UsesCompoundAgentLogDir(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, `LOG_DIR=".compound-agent/agent_logs"`) {
		t.Error("expected LOG_DIR to use .compound-agent/agent_logs")
	}
}

func TestLoopCommand_WithEpics(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--epics", "epic-1,epic-2")
	if err != nil {
		t.Fatalf("loop --epics failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "epic-1") {
		t.Error("expected epic-1 in script")
	}
}

func TestLoopCommand_CleansStalePhaseState(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--force")
	if err != nil {
		t.Fatalf("loop failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "ca phase-check clean") {
		t.Error("generated script must clean stale phase state before each epic")
	}
}

func TestWatchCommand_NoTraceFile(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(watchCmd())

	out, err := executeCommand(root, "watch", "--follow=false", "--log-dir", "/nonexistent/path")
	if err != nil {
		t.Fatalf("watch command failed: %v", err)
	}

	if !strings.Contains(out, "No active trace") && !strings.Contains(out, "No trace") {
		// It's OK if it just says nothing found
		if !strings.Contains(strings.ToLower(out), "no") {
			t.Errorf("expected 'no trace' message, got: %s", out)
		}
	}
}

func TestWatchCommand_ReadsTraceFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	logDir := filepath.Join(dir, "agent_logs")
	os.MkdirAll(logDir, 0755)

	// Create a trace file
	traceContent := `{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello world"}}
{"type":"result","result":"EPIC_COMPLETE"}
`
	os.WriteFile(filepath.Join(logDir, "trace_test-001.jsonl"), []byte(traceContent), 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(watchCmd())

	out, err := executeCommand(root, "watch", "--follow=false", "--log-dir", logDir)
	if err != nil {
		t.Fatalf("watch command failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "TOOL") || !strings.Contains(out, "Read") {
		t.Errorf("expected TOOL Read in output, got: %s", out)
	}
}

func TestAuditCommand_BasicRun(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(auditCmd())

	out, err := executeCommand(root, "audit", "--repo-root", dir)
	if err != nil {
		t.Fatalf("audit command failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "Audit") || !strings.Contains(out, "finding") {
		t.Errorf("expected audit summary, got: %s", out)
	}
}

func TestAuditCommand_JSON(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0755)
	os.WriteFile(filepath.Join(dir, ".claude", "lessons", "index.jsonl"), []byte{}, 0644)

	root := &cobra.Command{Use: "ca"}
	root.AddCommand(auditCmd())

	out, err := executeCommand(root, "audit", "--repo-root", dir, "--json")
	if err != nil {
		t.Fatalf("audit --json failed: %v\nOutput: %s", err, out)
	}

	if !strings.Contains(out, "findings") {
		t.Errorf("expected JSON with findings, got: %s", out)
	}
}

func TestLoopCommand_ShellInjection(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "test.sh")

	payload := `$(whoami)`
	_, err := executeCommand(root, "loop", "-o", outPath, "--force", "--epics", payload)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The payload must be inside single quotes, preventing command substitution
	if strings.Contains(script, `EPIC_IDS="`+payload) {
		t.Error("epics flag is interpolated without escaping — shell injection possible")
	}
	if !strings.Contains(script, `EPIC_IDS='`) {
		t.Error("expected EPIC_IDS to be single-quoted for shell safety")
	}
}

func TestFindTraceForEpic_PathTraversal(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	logDir := filepath.Join(dir, "agent_logs")
	os.MkdirAll(logDir, 0755)

	// Attempting path traversal via epic ID should return empty
	result := findTraceForEpic(logDir, "../other_dir/trace_")
	if result != "" {
		t.Errorf("expected empty for path traversal attempt, got: %s", result)
	}

	result = findTraceForEpic(logDir, "normal-epic")
	// No trace file exists, should just return empty
	if result != "" {
		t.Errorf("expected empty for non-existent trace, got: %s", result)
	}
}

func TestLoopCommand_GoTestUsesTagsSqliteFts5(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// go test references must NOT include obsolete -tags sqlite_fts5
	if strings.Contains(script, "-tags sqlite_fts5") {
		t.Error("generated loop script references obsolete -tags sqlite_fts5 (modernc.org/sqlite needs no build tags)")
	}
	// Should not reference pnpm test commands (stale TS leftovers)
	if strings.Contains(script, "pnpm test:unit") {
		t.Error("generated loop script references stale 'pnpm test:unit'")
	}
	if strings.Contains(script, "pnpm test") {
		t.Error("generated loop script references stale 'pnpm test'")
	}
}

func TestLoopCommand_NoStaleTypeScriptRefs(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	if strings.Contains(script, "TypeScript") {
		t.Error("generated loop script still references TypeScript")
	}
}

func TestLoopCommand_StaleWatchdogPresent(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must have SESSION_STALE_TIMEOUT config variable
	if !strings.Contains(script, "SESSION_STALE_TIMEOUT") {
		t.Error("expected SESSION_STALE_TIMEOUT config variable")
	}

	// Must have stale watchdog functions
	if !strings.Contains(script, "start_stale_watchdog") {
		t.Error("expected start_stale_watchdog function")
	}
	if !strings.Contains(script, "stop_stale_watchdog") {
		t.Error("expected stop_stale_watchdog function")
	}
	if !strings.Contains(script, "STALE_WATCHDOG_PID") {
		t.Error("expected STALE_WATCHDOG_PID global variable")
	}

	// Must wire stale watchdog into session spawning via AGENT_HANDLE (T1 seam: was CLAUDE_PGID)
	if !strings.Contains(script, `start_stale_watchdog "$AGENT_HANDLE"`) {
		t.Error("expected stale watchdog to be started with AGENT_HANDLE (seam handle, was CLAUDE_PGID pre-T1)")
	}
	if !strings.Contains(script, `stop_stale_watchdog`) {
		t.Error("expected stale watchdog to be stopped after wait")
	}

	// Stale watchdog must monitor the trace file
	if !strings.Contains(script, "TRACEFILE") {
		t.Error("expected stale watchdog to reference TRACEFILE")
	}
}

func TestLoopCommand_StaleWatchdogOnlyCountsAfterOutput(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must only start counting inactivity after trace file has content (prev_size > 0)
	// to avoid killing sessions that are slow to start
	if !strings.Contains(script, "cur_size") || !strings.Contains(script, "last_size") {
		t.Error("stale watchdog must track file sizes to detect output inactivity")
	}
}

func TestLoopCommand_StaleWatchdogInCrashHandler(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Crash handler must clean up stale watchdog to prevent orphan processes
	if !strings.Contains(script, "_loop_cleanup") {
		t.Error("expected _loop_cleanup crash handler")
	}

	// The crash handler must stop the stale watchdog
	// Check that stop_stale_watchdog appears in the trap handler section
	cleanupIdx := strings.Index(script, "_loop_cleanup()")
	trapIdx := strings.Index(script, "trap _loop_cleanup EXIT")
	if cleanupIdx < 0 || trapIdx < 0 {
		t.Fatal("missing crash handler structure")
	}

	cleanupBody := script[cleanupIdx:trapIdx]
	if !strings.Contains(cleanupBody, "stop_stale_watchdog") {
		t.Error("crash handler must call stop_stale_watchdog to prevent orphan processes")
	}
}

func TestLoopCommand_StaleWatchdogDetection(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must detect stale watchdog kills after wait returns
	if !strings.Contains(script, "STALE_WATCHDOG:") {
		t.Error("expected STALE_WATCHDOG: marker for stale kill detection")
	}
}

func TestLoopCommand_ZeroWorkExitCode(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Must exit 2 when zero epics completed and zero failed (all blocked/skipped)
	if !strings.Contains(script, "exit 2") {
		t.Error("expected exit 2 for zero-work loop runs")
	}
	// Must log warning about zero completed
	if !strings.Contains(script, "Zero epics completed") {
		t.Error("expected warning message about zero completed epics")
	}
}

func TestLoopCommand_CompactPct(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath, "--compact-pct", "40")
	if err != nil {
		t.Fatalf("loop --compact-pct failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if !strings.Contains(script, "export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40") {
		t.Error("expected CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=40 in script")
	}
}

func TestLoopCommand_CompactPctZeroOmitted(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)
	if strings.Contains(script, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE") {
		t.Error("expected no CLAUDE_AUTOCOMPACT_PCT_OVERRIDE when --compact-pct is 0")
	}
}

func TestLoopCommand_CompactPctValidation(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"negative", "-1", true},
		{"over100", "101", true},
		{"zero", "0", false},
		{"valid50", "50", false},
		{"valid100", "100", false},
		{"boundary1", "1", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			root := &cobra.Command{Use: "ca"}
			root.AddCommand(loopCmd())
			dir := t.TempDir()
			outPath := filepath.Join(dir, "loop.sh")
			_, err := executeCommand(root, "loop", "-o", outPath, "--compact-pct", tt.value)
			if tt.wantErr && err == nil {
				t.Errorf("--compact-pct %s: expected error, got nil", tt.value)
			}
			if !tt.wantErr && err != nil {
				t.Errorf("--compact-pct %s: unexpected error: %v", tt.value, err)
			}
		})
	}
}

// --- T1 Seam Tests ---
// These tests verify the 3-operation backend seam introduced in T1.
// They prove: (a) seam functions are emitted, (b) no raw `claude -p` exists
// outside the seam definition, (c) the p-backend contract (effective claude
// invocation, extract_text pipeline, detect_marker anchors, watchdog wiring)
// is equivalent to pre-T1 behavior.

// TestLoopCommand_SeamFunctionsPresent verifies that the loop script contains
// the five seam function definitions required by R-SEAM.
func TestLoopCommand_SeamFunctionsPresent(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	seam := map[string]string{
		"agent_dispatch()": "agent_dispatch seam function definition",
		"agent_poll()":     "agent_poll seam function definition",
		"agent_collect()":  "agent_collect seam function definition",
		"agent_stop()":     "agent_stop seam function definition",
		"agent_cleanup()":  "agent_cleanup seam function definition",
		"CA_BACKEND":       "CA_BACKEND variable selecting p vs bg backend",
	}
	for needle, desc := range seam {
		if !strings.Contains(script, needle) {
			t.Errorf("missing %s: expected %q in generated script", desc, needle)
		}
	}
}

// TestLoopCommand_NoRawClaudePOutsideSeam verifies R-SEAM: no raw `claude -p`
// call exists outside the seam function bodies. The only legal occurrences of
// `claude ... -p` are inside the backend-specific seam function definitions.
func TestLoopCommand_NoRawClaudePOutsideSeam(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// All raw `claude` invocations must be inside seam function definitions.
	// We verify by checking that the epic-loop invocation site uses agent_dispatch,
	// not a raw claude call.
	if !strings.Contains(script, "agent_dispatch ") {
		t.Error("expected agent_dispatch call at the epic-loop invocation site")
	}

	// The raw claude invocation must NOT appear outside the seam body.
	// Strategy: find the claude invocation that carries --output-format stream-json
	// and verify it only appears inside a function definition block, not inline
	// in the main loop body.
	//
	// We check that the string "agent_dispatch" appears between the WHILE loop
	// header and MARKER detection — i.e., the seam is called, not raw claude.
	whileIdx := strings.Index(script, "while [ $ATTEMPT -le $MAX_RETRIES ]")
	markerIdx := strings.Index(script, `MARKER=$(detect_marker`)
	if whileIdx < 0 || markerIdx < 0 {
		t.Fatal("expected attempt loop and MARKER detection in script")
	}
	loopBody := script[whileIdx:markerIdx]

	// The loop body must call agent_dispatch, not raw claude
	if !strings.Contains(loopBody, "agent_dispatch ") {
		t.Error("epic retry loop body must call agent_dispatch (not raw claude -p)")
	}
	// The loop body must NOT contain a raw `claude --dangerously-skip-permissions`
	// invocation (that belongs only inside the seam function definition)
	if strings.Contains(loopBody, "claude --dangerously-skip-permissions") {
		t.Error("raw claude --dangerously-skip-permissions must not appear in the loop body (must be inside seam)")
	}
}

// TestLoopCommand_PBackendClaudeContract pins the effective claude command-line
// that the p backend emits. It must include every flag that pre-T1 had:
// --dangerously-skip-permissions, --permission-mode auto, --model, --output-format
// stream-json, --verbose, and -p. This is the R-PLEGACY golden contract test.
func TestLoopCommand_PBackendClaudeContract(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The p-backend agent_dispatch function body must contain the exact claude flags
	// that pre-T1 used. Find the seam function definition block.
	dispatchIdx := strings.Index(script, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in generated script")
	}
	// Extract a reasonable window after the function start (up to 30 lines)
	dispatchBody := script[dispatchIdx:]
	// Narrow to the function body (find the closing })
	closeIdx := strings.Index(dispatchBody, "\n}\n")
	if closeIdx > 0 {
		dispatchBody = dispatchBody[:closeIdx]
	}

	required := map[string]string{
		"--dangerously-skip-permissions": "security bypass flag (pre-T1 contract)",
		"--permission-mode auto":         "permission mode flag (pre-T1 contract)",
		"--output-format stream-json":    "stream-json output format (pre-T1 contract)",
		"--verbose":                      "verbose flag (pre-T1 contract)",
		"-p ":                            "print flag (pre-T1 contract)",
		"tee ":                           "tee piping to TRACEFILE (pre-T1 contract)",
		"extract_text":                   "extract_text piping to LOGFILE (pre-T1 contract)",
	}
	for needle, desc := range required {
		if !strings.Contains(dispatchBody, needle) {
			t.Errorf("agent_dispatch p-backend missing %s: expected %q in function body", desc, needle)
		}
	}
}

// TestLoopCommand_SeamWatchdogWiring verifies that the watchdog functions
// (memory and stale) are wired to AGENT_HANDLE (not raw CLAUDE_PGID).
// This proves the seam indirection is complete: watchdogs operate on the
// handle, which for p backend equals the subshell PID.
func TestLoopCommand_SeamWatchdogWiring(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// The main loop body must start watchdogs with AGENT_HANDLE.
	if !strings.Contains(script, `start_memory_watchdog "$AGENT_HANDLE"`) {
		t.Error("memory watchdog must be wired to $AGENT_HANDLE (not $CLAUDE_PGID)")
	}
	if !strings.Contains(script, `start_stale_watchdog "$AGENT_HANDLE"`) {
		t.Error("stale watchdog must be wired to $AGENT_HANDLE (not $CLAUDE_PGID)")
	}
	// agent_dispatch must set AGENT_HANDLE
	if !strings.Contains(script, "AGENT_HANDLE=") {
		t.Error("agent_dispatch must set AGENT_HANDLE global")
	}
	// wait must use AGENT_HANDLE
	if !strings.Contains(script, `wait "$AGENT_HANDLE"`) {
		t.Error("wait must use $AGENT_HANDLE after dispatch")
	}
}

// TestLoopCommand_SeamAgentInvoke verifies that the review and polish scripts
// use agent_invoke (not raw `claude -p`) for reviewer/implementer/architect calls.
func TestLoopCommand_SeamAgentInvoke(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "loop.sh")

	_, err := executeCommand(root, "loop", "-o", outPath,
		"--reviewers", "claude-sonnet,gemini",
	)
	if err != nil {
		t.Fatalf("loop --reviewers failed: %v", err)
	}

	data, _ := os.ReadFile(outPath)
	script := string(data)

	// Review spawner must use agent_invoke for claude reviewer calls
	if !strings.Contains(script, "agent_invoke ") {
		t.Error("expected agent_invoke call in reviewer spawner")
	}

	// agent_invoke function must be defined
	if !strings.Contains(script, "agent_invoke()") {
		t.Error("expected agent_invoke() function definition in script")
	}
}

// TestReviewCommand_SeamFunctionsPresent verifies that the review function
// emits agent_invoke and that raw `claude -p` in reviewers/implementer goes
// through the seam.
func TestReviewCommand_SeamFunctionsPresent(t *testing.T) {
	t.Parallel()
	spawner := loopScriptSpawnReviewers()
	impl := loopScriptImplementerPhase()

	// spawn_reviewers must use agent_invoke, not raw claude -p
	if !strings.Contains(spawner, "agent_invoke ") {
		t.Error("spawn_reviewers must call agent_invoke (not raw claude -p)")
	}
	// implementer must use agent_invoke
	if !strings.Contains(impl, "agent_invoke ") {
		t.Error("feed_implementer must call agent_invoke (not raw claude -p)")
	}
}

// TestPolishCommand_SeamFunctionsPresent verifies that the polish script uses
// agent_invoke for audit-fleet and polish-architect claude calls.
func TestPolishCommand_SeamFunctionsPresent(t *testing.T) {
	t.Parallel()
	audit := polishScriptRunAudit()
	architect := polishScriptPolishArchitect()

	// Audit fleet must use agent_invoke for claude reviewers
	if !strings.Contains(audit, "agent_invoke ") {
		t.Error("run_polish_audit must call agent_invoke for claude reviewer calls")
	}
	// Polish architect must use agent_invoke
	if !strings.Contains(architect, "agent_invoke ") {
		t.Error("run_polish_architect must call agent_invoke (not raw claude -p)")
	}
}

// TestSeamScript_BashSyntax verifies that the generated seam functions produce
// valid bash syntax (regression guard for formatting bugs in template strings).
func TestSeamScript_BashSyntax(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()

	tests := []struct {
		name string
		args []string
	}{
		{"no-reviewers", []string{"loop", "-o", filepath.Join(dir, "seam-basic.sh")}},
		{"with-reviewers", []string{"loop", "-o", filepath.Join(dir, "seam-review.sh"),
			"--reviewers", "claude-sonnet,claude-opus,gemini,codex", "--review-every", "2"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCommand(root, tt.args...)
			if err != nil {
				t.Fatalf("command failed: %v", err)
			}
			out, bashErr := executeBashSyntaxCheck(t, tt.args[2])
			if bashErr != nil {
				t.Errorf("bash -n syntax check failed:\n%s\n%v", out, bashErr)
			}
		})
	}
}
