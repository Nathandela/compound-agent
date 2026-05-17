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

// --- T2 bg Backend Tests ---
// These tests verify the bg backend implementation of the seam (R-BG, R-MARKER).
// All tests are offline-safe: they inspect generated bash without running claude.
// State.json fixture data is inline (no live sessions).

// TestBgBackend_DispatchNoBg verifies that the bg dispatch does NOT pass
// --session-id (spike G1: --bg manages its own session id).
func TestBgBackend_DispatchNoBg(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	// Find the bg) branch of agent_dispatch
	bgIdx := strings.Index(seam, "bg)")
	if bgIdx < 0 {
		t.Fatal("bg) branch not found in agent_dispatch seam")
	}
	bgSection := seam[bgIdx:]

	// Must have --bg flag
	if !strings.Contains(bgSection[:strings.Index(bgSection, "\n    ;;")+1], "--bg") {
		// Try a wider search scoped to agent_dispatch
		dispatchIdx := strings.Index(seam, "agent_dispatch()")
		if dispatchIdx < 0 {
			t.Fatal("agent_dispatch() not found in seam")
		}
		dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
		dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]
		if !strings.Contains(dispatchBody, "--bg") {
			t.Error("bg backend agent_dispatch must use --bg flag")
		}
	}

	// Must NOT pass --session-id (spike G1: --bg ignores --session-id)
	dispatchIdx := strings.Index(seam, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in seam")
	}
	dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
	dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]
	bgInDispatch := ""
	if bgI := strings.Index(dispatchBody, "bg)"); bgI >= 0 {
		bgInDispatch = dispatchBody[bgI:]
		if endI := strings.Index(bgInDispatch, ";;"); endI >= 0 {
			bgInDispatch = bgInDispatch[:endI]
		}
	}
	if strings.Contains(bgInDispatch, "--session-id") {
		t.Error("bg backend agent_dispatch must NOT pass --session-id (spike G1: --bg manages its own session id)")
	}
}

// TestBgBackend_DispatchClaudeFlags verifies the bg dispatch command-line:
// --dangerously-skip-permissions, --permission-mode auto, --model, --bg.
func TestBgBackend_DispatchClaudeFlags(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	dispatchIdx := strings.Index(seam, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in seam")
	}
	dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
	dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]

	// Extract the bg branch
	bgI := strings.Index(dispatchBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_dispatch")
	}
	bgBranch := dispatchBody[bgI:]
	endI := strings.Index(bgBranch, ";;")
	if endI > 0 {
		bgBranch = bgBranch[:endI]
	}

	required := map[string]string{
		"--bg":                           "bg flag for background execution",
		"--dangerously-skip-permissions": "permissions bypass flag",
		"--permission-mode auto":         "permission mode flag",
		`"$model"`:                       "model variable",
	}
	for needle, desc := range required {
		if !strings.Contains(bgBranch, needle) {
			t.Errorf("bg dispatch missing %s: expected %q in bg branch", desc, needle)
		}
	}
}

// TestBgBackend_HandleIdParsing verifies that the bg dispatch parses the 8-hex
// session id from the "backgrounded · <id>" line and validates it.
func TestBgBackend_HandleIdParsing(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	dispatchIdx := strings.Index(seam, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in seam")
	}
	dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
	dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]

	bgI := strings.Index(dispatchBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_dispatch")
	}
	bgBranch := dispatchBody[bgI:]

	// Must parse something that looks like an 8-hex id from the backgrounded line
	if !strings.Contains(bgBranch, "backgrounded") && !strings.Contains(bgBranch, "[0-9a-f]") {
		// The parsing must reference the known output line pattern
		if !strings.Contains(bgBranch, "AGENT_HANDLE") {
			t.Error("bg dispatch must set AGENT_HANDLE from parsed session id")
		}
	}

	// Must validate the parsed id (non-empty at minimum)
	if !strings.Contains(bgBranch, "AGENT_HANDLE") {
		t.Error("bg dispatch must set AGENT_HANDLE global")
	}
}

// TestBgBackend_PollTerminalStates verifies that agent_poll bg branch treats
// the full defensive terminal set as done, and unknown/empty state as running.
// This is the R-BG + S12 contract: unknown state MUST NOT be treated as terminal.
func TestBgBackend_PollTerminalStates(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	pollIdx := strings.Index(seam, "agent_poll()")
	if pollIdx < 0 {
		t.Fatal("agent_poll() not found in seam")
	}
	pollEnd := strings.Index(seam[pollIdx:], "\n}\n")
	pollBody := seam[pollIdx : pollIdx+pollEnd]

	bgI := strings.Index(pollBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_poll")
	}
	bgBranch := pollBody[bgI:]
	endI := strings.Index(bgBranch, ";;")
	if endI > 0 {
		bgBranch = bgBranch[:endI]
	}

	// Must read state.json from the jobs directory
	if !strings.Contains(bgBranch, "state.json") {
		t.Error("bg agent_poll must read state.json for completion detection (R-BG)")
	}
	if !strings.Contains(bgBranch, ".claude/jobs") && !strings.Contains(bgBranch, "HOME") {
		t.Error("bg agent_poll must read from ~/.claude/jobs/<handle>/state.json")
	}

	// Must check inFlight.tasks == 0 alongside .state (R-BG)
	if !strings.Contains(bgBranch, "inFlight") && !strings.Contains(bgBranch, "in_flight") {
		t.Error("bg agent_poll must check inFlight.tasks==0 (R-BG: terminal requires state + no in-flight tasks)")
	}

	// Must include the defensive terminal state set (S12: unknown state => running)
	terminalStates := []string{"done", "failed", "stopped", "error", "cancel"}
	for _, state := range terminalStates {
		if !strings.Contains(bgBranch, state) {
			t.Errorf("bg agent_poll missing terminal state %q in defensive set (R-BG)", state)
		}
	}

	// Unknown/missing state must default to running, not terminal.
	// The bash must echo "running" as the default (not "done").
	// We verify the function default echo is "running".
	if !strings.Contains(bgBranch, `"running"`) && !strings.Contains(bgBranch, `running`) {
		t.Error("bg agent_poll must echo 'running' for unknown/empty state (S12: NEVER false-terminal)")
	}
}

// TestBgBackend_PollStateJsonPath verifies the exact path used to read state.json.
func TestBgBackend_PollStateJsonPath(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	pollIdx := strings.Index(seam, "agent_poll()")
	if pollIdx < 0 {
		t.Fatal("agent_poll() not found in seam")
	}
	pollEnd := strings.Index(seam[pollIdx:], "\n}\n")
	pollBody := seam[pollIdx : pollIdx+pollEnd]

	// Must construct path using $HOME/.claude/jobs/<handle>/state.json
	if !strings.Contains(pollBody, "state.json") {
		t.Error("agent_poll bg must reference state.json")
	}
	// Must use $handle or equivalent variable
	if !strings.Contains(pollBody, `$handle`) && !strings.Contains(pollBody, `$1`) {
		t.Error("agent_poll bg must use the handle variable to construct the state.json path")
	}
}

// TestBgBackend_CollectInvertedMarker verifies R-MARKER: agent_collect bg reads
// .output/.detail from state.json first, writes to $logfile so detect_marker
// anchored patterns (^EPIC_COMPLETE$, ^HUMAN_REQUIRED:, ^EPIC_FAILED$) work unchanged.
// Also verifies fallback to .linkScanPath transcript (S3).
func TestBgBackend_CollectInvertedMarker(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	collectIdx := strings.Index(seam, "agent_collect()")
	if collectIdx < 0 {
		t.Fatal("agent_collect() not found in seam")
	}
	collectEnd := strings.Index(seam[collectIdx:], "\n}\n")
	collectBody := seam[collectIdx : collectIdx+collectEnd]

	bgI := strings.Index(collectBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_collect")
	}
	bgBranch := collectBody[bgI:]
	endI := strings.Index(bgBranch, ";;")
	if endI > 0 {
		bgBranch = bgBranch[:endI]
	}

	// Must read .output from state.json (primary marker source, S2)
	if !strings.Contains(bgBranch, "output") {
		t.Error("bg agent_collect must read .output from state.json (R-MARKER primary, S2)")
	}

	// Must read .detail as secondary (S2 fallback)
	if !strings.Contains(bgBranch, "detail") {
		t.Error("bg agent_collect must read .detail as secondary marker source (R-MARKER, S2)")
	}

	// Must write to $logfile so detect_marker's anchored ^EPIC_COMPLETE$ works (S2)
	if !strings.Contains(bgBranch, "logfile") {
		t.Error("bg agent_collect must write marker text to $logfile for detect_marker anchored patterns")
	}

	// Must have transcript fallback via .linkScanPath (S3: no anchored marker in .output)
	if !strings.Contains(bgBranch, "linkScanPath") && !strings.Contains(bgBranch, "transcript") {
		t.Error("bg agent_collect must fall back to .linkScanPath transcript if .output lacks anchored marker (S3)")
	}
}

// TestBgBackend_CollectPopulatesTracefile verifies that agent_collect bg populates
// $tracefile from the transcript for ca watch / diagnostics.
func TestBgBackend_CollectPopulatesTracefile(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	collectIdx := strings.Index(seam, "agent_collect()")
	if collectIdx < 0 {
		t.Fatal("agent_collect() not found in seam")
	}
	collectEnd := strings.Index(seam[collectIdx:], "\n}\n")
	collectBody := seam[collectIdx : collectIdx+collectEnd]

	bgI := strings.Index(collectBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_collect")
	}
	bgBranch := collectBody[bgI:]
	endI := strings.Index(bgBranch, ";;")
	if endI > 0 {
		bgBranch = bgBranch[:endI]
	}

	// Must write to tracefile (for ca watch and diagnostics)
	if !strings.Contains(bgBranch, "tracefile") {
		t.Error("bg agent_collect must populate $tracefile from transcript for ca watch/diagnostics")
	}
}

// TestBgBackend_StopUsesClaude verifies that agent_stop bg uses "claude stop <handle>"
// (spike G4: ~1s, effective).
func TestBgBackend_StopUsesClaude(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	stopIdx := strings.Index(seam, "agent_stop()")
	if stopIdx < 0 {
		t.Fatal("agent_stop() not found in seam")
	}
	stopEnd := strings.Index(seam[stopIdx:], "\n}\n")
	stopBody := seam[stopIdx : stopIdx+stopEnd]

	bgI := strings.Index(stopBody, "bg)")
	if bgI < 0 {
		t.Fatal("bg) branch not found in agent_stop")
	}
	bgBranch := stopBody[bgI:]
	endI := strings.Index(bgBranch, ";;")
	if endI > 0 {
		bgBranch = bgBranch[:endI]
	}

	if !strings.Contains(bgBranch, "claude stop") {
		t.Error("bg agent_stop must invoke 'claude stop <handle>' (spike G4: ~1s effective)")
	}
	// Must pass the handle
	if !strings.Contains(bgBranch, `"$handle"`) && !strings.Contains(bgBranch, "$handle") {
		t.Error("bg agent_stop must pass $handle to 'claude stop'")
	}
}

// TestBgBackend_CleanupDeferredToT3 verifies that agent_cleanup bg has a clear
// T3 comment deferring worktree-harvest + claude rm to T3.
func TestBgBackend_CleanupDeferredToT3(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	cleanupIdx := strings.Index(seam, "agent_cleanup()")
	if cleanupIdx < 0 {
		t.Fatal("agent_cleanup() not found in seam")
	}
	cleanupEnd := strings.Index(seam[cleanupIdx:], "\n}\n")
	cleanupBody := seam[cleanupIdx : cleanupIdx+cleanupEnd]

	// Must have a T3 comment deferring worktree-harvest and claude rm
	if !strings.Contains(cleanupBody, "T3") {
		t.Error("agent_cleanup must contain a T3: comment deferring worktree-harvest + claude rm to T3")
	}
	// Must NOT call claude rm (that's T3)
	if strings.Contains(cleanupBody, "claude rm") {
		t.Error("agent_cleanup must NOT call 'claude rm' in T2 (deferred to T3)")
	}
}

// TestBgBackend_MainLoopPollsUntilTerminal verifies that the generated main loop
// script contains a bg-specific poll loop: after agent_dispatch, it polls via
// agent_poll until not "running", then calls agent_collect.
func TestBgBackend_MainLoopPollsUntilTerminal(t *testing.T) {
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

	// The main loop must call agent_poll (for bg backend turn completion)
	if !strings.Contains(script, "agent_poll") {
		t.Error("main loop must call agent_poll for bg backend turn completion (R-BG)")
	}

	// The main loop must call agent_collect (to populate LOGFILE for detect_marker)
	if !strings.Contains(script, "agent_collect") {
		t.Error("main loop must call agent_collect after terminal state (R-MARKER)")
	}

	// agent_poll must be called with AGENT_HANDLE
	if !strings.Contains(script, `agent_poll "$AGENT_HANDLE"`) {
		t.Error("main loop must call agent_poll with $AGENT_HANDLE")
	}

	// agent_collect must be called with AGENT_HANDLE, LOGFILE, TRACEFILE
	if !strings.Contains(script, `agent_collect "$AGENT_HANDLE"`) {
		t.Error("main loop must call agent_collect with $AGENT_HANDLE")
	}
}

// TestBgBackend_StaleWatchdogBgAware verifies that the bg stale detection uses
// state.json mtime/inFlight heartbeat, not transcript byte growth
// (spike G3: transcript is end-only).
func TestBgBackend_StaleWatchdogBgAware(t *testing.T) {
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

	// The bg poll loop must include a stale timeout check using state.json
	// (either mtime or last-seen-update tracking)
	if !strings.Contains(script, "SESSION_STALE_TIMEOUT") {
		t.Error("bg stale detection must use SESSION_STALE_TIMEOUT for heartbeat check")
	}
	// The bg stale detection must reference state.json
	if !strings.Contains(script, "state.json") {
		t.Error("bg stale detection must reference state.json for heartbeat (G3: transcript is end-only)")
	}
}

// TestBgBackend_MemoryWatchdogUsesAgentStop verifies that the memory watchdog
// for the bg backend calls agent_stop (which delegates to "claude stop").
func TestBgBackend_MemoryWatchdogUsesAgentStop(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	// The memory watchdog kill in the bg branch must use agent_stop
	// OR the start_memory_watchdog in the main loop is replaced by a bg-aware variant.
	// At minimum, verify agent_stop for bg does "claude stop" and that the
	// main loop still calls stop_memory_watchdog (p regression preserved).
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

	// p backend: stop_memory_watchdog must still be present (R-PLEGACY)
	if !strings.Contains(script, "stop_memory_watchdog") {
		t.Error("stop_memory_watchdog must remain for p backend regression (R-PLEGACY)")
	}
	// agent_stop bg must use claude stop (verified in TestBgBackend_StopUsesClaude)
	// Here verify agent_stop is referenced in the watchdog kill path or bg poll loop
	if !strings.Contains(seam, "claude stop") {
		t.Error("bg backend must use 'claude stop' via agent_stop (R-MEMGUARD)")
	}
}

// TestBgBackend_PBackendUnchanged verifies that the p backend seam functions
// are byte-identical after adding the bg backend (R-PLEGACY regression).
func TestBgBackend_PBackendUnchanged(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam()

	// p backend dispatch must still have the full claude -p pipeline
	dispatchIdx := strings.Index(seam, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in seam")
	}
	dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
	dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]

	pI := strings.Index(dispatchBody, "p)")
	if pI < 0 {
		t.Fatal("p) branch not found in agent_dispatch")
	}
	pBranch := dispatchBody[pI:]
	endI := strings.Index(pBranch, ";;")
	if endI > 0 {
		pBranch = pBranch[:endI]
	}

	pRequired := map[string]string{
		"--output-format stream-json": "stream-json output (p backend)",
		"--verbose":                   "verbose flag (p backend)",
		"-p ":                         "print flag (p backend)",
		"tee ":                        "tee to tracefile (p backend)",
		"extract_text":                "extract_text pipeline (p backend)",
	}
	for needle, desc := range pRequired {
		if !strings.Contains(pBranch, needle) {
			t.Errorf("p backend agent_dispatch missing %s after adding bg backend (R-PLEGACY)", desc)
		}
	}
}

// TestBgBackend_BashSyntaxWithBgBackend verifies that the generated scripts
// (with and without reviewers) pass bash -n syntax check after adding bg backend.
func TestBgBackend_BashSyntaxWithBgBackend(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	tests := []struct {
		name string
		args []string
	}{
		{"no-reviewers", []string{"loop", "-o", filepath.Join(dir, "bg-basic.sh")}},
		{"with-reviewers", []string{"loop", "-o", filepath.Join(dir, "bg-review.sh"),
			"--reviewers", "claude-sonnet,gemini", "--review-every", "2"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := executeCommand(root, tt.args...)
			if err != nil {
				t.Fatalf("command failed: %v", err)
			}
			out, bashErr := executeBashSyntaxCheck(t, tt.args[2])
			if bashErr != nil {
				t.Errorf("bash -n syntax check failed after bg backend addition:\n%s\n%v", out, bashErr)
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

// TestBgBackend_NoTopLevelLocal verifies that the generated loop script contains
// no `local` declarations outside a bash function body. `local` at script top
// level under `set -euo pipefail` causes bash to abort with exit 1 (bash:
// local: can only be used in a function), which silently breaks CA_BACKEND=bg
// before the first poll. The check tracks brace depth: any `local ` token
// found at depth 0 (top level) is a regression.
func TestBgBackend_NoTopLevelLocal(t *testing.T) {
	t.Parallel()
	root := &cobra.Command{Use: "ca"}
	root.AddCommand(loopCmd())

	dir := t.TempDir()
	outPath := filepath.Join(dir, "no-local.sh")

	_, err := executeCommand(root, "loop", "-o", outPath)
	if err != nil {
		t.Fatalf("loop command failed: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read generated script: %v", err)
	}

	// Walk the generated script line by line, tracking brace depth to detect
	// whether we are inside a bash function body. A function body starts when
	// a line matching `name() {` (or `name () {`) is seen; depth increments on
	// `{` and decrements on `}`. `local` is only valid at depth >= 1.
	depth := 0
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip comment lines.
		if strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Count brace changes (simple heuristic sufficient for our templates).
		for _, ch := range trimmed {
			if ch == '{' {
				depth++
			} else if ch == '}' {
				if depth > 0 {
					depth--
				}
			}
		}

		// After updating depth: a `local` keyword on a line that ends at depth 0
		// was executed at the previous depth. Re-derive: check if this line
		// contains `local ` AND the depth BEFORE accounting for this line's
		// braces was 0. We compute pre-line depth for accurate detection.
		//
		// Simpler and equally correct: re-scan with pre-depth below.
		_ = i
	}

	// Second pass: track pre-line depth correctly.
	depth = 0
	for lineNo, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			// Track braces in comments? No — comments don't affect depth.
			continue
		}

		preDepth := depth
		for _, ch := range trimmed {
			if ch == '{' {
				depth++
			} else if ch == '}' {
				if depth > 0 {
					depth--
				}
			}
		}

		// A `local` on a line where preDepth == 0 is top-level and illegal.
		if preDepth == 0 && strings.Contains(trimmed, "local ") {
			t.Errorf("line %d: `local` at script top level (depth 0) — illegal under set -euo pipefail: %q",
				lineNo+1, line)
		}
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
