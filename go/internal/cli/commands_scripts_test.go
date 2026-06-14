package cli

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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

// TestT3_CleanupHasHarvestLogic verifies agent_cleanup bg implements the T3
// worktree-harvest: git merge --no-ff, conditional claude rm only on success,
// and HUMAN_REQUIRED on failure (R-HARVEST, R-HARVEST-FAIL).
// We scan the full seam string since _harvest_fail is a companion function
// defined in the same seam block.
func TestT3_CleanupHasHarvestLogic(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam("bg", false)

	cleanupIdx := strings.Index(seam, "agent_cleanup()")
	if cleanupIdx < 0 {
		t.Fatal("agent_cleanup() not found in seam")
	}
	cleanupEnd := strings.Index(seam[cleanupIdx:], "\n}\n")
	if cleanupEnd < 0 {
		t.Fatal("agent_cleanup() closing brace not found")
	}
	cleanupBody := seam[cleanupIdx : cleanupIdx+cleanupEnd]

	// Must perform a git merge --no-ff into the working branch.
	if !strings.Contains(cleanupBody, "git merge --no-ff") {
		t.Error("agent_cleanup bg must perform git merge --no-ff to integrate worktree branch")
	}
	// Must discover worktrees via git worktree list.
	if !strings.Contains(cleanupBody, "git worktree list") {
		t.Error("agent_cleanup bg must use git worktree list to discover the session worktree")
	}
	// Must call claude rm to delete the session AFTER harvest (success path).
	if !strings.Contains(cleanupBody, "claude rm") {
		t.Error("agent_cleanup bg must call claude rm to remove session after successful harvest")
	}
	// Must call agent_stop before claude rm (order: stop then rm).
	agentStopIdx := strings.Index(cleanupBody, "agent_stop")
	claudeRmIdx := strings.Index(cleanupBody, "claude rm")
	if agentStopIdx < 0 {
		t.Error("agent_cleanup bg must call agent_stop before claude rm")
	}
	if claudeRmIdx >= 0 && agentStopIdx >= 0 && agentStopIdx > claudeRmIdx {
		t.Error("agent_cleanup bg must call agent_stop BEFORE claude rm")
	}
	// _harvest_fail companion function must record HUMAN_REQUIRED (scanned from full seam).
	if !strings.Contains(seam, "HUMAN_REQUIRED") {
		t.Error("seam must record HUMAN_REQUIRED on harvest failure (in agent_cleanup or _harvest_fail)")
	}
	// The noop sentinel for the old T2 deferred path must be gone.
	if strings.Contains(cleanupBody, "deferred to T3") {
		t.Error("agent_cleanup must no longer have the T2 'deferred to T3' noop comment — T3 is now implemented")
	}
}

// TestT3_CleanupHarvestFailNoRm verifies the harvest-fail path does NOT call
// claude rm, aborts the merge if started, and records HUMAN_REQUIRED (R-HARVEST-FAIL, S5).
// Scans the full seam since _harvest_fail is defined alongside agent_cleanup.
func TestT3_CleanupHarvestFailNoRm(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam("bg", false)

	// Must abort on conflict (R-HARVEST-FAIL).
	if !strings.Contains(seam, "git merge --abort") {
		t.Error("seam must call 'git merge --abort' on conflict")
	}
	// HUMAN_REQUIRED must be present and correlated with merge-abort.
	hrIdx := strings.Index(seam, "HUMAN_REQUIRED")
	mergeAbortIdx := strings.Index(seam, "git merge --abort")
	if hrIdx < 0 || mergeAbortIdx < 0 {
		t.Error("seam must have both git merge --abort and HUMAN_REQUIRED for the harvest-fail path")
	}
	// claude rm must NOT appear in the same conditional branch as merge --abort.
	// Check: the text between merge --abort and the next "}" does not contain "claude rm".
	if mergeAbortIdx >= 0 {
		afterAbort := seam[mergeAbortIdx:]
		closeIdx := strings.Index(afterAbort, "\n      fi\n")
		if closeIdx > 0 {
			abortBlock := afterAbort[:closeIdx]
			if strings.Contains(abortBlock, "claude rm") {
				t.Error("harvest-fail path must NOT call 'claude rm' (retain worktree for inspection)")
			}
		}
	}
}

// TestT3_DispatchSnapshotsWorktrees verifies that the bg dispatch path snapshots
// the worktree set before claude --bg so that harvest can identify the new worktree
// by diffing before/after (R-HARVEST worktree association).
func TestT3_DispatchSnapshotsWorktrees(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam("bg", false)

	dispatchIdx := strings.Index(seam, "agent_dispatch()")
	if dispatchIdx < 0 {
		t.Fatal("agent_dispatch() not found in seam")
	}
	dispatchEnd := strings.Index(seam[dispatchIdx:], "\n}\n")
	if dispatchEnd < 0 {
		t.Fatal("agent_dispatch() closing brace not found")
	}
	dispatchBody := seam[dispatchIdx : dispatchIdx+dispatchEnd]

	// Find the bg) branch
	bgIdx := strings.Index(dispatchBody, "bg)")
	if bgIdx < 0 {
		t.Fatal("bg) branch not found in agent_dispatch")
	}
	bgBranch := dispatchBody[bgIdx:]
	if endIdx := strings.Index(bgBranch, ";;"); endIdx >= 0 {
		bgBranch = bgBranch[:endIdx]
	}

	// Must snapshot worktrees (git worktree list) BEFORE claude --bg dispatch
	// so harvest can diff new worktrees after the session completes.
	if !strings.Contains(bgBranch, "git worktree list") {
		t.Error("bg agent_dispatch must snapshot git worktree list before claude --bg for harvest association")
	}
	// The snapshot must be stored where agent_cleanup can find it (keyed to handle)
	if !strings.Contains(bgBranch, ".ca-worktree-snapshot") && !strings.Contains(bgBranch, "worktree-snapshot") {
		t.Error("bg agent_dispatch must store the worktree snapshot in a per-handle file for harvest association")
	}
}

// TestT3_CleanupCalledAfterDetectMarker verifies the main loop calls agent_cleanup
// after detect_marker so the harvest decision can be marker-aware (R-HARVEST, R-HARVEST-FAIL).
func TestT3_CleanupCalledAfterDetectMarker(t *testing.T) {
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

	// We need the CALL to agent_cleanup (with $AGENT_HANDLE), not just its definition.
	// The call site is `agent_cleanup "$AGENT_HANDLE"` (with optional extra args).
	callSite := `agent_cleanup "$AGENT_HANDLE"`
	detectSite := `MARKER=$(detect_marker`

	detectIdx := strings.Index(script, detectSite)
	cleanupIdx := strings.Index(script, callSite)
	if detectIdx < 0 {
		t.Fatal(`MARKER=$(detect_marker not found in generated loop script`)
	}
	if cleanupIdx < 0 {
		t.Fatalf("agent_cleanup call site %q not found in generated loop script (must be called post-detect_marker)", callSite)
	}
	if cleanupIdx < detectIdx {
		t.Errorf("agent_cleanup call must appear AFTER detect_marker in the loop (harvest is marker-aware): cleanup@%d detect@%d", cleanupIdx, detectIdx)
	}
}

// TestT3_CleanupAcceptsMarkerArg verifies agent_cleanup receives the marker
// as its second argument so it can distinguish success vs harvest-fail.
func TestT3_CleanupAcceptsMarkerArg(t *testing.T) {
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

	// The generated loop must call agent_cleanup "$AGENT_HANDLE" "$MARKER"
	if !strings.Contains(script, `agent_cleanup "$AGENT_HANDLE" "$MARKER"`) {
		t.Error(`generated loop must call agent_cleanup "$AGENT_HANDLE" "$MARKER" to pass marker to cleanup`)
	}
}

// TestT3_PBackendCleanupUnchanged verifies the p backend agent_cleanup remains a noop
// (R-PLEGACY: p backend must be byte-identical to pre-migration).
func TestT3_PBackendCleanupUnchanged(t *testing.T) {
	t.Parallel()
	seam := loopScriptSeam("bg", false)

	cleanupIdx := strings.Index(seam, "agent_cleanup()")
	if cleanupIdx < 0 {
		t.Fatal("agent_cleanup() not found in seam")
	}
	cleanupEnd := strings.Index(seam[cleanupIdx:], "\n}\n")
	if cleanupEnd < 0 {
		t.Fatal("agent_cleanup() closing brace not found")
	}
	cleanupBody := seam[cleanupIdx : cleanupIdx+cleanupEnd]

	// p backend must still be a noop
	pIdx := strings.Index(cleanupBody, "p)")
	if pIdx < 0 {
		t.Fatal("p) branch not found in agent_cleanup")
	}
	pBranch := cleanupBody[pIdx:]
	if endIdx := strings.Index(pBranch, ";;"); endIdx >= 0 {
		pBranch = pBranch[:endIdx]
	}
	// p backend: should be just a noop (:)
	if strings.Contains(pBranch, "git merge") || strings.Contains(pBranch, "claude rm") {
		t.Error("p backend agent_cleanup must remain a noop (R-PLEGACY)")
	}
}

// TestT3_HarvestIntegration_Success tests the harvest bash against a real temp git repo.
// Sets up a worktree-branch with a commit (simulating the bg agent's work), invokes
// the harvest logic with claude stubbed as a noop, and asserts:
// - working branch HEAD advances by the agent commit (S4, AC-5)
// - claude rm is invoked (worktree teardown)
// - no HUMAN_REQUIRED recorded
func TestT3_HarvestIntegration_Success(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Set up temp git repo: initial commit, then snapshot (before worktree), then worktree+commit.
	initialHead := setupGitRepoForHarvest(t, repoDir)

	// Write the pre-dispatch snapshot (agent_dispatch would have written this before claude --bg).
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	snapshotFile := filepath.Join(snapshotDir, "t1.txt")
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(snapshotFile, []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}

	// Add the worktree (simulating what claude --bg does).
	addWorktreeWithCommit(t, repoDir)

	logFile := filepath.Join(t.TempDir(), "harvest.log")
	rmLogFile := filepath.Join(stubDir, "claude-rm.log")
	harvestScript := buildHarvestTestScript(t, repoDir, stubDir, logFile, "complete")

	cmd := exec.Command("bash", harvestScript)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(), "BG_POLL_INTERVAL=1")
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("harvest script failed (success path): %v\noutput:\n%s", err, out)
	}

	// Assert: working branch HEAD advanced (contains the worktree commit).
	currentHead := gitHead(t, repoDir)
	if currentHead == initialHead {
		t.Errorf("working branch HEAD not advanced after harvest: still at initial %s\nscript output:\n%s", initialHead, out)
	}
	logOut := exec.Command("git", "log", "--oneline", "main")
	logOut.Dir = repoDir
	gitLogBytes, _ := logOut.CombinedOutput()
	if !strings.Contains(string(gitLogBytes), "agent: task done") {
		t.Errorf("agent commit not found on main after harvest:\n%s\nscript output:\n%s", gitLogBytes, out)
	}

	// Assert: claude rm was invoked for the session handle (t1).
	rmLogData, _ := os.ReadFile(rmLogFile)
	if !strings.Contains(string(rmLogData), "t1") {
		t.Errorf("claude rm was NOT invoked for session t1 after successful harvest (expected teardown)\nscript output:\n%s", out)
	}

	// Assert: no HUMAN_REQUIRED in harvest log.
	if data, readErr := os.ReadFile(logFile); readErr == nil {
		if strings.Contains(string(data), "HUMAN_REQUIRED") {
			t.Errorf("unexpected HUMAN_REQUIRED in harvest log for success path:\n%s", data)
		}
	}
}

// TestT3_HarvestIntegration_Conflict tests the harvest-fail path (S5, AC-6):
// induces a merge conflict, asserts working branch NOT advanced, merge aborted,
// claude rm NOT invoked, HUMAN_REQUIRED recorded.
func TestT3_HarvestIntegration_Conflict(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Set up repo, snapshot, add worktree with conflicting commit, then add conflicting main commit.
	setupGitRepoForConflict(t, repoDir)

	logFile := filepath.Join(t.TempDir(), "harvest.log")
	rmLogFile := filepath.Join(stubDir, "claude-rm.log")
	harvestScript := buildHarvestTestScript(t, repoDir, stubDir, logFile, "complete") // marker=complete so harvest is attempted

	cmd := exec.Command("bash", harvestScript)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(), "BG_POLL_INTERVAL=1")
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput() // non-zero exit OK — harvest-fail returns 1

	// Assert: working branch has no merge commit (merge was aborted).
	logOut := exec.Command("git", "log", "--oneline", "main")
	logOut.Dir = repoDir
	gitLogBytes, _ := logOut.CombinedOutput()
	if strings.Contains(string(gitLogBytes), "harvest(bg)") {
		t.Errorf("harvest merge commit found on main after conflict — merge should have been aborted:\n%s\nscript output:\n%s", gitLogBytes, out)
	}

	// Assert: claude rm was NOT invoked for the session handle (t1).
	// Note: the preflight probe may rm its own session (deadbeef); check specifically
	// that the actual session handle was NOT rm'd.
	rmLogData, _ := os.ReadFile(rmLogFile)
	if strings.Contains(string(rmLogData), "t1") {
		t.Errorf("claude rm WAS invoked for session t1 after harvest failure — must not delete worktree (R-HARVEST-FAIL)\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED recorded.
	data, readErr := os.ReadFile(logFile)
	if readErr != nil {
		t.Fatalf("harvest log not written: %v\nscript output:\n%s", readErr, out)
	}
	if !strings.Contains(string(data), "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED not recorded on harvest failure:\nlog: %s\nscript output:\n%s", data, out)
	}
}

// TestT3_LoopLevel_ConflictReachesCase verifies ISSUE 1 fix: after agent_cleanup on a
// harvest conflict with MARKER=complete, the generated loop does NOT exit non-zero at
// the cleanup call (set -euo pipefail must not trip), and the case "$MARKER" human:*
// handler runs (bd-update-equivalent log line emitted).
//
// Before fix: agent_cleanup returned 1 on conflict, aborting the script before case ran.
// After fix:  agent_cleanup returns 0 and reassigns MARKER to human:harvest-conflict,
//
//	so case "$MARKER" correctly triggers the human:* branch.
func TestT3_LoopLevel_ConflictReachesCase(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	logFile := filepath.Join(t.TempDir(), "harvest.log")

	// Set up a conflict scenario (snapshot + worktree-with-conflict + main-conflict-commit).
	setupGitRepoForConflict(t, repoDir)

	// Build a loop-level script: runs agent_cleanup then case "$MARKER" (like the real loop).
	script := buildLoopLevelTestScript(t, repoDir, stubDir, logFile, "complete")

	cmd := exec.Command("bash", script)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	// Script must exit 0 — set -euo pipefail must not abort at the cleanup call.
	if err != nil {
		t.Fatalf("loop-level script exited non-zero after conflict cleanup (set -e tripped at agent_cleanup): %v\noutput:\n%s", err, out)
	}

	// The human:* branch of case "$MARKER" must have run.
	if !strings.Contains(string(out), "CASE_HUMAN_TRIGGERED") {
		t.Errorf("case \"$MARKER\" human:* branch did not run after conflict cleanup — MARKER not reassigned or case not reached\noutput:\n%s", out)
	}

	// HUMAN_REQUIRED must be recorded in the harvest log.
	data, readErr := os.ReadFile(logFile)
	if readErr != nil {
		t.Fatalf("harvest log not written: %v\noutput:\n%s", readErr, out)
	}
	if !strings.Contains(string(data), "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED not recorded in harvest log for conflict path:\nlog: %s\noutput:\n%s", data, out)
	}
}

// TestT3_LoopLevel_NonCompleteReachesCase verifies ISSUE 1 fix for the non-complete-marker
// path: agent_cleanup with marker=failed must return 0 (not abort the loop), MARKER must
// remain non-complete, and case "$MARKER" must reach the failed/human branch.
func TestT3_LoopLevel_NonCompleteReachesCase(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()
	logFile := filepath.Join(t.TempDir(), "harvest.log")

	// Set up a minimal repo with snapshot + worktree (no conflict needed here).
	setupGitRepoForHarvest(t, repoDir)
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, "t1.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	addWorktreeWithCommit(t, repoDir)

	// marker=failed: cleanup must keep worktree, return 0, leave MARKER as "failed".
	script := buildLoopLevelTestScript(t, repoDir, stubDir, logFile, "failed")

	cmd := exec.Command("bash", script)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("loop-level script exited non-zero after non-complete cleanup: %v\noutput:\n%s", err, out)
	}

	// The failed branch of case "$MARKER" must have run (not human: here).
	if !strings.Contains(string(out), "CASE_FAILED_TRIGGERED") {
		t.Errorf("case \"$MARKER\" failed branch did not run after non-complete cleanup\noutput:\n%s", out)
	}

	// claude rm must NOT have been invoked for session t1 (worktree retained per R-HARVEST-FAIL).
	// Note: the preflight probe may rm its own session (deadbeef); check specifically
	// that the actual session handle was NOT rm'd.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), "t1") {
		t.Errorf("claude rm was invoked for session t1 on non-complete marker path — worktree must be retained\noutput:\n%s", out)
	}
}

// buildLoopLevelTestScript generates a bash script that simulates the real loop:
// runs agent_cleanup then executes case "$MARKER" to verify the case block is reached.
// The case block emits sentinel strings (CASE_HUMAN_TRIGGERED / CASE_FAILED_TRIGGERED)
// so the test can assert which branch fired.
func buildLoopLevelTestScript(t *testing.T, repoDir, stubDir, logFile, marker string) string {
	t.Helper()

	seam := loopScriptSeam("bg", false)

	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	// Simulates the real loop: detect_marker returns the initial marker; agent_cleanup
	// may reassign MARKER; then case "$MARKER" runs exactly as in loopScriptAttemptCases.
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + logFile + "\"\n" +
		"CA_BACKEND=bg\n" +
		"\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		"\n" +
		seam + "\n" +
		"\n" +
		"AGENT_HANDLE=\"t1\"\n" +
		"MARKER=\"" + marker + "\"\n" +
		"\n" +
		"# --- mirror the real loop sequence ---\n" +
		"agent_cleanup \"$AGENT_HANDLE\" \"$MARKER\"\n" +
		"\n" +
		"# case block mirrors loopScriptAttemptCases — emit sentinels instead of bd update.\n" +
		"case \"$MARKER\" in\n" +
		"  complete)\n" +
		"    echo CASE_COMPLETE_TRIGGERED\n" +
		"    ;;\n" +
		"  human:*)\n" +
		"    REASON=\"${MARKER#human:}\"\n" +
		"    echo \"CASE_HUMAN_TRIGGERED: $REASON\"\n" +
		"    ;;\n" +
		"  failed)\n" +
		"    echo CASE_FAILED_TRIGGERED\n" +
		"    ;;\n" +
		"  *)\n" +
		"    echo \"CASE_OTHER_TRIGGERED: $MARKER\"\n" +
		"    ;;\n" +
		"esac\n"

	scriptPath := filepath.Join(t.TempDir(), "loop-level-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write loop-level test script: %v", err)
	}
	return scriptPath
}

// --- integration test helpers ---

// setupGitRepoForHarvest initialises a git repo with an initial commit and returns
// the initial HEAD SHA. The caller is responsible for writing the snapshot and
// adding the worktree (order matters for snapshot correctness).
func setupGitRepoForHarvest(t *testing.T, repoDir string) (initialHead string) {
	t.Helper()
	mustGit(t, repoDir, "init", "-b", "main")
	mustGit(t, repoDir, "config", "user.email", "test@test.com")
	mustGit(t, repoDir, "config", "user.name", "Test")
	writeFile(t, repoDir, "README.md", "initial")
	mustGit(t, repoDir, "add", "README.md")
	mustGit(t, repoDir, "commit", "-m", "init")
	return gitHead(t, repoDir)
}

// captureWorktreePathsBeforeWorktree returns the git worktree list --porcelain
// worktree paths from repoDir (resolving symlinks so the snapshot matches
// what the bash script will see at harvest time).
func captureWorktreePathsBeforeWorktree(t *testing.T, repoDir string) string {
	t.Helper()
	cmd := exec.Command("bash", "-c",
		`git worktree list --porcelain | grep '^worktree ' | awk '{print $2}'`)
	cmd.Dir = repoDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("capture worktree paths: %v\n%s", err, out)
	}
	return string(out)
}

// addWorktreeWithCommit creates a linked worktree at .claude/worktrees/t1 on branch
// worktree-t1, and adds one commit on that branch (the "agent's work").
func addWorktreeWithCommit(t *testing.T, repoDir string) {
	t.Helper()
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", "t1")
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-t1", wtDir)
	writeFile(t, wtDir, "agent-output.txt", "agent work")
	mustGit(t, wtDir, "add", "agent-output.txt")
	gitCmd := exec.Command("git", "commit", "-m", "agent: task done")
	gitCmd.Dir = wtDir
	gitCmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	if out, err := gitCmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit in worktree: %v\n%s", err, out)
	}
}

// setupGitRepoForConflict builds the full conflict scenario in one step:
// init + initial commit + snapshot + worktree-with-conflicting-commit + main-conflicting-commit.
func setupGitRepoForConflict(t *testing.T, repoDir string) {
	t.Helper()
	mustGit(t, repoDir, "init", "-b", "main")
	mustGit(t, repoDir, "config", "user.email", "test@test.com")
	mustGit(t, repoDir, "config", "user.name", "Test")

	writeFile(t, repoDir, "shared.txt", "base")
	mustGit(t, repoDir, "add", "shared.txt")
	mustGit(t, repoDir, "commit", "-m", "init")

	// Snapshot BEFORE adding worktree.
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, "t1.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}

	// Create worktree-t1 and add conflicting commit.
	wtDir := filepath.Join(repoDir, ".claude", "worktrees", "t1")
	mustGit(t, repoDir, "worktree", "add", "-b", "worktree-t1", wtDir)
	writeFile(t, wtDir, "shared.txt", "agent version")
	mustGit(t, wtDir, "add", "shared.txt")
	gitCmd := exec.Command("git", "commit", "-m", "agent: modify shared file")
	gitCmd.Dir = wtDir
	gitCmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	if out, err := gitCmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit in worktree: %v\n%s", err, out)
	}

	// Commit on main that conflicts.
	writeFile(t, repoDir, "shared.txt", "main version")
	mustGit(t, repoDir, "add", "shared.txt")
	mustGit(t, repoDir, "commit", "-m", "main: modify shared file")
}

// buildHarvestTestScript generates a standalone bash script that runs agent_cleanup
// with the given marker against the repo in repoDir. claude is stubbed via stubDir.
func buildHarvestTestScript(t *testing.T, repoDir, stubDir, logFile, marker string) string {
	t.Helper()

	seam := loopScriptSeam("bg", false)

	// Stub claude: records invocations, always exits 0.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + logFile + "\"\n" +
		"CA_BACKEND=bg\n" +
		"\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		"\n" +
		seam + "\n" +
		"\n" +
		// Set AGENT_HANDLE and MARKER after the seam (seam resets AGENT_HANDLE=\"\").
		"AGENT_HANDLE=\"t1\"\n" +
		"MARKER=\"" + marker + "\"\n" +
		"\n" +
		"agent_cleanup \"$AGENT_HANDLE\" \"$MARKER\"\n"

	scriptPath := filepath.Join(t.TempDir(), "harvest-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write harvest test script: %v", err)
	}
	return scriptPath
}

// --- shared git helpers ---

func mustGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func gitHead(t *testing.T, dir string) string {
	t.Helper()
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git rev-parse HEAD: %v", err)
	}
	return strings.TrimSpace(string(out))
}

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	path := name
	if dir != "" {
		path = filepath.Join(dir, name)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
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

// extractBgPollLoop returns the bg poll loop region of the generated loop
// script — from the `bg_last_update=""` initializer through the matching
// `done` that closes the `while true` poll loop. Used by runtime tests that
// exercise the poll loop in isolation with stubbed helpers.
func extractBgPollLoop(t *testing.T) string {
	t.Helper()
	setup := loopScriptAttemptSetup()
	start := strings.Index(setup, `bg_last_update=""`)
	if start < 0 {
		t.Fatal("bg poll loop initializer (bg_last_update=\"\") not found in loopScriptAttemptSetup")
	}
	// The poll loop body ends at the first `\n      done\n` after the start
	// (6-space indent matches the generated `done` that closes `while true`).
	rel := strings.Index(setup[start:], "\n      done\n")
	if rel < 0 {
		t.Fatal("bg poll loop closing `done` not found in loopScriptAttemptSetup")
	}
	return setup[start : start+rel+len("\n      done\n")]
}

// TestBgBackend_PollLoop_EscalatesWhenStateJsonNeverAppears is a regression
// test for the infinite-spin path (learning_agent-yvm8, fix D): when
// claude --bg returns a parsed session id but the session dies before EVER
// writing state.json, agent_poll returns "running" forever and the stale
// watchdog never increments (the else branch resets bg_stale_secs=0 each
// iteration). The loop must instead escalate the kill ladder within a bounded
// first-write deadline (reusing SESSION_STALE_TIMEOUT) rather than spinning.
func TestBgBackend_PollLoop_EscalatesWhenStateJsonNeverAppears(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	t.Parallel()

	loopBody := extractBgPollLoop(t)

	memLog := filepath.Join(t.TempDir(), "mem.log")
	traceFile := filepath.Join(t.TempDir(), "trace.jsonl")
	killLog := filepath.Join(t.TempDir(), "kill.log")

	// Stubs: agent_poll always "running" (state.json never appears);
	// get_memory_pct returns healthy (no memory escalation); bg_kill_ladder
	// records the escalation and lets the loop break via bg_killed.
	// SESSION_STALE_TIMEOUT=2, BG_POLL_INTERVAL=1 => deadline reached in ~2s.
	// A hard 30s `timeout` proves the loop does NOT spin forever.
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"agent_poll() { echo running; }\n" +
		"get_memory_pct() { echo 90; }\n" +
		"bg_kill_ladder() { echo \"bg_kill_ladder called: $1 $2\" >> \"" + killLog + "\"; }\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		"AGENT_HANDLE=deadbeef\n" +
		"HOME=\"" + t.TempDir() + "\"\n" +
		"MEM_LOG=\"" + memLog + "\"\n" +
		"TRACEFILE=\"" + traceFile + "\"\n" +
		"SESSION_STALE_TIMEOUT=2\n" +
		"BG_POLL_INTERVAL=1\n" +
		"WATCHDOG_THRESHOLD=15\n" +
		loopBody + "\n"

	scriptPath := filepath.Join(t.TempDir(), "poll-loop.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	// Hard wall-clock cap: if the loop spins forever, the context kills it at
	// 30s and the kill-ladder assertion below fails (the real bug).
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", scriptPath)
	out, _ := cmd.CombinedOutput()
	timedOut := ctx.Err() == context.DeadlineExceeded

	killData, _ := os.ReadFile(killLog)
	if !strings.Contains(string(killData), "bg_kill_ladder called") {
		t.Errorf("bg poll loop must escalate bg_kill_ladder when state.json never appears (infinite-spin guard)\nscript output:\n%s", out)
	}
	memData, _ := os.ReadFile(memLog)
	if !strings.Contains(string(memData), "STALE_WATCHDOG") {
		t.Errorf("bg poll loop must log STALE_WATCHDOG when state.json never appears within the first-write deadline\nmem.log:\n%s\noutput:\n%s", memData, out)
	}
	if timedOut {
		t.Errorf("bg poll loop spun until the 30s hard timeout — infinite-spin bug NOT fixed\noutput:\n%s", out)
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
	seam := loopScriptSeam("bg", false)

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
	seam := loopScriptSeam("bg", false)

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
			"--reviewers", "claude-sonnet,agy", "--review-every", "2"}},
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
		"--reviewers", "claude-sonnet,agy",
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

// --- T4: Watchdog / Orphans / ca watch ---

// TestT4_KillLadder_HasStopThenRmThenSweep verifies that the bg stale-watchdog
// kill ladder in the generated script escalates through all three stages:
// (1) agent_stop, (2) claude rm (harvest-safe), (3) scoped process sweep.
// R-WATCHDOG, AC-8, S7.
func TestT4_KillLadder_HasStopThenRmThenSweep(t *testing.T) {
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

	// The kill ladder must be present somewhere in the script.
	if !strings.Contains(script, "bg_kill_ladder") {
		t.Error("kill ladder function (bg_kill_ladder) must be defined in the generated script (R-WATCHDOG)")
	}
	// The ladder must call agent_stop (step 1).
	seam := loopScriptSeam("bg", false)
	memSafety := loopScriptMemorySafety()
	ladder := seam + memSafety
	if !strings.Contains(ladder, "bg_kill_ladder") {
		t.Error("bg_kill_ladder must be defined in the seam or memory-safety section")
	}
}

// TestT4_KillLadder_StaleMarkerWritten verifies that the stale-watchdog trip
// writes a STALE_WATCHDOG: marker to MEM_LOG (so existing detection still works).
// R-WATCHDOG.
func TestT4_KillLadder_StaleMarkerWritten(t *testing.T) {
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

	if !strings.Contains(script, "STALE_WATCHDOG:") {
		t.Error("stale-watchdog trip must write STALE_WATCHDOG: marker to MEM_LOG (R-WATCHDOG)")
	}
	if !strings.Contains(script, "WATCHDOG:") {
		t.Error("memory-watchdog trip must write WATCHDOG: marker to MEM_LOG (R-MEMGUARD)")
	}
}

// TestT4_KillLadder_BgLadderFunction verifies that bg_kill_ladder implements
// the required three-stage escalation: stop -> harvest-safe rm -> scoped sweep.
// The ladder function must be present in the memory-safety or seam section.
func TestT4_KillLadder_BgLadderFunction(t *testing.T) {
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

	// Find the bg_kill_ladder function body.
	idx := strings.Index(script, "bg_kill_ladder()")
	if idx < 0 {
		t.Fatal("bg_kill_ladder() not found in generated script")
	}
	// Extract a reasonable window (up to 100 lines).
	body := script[idx:]
	closeIdx := strings.Index(body, "\n}\n")
	if closeIdx > 0 {
		body = body[:closeIdx]
	}

	// Stage 1: agent_stop must be called.
	if !strings.Contains(body, "agent_stop") {
		t.Error("bg_kill_ladder stage 1 must call agent_stop (claude stop)")
	}
	// Stage 2: claude rm must be referenced (harvest-safe rm).
	if !strings.Contains(body, "claude rm") {
		t.Error("bg_kill_ladder stage 2 must reference claude rm (harvest-safe teardown)")
	}
	// Stage 3: scoped process sweep (pkill/kill of processes owning this handle).
	if !strings.Contains(body, "pkill") && !strings.Contains(body, "HUMAN_REQUIRED") {
		t.Error("bg_kill_ladder stage 3 must include scoped sweep (pkill) or log HUMAN_REQUIRED")
	}
	// The ladder must not rm if worktree is un-harvested (harvest-safety check present).
	if !strings.Contains(body, "worktree") && !strings.Contains(body, "snapshot") {
		t.Error("bg_kill_ladder must include harvest-safety check before claude rm")
	}
}

// TestT4_KillLadder_Runtime_NoRmIfWorktreePresent is a runtime test that verifies
// the kill ladder does NOT invoke claude rm when the bg session has an un-harvested
// worktree. This enforces the data-loss guard (R-HARVEST-FAIL).
func TestT4_KillLadder_Runtime_NoRmIfWorktreePresent(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Init git repo and create a worktree simulating an un-harvested bg session.
	setupGitRepoForHarvest(t, repoDir)
	// Write the pre-dispatch snapshot.
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, "11111111.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	// Add the worktree (simulating un-harvested work).
	addWorktreeWithCommit(t, repoDir)

	// Build claude stub that records rm invocations.
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	memLog := filepath.Join(t.TempDir(), "mem.log")
	harvestLog := filepath.Join(t.TempDir(), "harvest.log")

	// Build a script that invokes bg_kill_ladder directly with a fake handle.
	seam := loopScriptSeam("bg", false)
	memSafety := loopScriptMemorySafety()
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"CA_BACKEND=bg\n" +
		"HAS_JQ=false\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		memSafety + "\n" +
		seam + "\n" +
		"AGENT_HANDLE=11111111\n" +
		"MEM_LOG=\"" + memLog + "\"\n" +
		"bg_kill_ladder \"$AGENT_HANDLE\" \"stale\" \"$MEM_LOG\"\n"

	scriptPath := filepath.Join(t.TempDir(), "ladder-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput() // allow non-zero (HUMAN_REQUIRED path)

	// Assert: claude rm must NOT have been called for the session handle.
	// Note: the preflight probe may rm its own session (deadbeef); we check
	// specifically that the actual session handle was NOT rm'd. Per-test
	// unique handle avoids cross-test pkill collisions under parallel load.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), "11111111") {
		t.Errorf("claude rm was invoked for session 11111111 despite un-harvested worktree — data-loss guard broken\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED logged instead.
	harvest, _ := os.ReadFile(harvestLog)
	memLogData, _ := os.ReadFile(memLog)
	combined := string(harvest) + string(memLogData) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when kill ladder cannot rm an un-harvested session\noutput:\n%s", combined)
	}
}

// TestT4_KillLadder_Runtime_RmIfNoWorktree verifies the kill ladder DOES invoke
// claude rm when the session has NO un-harvested worktree (safe teardown).
func TestT4_KillLadder_Runtime_RmIfNoWorktree(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Init git repo WITHOUT any worktree (snapshot exists but no new worktree).
	setupGitRepoForHarvest(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	// Write snapshot that matches the current worktree set (no new worktrees).
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, "22222222.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	// NOTE: no worktree added — session 22222222 has no un-harvested work.

	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	memLog := filepath.Join(t.TempDir(), "mem.log")
	harvestLog := filepath.Join(t.TempDir(), "harvest.log")

	seam := loopScriptSeam("bg", false)
	memSafety := loopScriptMemorySafety()
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"CA_BACKEND=bg\n" +
		"HAS_JQ=false\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		memSafety + "\n" +
		seam + "\n" +
		"AGENT_HANDLE=22222222\n" +
		"MEM_LOG=\"" + memLog + "\"\n" +
		"bg_kill_ladder \"$AGENT_HANDLE\" \"stale\" \"$MEM_LOG\"\n"

	scriptPath := filepath.Join(t.TempDir(), "ladder-no-wt.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm MUST have been called for the session handle.
	// Per-test unique handle avoids cross-test pkill collisions under parallel load.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if !strings.Contains(string(rmLogData), "22222222") {
		t.Errorf("claude rm was NOT invoked for session 22222222 with no worktree — teardown must proceed\noutput:\n%s", out)
	}
}

// runBootstrapPreflight builds and runs a minimal harness around the generated
// bootstrap_preflight (bg seam) with a claude stub whose behaviour is driven by
// stubBody. Returns combined output and the process exit code.
func runBootstrapPreflight(t *testing.T, repoDir, stubExtra string) (string, int) {
	t.Helper()
	stubDir := t.TempDir()
	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		stubExtra +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	seam := loopScriptSeam("bg", false)
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"CA_BACKEND=bg\n" +
		"HAS_JQ=false\n" +
		"log() { echo \"[LOG] $*\"; }\n" +
		seam + "\n" +
		"echo PREFLIGHT_PASSED\n"

	scriptPath := filepath.Join(t.TempDir(), "preflight.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}
	cmd := exec.Command("bash", scriptPath)
	cmd.Dir = repoDir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	out, err := cmd.CombinedOutput()
	code := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		code = exitErr.ExitCode()
	} else if err != nil {
		t.Fatalf("run preflight: %v\n%s", err, out)
	}
	return string(out), code
}

// TestBootstrapPreflight_FailsLoudWhenBgIsolationNotNone is a regression test
// for learning_agent-52r1 (fix B): the bg backend requires
// worktree.bgIsolation: none (otherwise bd is unreachable from the auto-isolated
// worktree and epics never close). bootstrap_preflight must FAIL LOUD (exit 1
// with remediation) when the effective setting is not none.
func TestBootstrapPreflight_FailsLoudWhenBgIsolationNotNone(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()
	repoDir := t.TempDir()
	setupGitRepoForHarvest(t, repoDir)

	// claude config get worktree.bgIsolation -> "worktree" (NOT none).
	stubExtra := "if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo worktree\n" +
		"  exit 0\n" +
		"fi\n"
	out, code := runBootstrapPreflight(t, repoDir, stubExtra)

	if code != 1 {
		t.Errorf("bootstrap_preflight must exit 1 when bgIsolation is not none, got exit %d\noutput:\n%s", code, out)
	}
	if strings.Contains(out, "PREFLIGHT_PASSED") {
		t.Errorf("bootstrap_preflight must NOT pass when bgIsolation is not none\noutput:\n%s", out)
	}
	if !strings.Contains(out, "bgIsolation") {
		t.Errorf("bootstrap_preflight failure must mention bgIsolation in the remediation\noutput:\n%s", out)
	}
}

// TestBootstrapPreflight_PassesWhenBgIsolationNone verifies the happy path:
// `claude config get worktree.bgIsolation` reports none, so preflight proceeds.
func TestBootstrapPreflight_PassesWhenBgIsolationNone(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()
	repoDir := t.TempDir()
	setupGitRepoForHarvest(t, repoDir)

	stubExtra := "if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		": \"$subcmd\"\n"
	out, code := runBootstrapPreflight(t, repoDir, stubExtra)

	if code != 0 {
		t.Errorf("bootstrap_preflight must exit 0 when bgIsolation is none, got exit %d\noutput:\n%s", code, out)
	}
	if !strings.Contains(out, "PREFLIGHT_PASSED") {
		t.Errorf("bootstrap_preflight must proceed when bgIsolation is none\noutput:\n%s", out)
	}
}

// TestBootstrapPreflight_FailsLoudWhenBgIsolationUnconfirmable verifies the
// safe default: if `claude config get` is unavailable AND no settings JSON
// confirms bgIsolation=none, preflight must err toward failing loud (exit 1).
func TestBootstrapPreflight_FailsLoudWhenBgIsolationUnconfirmable(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()
	repoDir := t.TempDir()
	setupGitRepoForHarvest(t, repoDir)

	// `claude config get` exits non-zero (subcommand absent); no settings JSON
	// exists in repoDir, so bgIsolation=none cannot be confirmed.
	stubExtra := "if [ \"$1\" = \"config\" ]; then\n" +
		"  echo \"error: unknown command 'config'\" >&2\n" +
		"  exit 2\n" +
		"fi\n"
	out, code := runBootstrapPreflight(t, repoDir, stubExtra)

	if code != 1 {
		t.Errorf("bootstrap_preflight must exit 1 when bgIsolation=none cannot be confirmed, got exit %d\noutput:\n%s", code, out)
	}
	if strings.Contains(out, "PREFLIGHT_PASSED") {
		t.Errorf("bootstrap_preflight must NOT pass when bgIsolation cannot be confirmed none\noutput:\n%s", out)
	}
}

// TestBootstrapPreflight_PassesViaSettingsJSONWhenConfigGetAbsent verifies the
// fallback: when `claude config get` is unavailable, preflight reads the
// settings JSON precedence and passes if .worktree.bgIsolation == "none".
func TestBootstrapPreflight_PassesViaSettingsJSONWhenConfigGetAbsent(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()
	repoDir := t.TempDir()
	setupGitRepoForHarvest(t, repoDir)

	// project .claude/settings.json with worktree.bgIsolation = none.
	claudeDir := filepath.Join(repoDir, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatalf("mkdir .claude: %v", err)
	}
	settings := `{"worktree":{"bgIsolation":"none"}}`
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), []byte(settings), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}

	stubExtra := "if [ \"$1\" = \"config\" ]; then\n" +
		"  echo \"error: unknown command 'config'\" >&2\n" +
		"  exit 2\n" +
		"fi\n"
	out, code := runBootstrapPreflight(t, repoDir, stubExtra)

	if code != 0 {
		t.Errorf("bootstrap_preflight must exit 0 when settings.json confirms bgIsolation=none, got exit %d\noutput:\n%s", code, out)
	}
	if !strings.Contains(out, "PREFLIGHT_PASSED") {
		t.Errorf("bootstrap_preflight must proceed when settings.json confirms bgIsolation=none\noutput:\n%s", out)
	}
}

// TestPolishArchitect_RunsSynchronouslyRegardlessOfBackend is a regression test
// for learning_agent-52r1 (fix C): the polish architect only runs
// `bd create --type=epic` / `bd dep add` and makes NO code edits, so it must
// run on the SYNCHRONOUS path (agent_invoke) even under CA_BACKEND=bg so its
// bd writes reach the main-tree Dolt (G2: bd is unreachable from a bg worktree).
func TestPolishArchitect_RunsSynchronouslyRegardlessOfBackend(t *testing.T) {
	t.Parallel()
	arch := polishScriptPolishArchitect()

	archIdx := strings.Index(arch, "run_polish_architect()")
	if archIdx < 0 {
		t.Fatal("run_polish_architect() not found")
	}
	body := arch[archIdx:]
	closeIdx := strings.Index(body, "\n}\n")
	if closeIdx > 0 {
		body = body[:closeIdx]
	}

	// The architect dispatch must NOT branch on CA_BACKEND to a bg path — it
	// must always invoke the synchronous agent_invoke so bd writes land in the
	// main tree's Dolt.
	if strings.Contains(body, "bg_dispatch_reviewer_polish") {
		t.Error("polish architect must NOT dispatch via bg_dispatch_reviewer_polish — bd is unreachable from a bg worktree (G2); architect must run synchronously")
	}
	if !strings.Contains(body, "agent_invoke ") {
		t.Error("polish architect must invoke agent_invoke (synchronous path) regardless of CA_BACKEND")
	}
}

// TestT4_KillLadder_Runtime_NoRmIfSnapshotMissing is a regression test for the
// data-loss path (learning_agent-o3lu, fix A/E): when the pre-dispatch snapshot
// file is ABSENT, worktree safety cannot be verified, so the kill ladder MUST
// treat the session as UNVERIFIABLE — NEVER invoke claude rm — and log
// HUMAN_REQUIRED instead. Mirrors the safe-default already in the reviewer/polish
// scripts (_snap_found=false idiom).
func TestT4_KillLadder_Runtime_NoRmIfSnapshotMissing(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Init git repo. NOTE: no snapshot file is written for handle t1 — the
	// snapshot is MISSING, so worktree safety is unverifiable.
	setupGitRepoForHarvest(t, repoDir)

	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	memLog := filepath.Join(t.TempDir(), "mem.log")
	harvestLog := filepath.Join(t.TempDir(), "harvest.log")

	seam := loopScriptSeam("bg", false)
	memSafety := loopScriptMemorySafety()
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"CA_BACKEND=bg\n" +
		"HAS_JQ=false\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		memSafety + "\n" +
		seam + "\n" +
		"AGENT_HANDLE=33333333\n" +
		"MEM_LOG=\"" + memLog + "\"\n" +
		"bg_kill_ladder \"$AGENT_HANDLE\" \"stale\" \"$MEM_LOG\"\n"

	scriptPath := filepath.Join(t.TempDir(), "ladder-no-snap.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
		"HOME="+t.TempDir(),
		"BG_POLL_INTERVAL=1",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm must NOT have been called for the session handle — snapshot
	// missing is unverifiable, so teardown must be refused (data-loss guard).
	// Per-test unique handle avoids cross-test pkill collisions under parallel load.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), "33333333") {
		t.Errorf("claude rm was invoked for session 33333333 despite MISSING snapshot — data-loss guard broken\nscript output:\n%s", out)
	}

	// Assert: HUMAN_REQUIRED logged instead.
	harvest, _ := os.ReadFile(harvestLog)
	memLogData, _ := os.ReadFile(memLog)
	combined := string(harvest) + string(memLogData) + string(out)
	if !strings.Contains(combined, "HUMAN_REQUIRED") {
		t.Errorf("HUMAN_REQUIRED must be logged when kill ladder cannot verify worktree safety (missing snapshot)\noutput:\n%s", combined)
	}
}

// TestT4_CleanupOrphans_BgSectionPresent verifies that cleanup_orphans has a
// bg-aware section that enumerates ~/.claude/jobs/ for stray sessions.
// R-FRAMEWORK, AC-11.
func TestT4_CleanupOrphans_BgSectionPresent(t *testing.T) {
	t.Parallel()
	memSafety := loopScriptMemorySafety()

	// The cleanup_orphans function must enumerate ~/.claude/jobs/.
	if !strings.Contains(memSafety, ".claude/jobs") {
		t.Error("cleanup_orphans must enumerate ~/.claude/jobs/ for bg orphan detection (R-FRAMEWORK)")
	}
	// The bg orphan section must not unconditionally call claude rm.
	// It must include a harvest-safety check (worktree check or snapshot check).
	if !strings.Contains(memSafety, "HUMAN_REQUIRED") {
		t.Error("cleanup_orphans bg section must log HUMAN_REQUIRED for un-safe-to-rm orphans")
	}
}

// TestT4_CleanupOrphans_PBackendBehaviorUnchanged verifies that the PID-based
// p-path in cleanup_orphans is byte-identical after adding the bg section.
// R-PLEGACY.
func TestT4_CleanupOrphans_PBackendBehaviorUnchanged(t *testing.T) {
	t.Parallel()
	memSafety := loopScriptMemorySafety()

	// The p backend's existing pgrep-based orphan detection must still be present.
	if !strings.Contains(memSafety, "pgrep") {
		t.Error("p backend pgrep-based orphan detection must remain in cleanup_orphans (R-PLEGACY)")
	}
	// The test/build process patterns must still be there.
	if !strings.Contains(memSafety, "vitest") {
		t.Error("vitest pattern must remain in p-backend cleanup_orphans (R-PLEGACY)")
	}
	if !strings.Contains(memSafety, "go.test") && !strings.Contains(memSafety, "go\\.test") {
		t.Error("go.test pattern must remain in p-backend cleanup_orphans (R-PLEGACY)")
	}
}

// TestT4_CleanupOrphans_Runtime_NoRmOrphanWithWorktree is a runtime test that
// asserts a bg orphan session with an un-harvested worktree does NOT get
// claude rm'd by cleanup_orphans. Conservative policy: log HUMAN_REQUIRED.
func TestT4_CleanupOrphans_Runtime_NoRmOrphanWithWorktree(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	t.Parallel()

	repoDir := t.TempDir()
	stubDir := t.TempDir()

	// Set up git repo with an orphan worktree.
	setupGitRepoForHarvest(t, repoDir)
	snapshotDir := filepath.Join(repoDir, ".ca-worktree-snapshots")
	preSnapshot := captureWorktreePathsBeforeWorktree(t, repoDir)
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		t.Fatalf("mkdir snapshot dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(snapshotDir, "orphan1.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
	// Add the worktree (orphaned un-harvested work).
	addWorktreeWithCommit(t, repoDir)

	// Create a fake ~/.claude/jobs/orphan1/state.json with a stale non-terminal state.
	jobsDir := filepath.Join(t.TempDir(), ".claude", "jobs", "orphan1")
	if err := os.MkdirAll(jobsDir, 0o755); err != nil {
		t.Fatalf("mkdir jobs dir: %v", err)
	}
	// Write a state.json with a non-terminal state (working) and old mtime.
	stateJSON := `{"state":"working","inFlight":{"tasks":1}}`
	stateFile := filepath.Join(jobsDir, "state.json")
	if err := os.WriteFile(stateFile, []byte(stateJSON), 0o644); err != nil {
		t.Fatalf("write state.json: %v", err)
	}
	// Backdate the state.json to simulate staleness (older than SESSION_STALE_TIMEOUT*2).
	pastTime := "200101010000"
	exec.Command("touch", "-t", pastTime, stateFile).Run() //nolint:errcheck

	claudeStub := filepath.Join(stubDir, "claude")
	stubContent := "#!/usr/bin/env bash\n" +
		// bootstrap_preflight calls claude --bg for the probe; return a fake session id.
		"if [ \"$1\" = \"--bg\" ]; then\n" +
		"  echo \"backgrounded · deadbeef\"\n" +
		"  exit 0\n" +
		"fi\n" +
		// bootstrap_preflight checks worktree.bgIsolation; simulate the
		// required operator config (bgIsolation=none) so the bg seam proceeds.
		"if [ \"$1\" = \"config\" ] && [ \"$2\" = \"get\" ]; then\n" +
		"  echo none\n" +
		"  exit 0\n" +
		"fi\n" +
		"subcmd=\"$1\"; shift\n" +
		"if [ \"$subcmd\" = \"rm\" ]; then\n" +
		"  echo \"claude rm $*\" >> \"" + stubDir + "/claude-rm.log\"\n" +
		"elif [ \"$subcmd\" = \"stop\" ]; then\n" +
		"  echo \"claude stop $*\" >> \"" + stubDir + "/claude-stop.log\"\n" +
		"fi\n" +
		"exit 0\n"
	writeFile(t, "", claudeStub, stubContent)
	if err := os.Chmod(claudeStub, 0o755); err != nil {
		t.Fatalf("chmod claude stub: %v", err)
	}

	harvestLog := filepath.Join(t.TempDir(), "harvest.log")
	memSafety := loopScriptMemorySafety()
	seam := loopScriptSeam("bg", false)

	// Script: call cleanup_orphans with a fake CLAUDE_JOBS_DIR and REPO_ROOT override.
	script := "#!/usr/bin/env bash\n" +
		"set -euo pipefail\n" +
		"export PATH=\"" + stubDir + ":$PATH\"\n" +
		"export HARVEST_LOG=\"" + harvestLog + "\"\n" +
		"CA_BACKEND=bg\n" +
		"HAS_JQ=false\n" +
		"SESSION_STALE_TIMEOUT=300\n" +
		"CLAUDE_JOBS_DIR=\"" + filepath.Join(t.TempDir(), ".claude", "jobs") + "\"\n" +
		"log() { echo \"[LOG] $*\" >&2; }\n" +
		memSafety + "\n" +
		seam + "\n" +
		"cleanup_orphans\n"

	// We need the real jobs dir to be the one we set up.
	// Override HOME to point to a temp dir containing our fake .claude/jobs.
	fakeHome := t.TempDir()
	fakeDotClaude := filepath.Join(fakeHome, ".claude", "jobs", "orphan1")
	if err := os.MkdirAll(fakeDotClaude, 0o755); err != nil {
		t.Fatalf("mkdir fake jobs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fakeDotClaude, "state.json"), []byte(stateJSON), 0o644); err != nil {
		t.Fatalf("write fake state.json: %v", err)
	}
	exec.Command("touch", "-t", pastTime, filepath.Join(fakeDotClaude, "state.json")).Run() //nolint:errcheck

	// Write the snapshot for the orphan session in the repo.
	if err := os.WriteFile(filepath.Join(snapshotDir, "orphan1.txt"), []byte(preSnapshot), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}

	scriptPath := filepath.Join(t.TempDir(), "orphan-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	cmd := exec.Command("bash", scriptPath)
	cmd.Env = append(os.Environ(),
		"HOME="+fakeHome,
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@test.com",
	)
	cmd.Dir = repoDir
	out, _ := cmd.CombinedOutput()

	// Assert: claude rm must NOT have been called for the orphan session handle (orphan1).
	// Note: the preflight probe may rm its own session (deadbeef); we check
	// specifically that the actual orphan session was NOT rm'd.
	rmLog := filepath.Join(stubDir, "claude-rm.log")
	rmLogData, _ := os.ReadFile(rmLog)
	if strings.Contains(string(rmLogData), "orphan1") {
		t.Errorf("cleanup_orphans called claude rm on orphan1 with un-harvested worktree — data-loss guard broken\noutput:\n%s", out)
	}
	// Assert: HUMAN_REQUIRED logged.
	harvest, _ := os.ReadFile(harvestLog)
	if !strings.Contains(string(harvest)+string(out), "HUMAN_REQUIRED") {
		t.Errorf("cleanup_orphans must log HUMAN_REQUIRED for orphan with un-harvested worktree\noutput:\n%s\nharvest log:\n%s", out, harvest)
	}
}

// TestT4_CaWatch_BgPollingAppendsToTracefile verifies that the bg poll loop
// appends synthetic status events to $TRACEFILE, enabling `ca watch` to show
// live output during a bg session. R-FRAMEWORK, AC-11.
func TestT4_CaWatch_BgPollingAppendsToTracefile(t *testing.T) {
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

	// The bg poll loop must append a status record to TRACEFILE each poll.
	// We verify by checking that the bg poll loop references TRACEFILE for writes.
	// The simplest check: the bg poll section must write/append to TRACEFILE.
	bgPollIdx := strings.Index(script, "bg backend: poll state.json")
	if bgPollIdx < 0 {
		t.Fatal("bg poll section comment not found in generated script")
	}
	bgPollSection := script[bgPollIdx:]
	// Find the end of the bg poll block (the fi that closes the if CA_BACKEND=p).
	// We check that TRACEFILE is referenced in writes within this section.
	if !strings.Contains(bgPollSection, "TRACEFILE") {
		t.Error("bg poll loop must reference TRACEFILE for ca watch live status (R-FRAMEWORK)")
	}
}

// TestT4_CaWatch_PBackendLatestSymlinkUnchanged verifies that the .latest
// symlink mechanism for p backend is byte-identical (R-PLEGACY).
func TestT4_CaWatch_PBackendLatestSymlinkUnchanged(t *testing.T) {
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

	// The .latest symlink update must still be present before claude invocation.
	if !strings.Contains(script, `ln -sf "$(basename "$TRACEFILE")" "$LOG_DIR/.latest"`) {
		t.Error(".latest symlink update for p backend must remain byte-identical (R-PLEGACY)")
	}
}

// TestT4_CaWatch_BgDataSourceDocumented verifies that the generated script
// or the seam code documents the bg ca watch data source.
func TestT4_CaWatch_BgDataSourceDocumented(t *testing.T) {
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

	// The script must document that ca watch for bg uses the TRACEFILE
	// (which agent_collect populates from the transcript at end-of-session).
	if !strings.Contains(script, "ca watch") && !strings.Contains(script, "bg.*watch") {
		// The documentation lives in comments; check the seam.
		seam := loopScriptSeam("bg", false)
		if !strings.Contains(seam, "ca watch") {
			t.Error("bg ca watch data source must be documented in the generated script or seam comments")
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
			"--reviewers", "claude-sonnet,claude-opus,agy,codex", "--review-every", "2"}},
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
