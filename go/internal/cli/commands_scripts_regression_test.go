package cli

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratedForegroundDetectorRequiresRootTerminalResult(t *testing.T) {
	script := generateLoopScript(loopGenerateOptions{backend: "p", backendExplicit: true, model: "claude-sonnet-4-20250514"})
	start := strings.Index(script, "# --- Marker Detection ---")
	end := strings.Index(script, "# --- Observability ---")
	if start < 0 || end <= start {
		t.Fatal("generated script did not contain marker detector")
	}
	detector := script[start:end]
	for _, tc := range []struct {
		name   string
		events []map[string]any
		want   string
	}{
		{name: "user prompt marker", events: []map[string]any{{"type": "user", "message": map[string]any{"content": "emit EPIC_COMPLETE"}}}, want: "none"},
		{name: "intermediate assistant marker", events: []map[string]any{{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "EPIC_COMPLETE"}}}}}, want: "none"},
		{name: "tool marker", events: []map[string]any{{"type": "tool_result", "content": "EPIC_COMPLETE"}}, want: "none"},
		{name: "subagent completion", events: []map[string]any{{"type": "result", "parent_tool_use_id": "child", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}}, want: "none"},
		{name: "sidechain completion", events: []map[string]any{{"type": "result", "isSidechain": true, "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}}, want: "none"},
		{name: "root success", events: []map[string]any{{"type": "result", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}}, want: "complete"},
		{name: "error result marker", events: []map[string]any{{"type": "result", "subtype": "error_during_execution", "is_error": true, "result": "EPIC_COMPLETE"}}, want: "failed"},
		{name: "missing error flag", events: []map[string]any{{"type": "result", "subtype": "success", "result": "EPIC_COMPLETE"}}, want: "failed"},
		{name: "duplicate terminal results", events: []map[string]any{{"type": "result", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}, {"type": "result", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}}, want: "none"},
		{name: "activity after root result", events: []map[string]any{{"type": "result", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}, {"type": "assistant", "message": map[string]any{"content": "still working"}}}, want: "none"},
		{name: "expired auth beats prompt marker", events: []map[string]any{{"type": "user", "message": map[string]any{"content": "EPIC_COMPLETE"}}, {"type": "assistant", "error": "authentication_failed", "message": map[string]any{"content": []any{map[string]any{"type": "text", "text": "Login expired · Please run /login"}}}}}, want: "auth_failed"},
		{name: "provider error beats later success", events: []map[string]any{{"type": "assistant", "error": "rate_limit"}, {"type": "result", "subtype": "success", "is_error": false, "result": "EPIC_COMPLETE"}}, want: "failed"},
		{name: "malformed terminal JSON", events: nil, want: "none"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			trace, log := filepath.Join(t.TempDir(), "trace.jsonl"), filepath.Join(t.TempDir(), "log")
			var lines []string
			for _, event := range tc.events {
				b, _ := json.Marshal(event)
				lines = append(lines, string(b))
			}
			if tc.name == "malformed terminal JSON" {
				lines = []string{`{"type":"result","result":"EPIC_COMPLETE"`, `not-json`}
			}
			if err := os.WriteFile(trace, []byte(strings.Join(lines, "\n")), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(log, []byte("Login expired · Please run /login\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("bash", "-c", detector+"\ndetect_marker \"$1\" \"$2\"", "probe", log, trace)
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("generated detector: %v\n%s", err, out)
			}
			if got := strings.TrimSpace(string(out)); got != tc.want {
				t.Fatalf("detector = %q; want %q", got, tc.want)
			}
		})
	}
}

func TestGeneratedForegroundDispatchNeverCallsClaudeBackgroundMode(t *testing.T) {
	script := generateLoopScript(loopGenerateOptions{backend: "p", backendExplicit: true, model: "claude-sonnet-4-20250514"})
	start := strings.Index(script, "agent_dispatch() {")
	end := strings.Index(script[start:], "\n}\n\n# agent_poll")
	if start < 0 || end < 0 {
		t.Fatal("generated script did not contain dispatch function")
	}
	dispatch := script[start : start+end+2]
	calls := filepath.Join(t.TempDir(), "claude-calls")
	stub := "claude() { printf '%s\\n' \"$*\" >> \"$CALLS\"; printf '%s\\n' '{\\\"type\\\":\\\"result\\\",\\\"subtype\\\":\\\"success\\\",\\\"is_error\\\":false,\\\"result\\\":\\\"EPIC_COMPLETE\\\"}'; }\nextract_text() { cat; }\n"
	cmd := exec.Command("bash", "-c", stub+dispatch+"\nCA_BACKEND=p; AGENT_HANDLE=''; agent_dispatch \"$1/log\" \"$1/trace\" model prompt; wait \"$AGENT_HANDLE\"", "probe", filepath.Dir(calls))
	cmd.Env = append(os.Environ(), "CALLS="+calls)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("foreground dispatch: %v\n%s", err, out)
	}
	got, err := os.ReadFile(calls)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(got), "--bg") {
		t.Fatalf("foreground dispatch invoked --bg: %s", got)
	}
	if !strings.Contains(string(got), "-p prompt") {
		t.Fatalf("foreground dispatch did not use Claude foreground prompt mode: %s", got)
	}
}

func TestGeneratedBackgroundDetectorRequiresTerminalState(t *testing.T) {
	script := generateLoopScript(loopGenerateOptions{backend: "bg", backendExplicit: true, model: "claude-sonnet-4-20250514"})
	start := strings.Index(script, "detect_bg_marker() {")
	end := strings.Index(script[start:], "\n}\n\n# agent_stop")
	if start < 0 || end < 0 {
		t.Fatal("generated background detector missing")
	}
	detector := script[start : start+end+2]
	for _, tc := range []struct{ name, state, want string }{
		{"terminal success", `{"state":"done","inFlight":{"tasks":0},"output":{"result":"EPIC_COMPLETE"}}`, "complete"},
		{"prompt marker only", `{"state":"done","inFlight":{"tasks":0},"linkScanPath":"prompt-EPIC_COMPLETE"}`, "none"},
		{"failed state", `{"state":"failed","inFlight":{"tasks":0},"output":{"result":"EPIC_COMPLETE"}}`, "failed"},
		{"unfinished tasks", `{"state":"done","inFlight":{"tasks":1},"output":{"result":"EPIC_COMPLETE"}}`, "failed"},
		{"auth", `{"state":"failed","error":"authentication_failed","inFlight":{"tasks":0},"output":{"result":"EPIC_COMPLETE"}}`, "auth_failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := filepath.Join(t.TempDir(), "state.json")
			if err := os.WriteFile(state, []byte(tc.state), 0o600); err != nil {
				t.Fatal(err)
			}
			out, err := exec.Command("bash", "-c", detector+"\ndetect_bg_marker \"$1\"", "probe", state).CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != tc.want {
				t.Fatalf("background marker = %q, error %v; want %q", out, err, tc.want)
			}
		})
	}
}

func TestGeneratedForegroundAttemptPreservesExitAndWatchdogTermination(t *testing.T) {
	script := generateLoopScript(loopGenerateOptions{backend: "p", backendExplicit: true, model: "claude-sonnet-4-20250514"})
	start := strings.Index(script, "# p backend: block until the streaming subshell exits")
	end := strings.Index(script[start:], "\n    else\n      # bg backend: poll")
	if start < 0 || end < 0 {
		t.Fatal("generated script did not contain foreground wait/watchdog branch")
	}
	branch := script[start : start+end]
	for _, tc := range []struct {
		name, memoryLog, childExit, wantCode, wantTerminated string
	}{
		{name: "nonzero child", childExit: "23", wantCode: "23", wantTerminated: "false"},
		{name: "watchdog killed child after apparent marker", memoryLog: "WATCHDOG: memory limit\n", childExit: "0", wantCode: "0", wantTerminated: "true"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			work := t.TempDir()
			memLog := filepath.Join(work, "memory.log")
			trace := filepath.Join(work, "trace.jsonl")
			log := filepath.Join(work, "run.log")
			if err := os.WriteFile(memLog, []byte(tc.memoryLog), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(trace, []byte(`{"type":"result","subtype":"success","is_error":false,"result":"EPIC_COMPLETE"}`+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			// Execute the actual generated foreground branch with only its watchdog
			// and logging dependencies stubbed; the process whose status is waited
			// on is a real shell child.
			setup := `log() { :; }; start_memory_watchdog() { :; }; start_stale_watchdog() { :; }; stop_stale_watchdog() { :; }; stop_memory_watchdog() { :; }; cleanup_orphans() { :; }
` + `CA_BACKEND=p; MEM_LOG="$1"; TRACEFILE="$2"; LOGFILE="$3"; (exit "$4") & AGENT_HANDLE=$!; if [ "$CA_BACKEND" = "p" ]; then` + "\n"
			cmd := exec.Command("bash", "-c", setup+branch+`fi
printf '%s|%s\n' "${AGENT_EXIT_CODE:-missing}" "${AGENT_TERMINATED:-missing}"`, "probe", memLog, trace, log, tc.childExit)
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("generated foreground branch: %v\n%s", err, out)
			}
			want := tc.wantCode + "|" + tc.wantTerminated
			if got := strings.TrimSpace(string(out)); got != want {
				t.Fatalf("exit/termination = %q; want %q", got, want)
			}
		})
	}
}
