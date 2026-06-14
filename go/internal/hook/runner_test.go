package hook

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// TestRunHook_PhaseGuard_GooseStrReplaceBlocked pipes a Goose str_replace tool
// call through `ca hooks run phase-guard` and asserts the guarded payload is
// emitted when an out-of-phase plan state is active (FIX-1, runner level).
func TestRunHook_PhaseGuard_GooseStrReplaceBlocked(t *testing.T) {
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"tool_name":"str_replace","tool_input":{"path":"x.go"}}`))
	if code := RunHook("phase-guard", stdin, &out); code != 0 {
		t.Fatalf("phase-guard exit code = %d, want 0", code)
	}
	if !strings.Contains(out.String(), "PHASE GUARD") {
		t.Errorf("expected PHASE GUARD payload for str_replace, got: %s", out.String())
	}
}

// TestRunHook_PhaseGuard_RealGoosePreToolUseStdin pipes the exact PreToolUse
// stdin a real Goose run sends (event, session_id, tool_name
// developer__text_editor, tool_input, working_dir) through `ca hooks run
// phase-guard` and asserts the guarded payload fires out-of-phase. This pins the
// verified Goose stdin schema: the parser keys on tool_name/tool_input, which
// Goose populates, so this passes immediately and guards against schema drift.
func TestRunHook_PhaseGuard_RealGoosePreToolUseStdin(t *testing.T) {
	dir := t.TempDir()
	writePhaseState(t, dir, PhaseState{
		CookitActive: true,
		EpicID:       "test",
		CurrentPhase: "work",
		PhaseIndex:   3,
		SkillsRead:   []string{},
		GatesPassed:  []string{},
		StartedAt:    time.Now().Format(time.RFC3339),
	})
	t.Setenv("COMPOUND_AGENT_ROOT", dir)

	var out bytes.Buffer
	payload := `{"event":"PreToolUse","session_id":"abc123","tool_name":"developer__text_editor","tool_input":{"command":"write","path":"x.go","file_text":"package x"},"working_dir":"` + dir + `"}`
	stdin := io.NopCloser(strings.NewReader(payload))
	if code := RunHook("phase-guard", stdin, &out); code != 0 {
		t.Fatalf("phase-guard exit code = %d, want 0", code)
	}
	if !strings.Contains(out.String(), "PHASE GUARD") {
		t.Errorf("expected PHASE GUARD payload for developer__text_editor, got: %s", out.String())
	}
}

func TestRunHook_UnknownHook(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader("{}"))
	exitCode := RunHook("unknown-hook", stdin, &out)
	if exitCode != 1 {
		t.Errorf("got exit code %d, want 1", exitCode)
	}
	var m map[string]interface{}
	json.Unmarshal(out.Bytes(), &m)
	if _, ok := m["error"]; !ok {
		t.Error("expected error field in output")
	}
}

func TestRunHook_EmptyHookName(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader("{}"))
	exitCode := RunHook("", stdin, &out)
	if exitCode != 1 {
		t.Errorf("got exit code %d, want 1", exitCode)
	}
}

func TestRunHook_PreCommit(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader("{}"))
	exitCode := RunHook("pre-commit", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
	// pre-commit is a git hook — must output plain text, not JSON.
	output := out.String()
	if !strings.Contains(output, "LESSON CAPTURE CHECKPOINT") {
		t.Error("expected plain text checkpoint message")
	}
	// Verify it's NOT JSON (git hooks display stdout as-is to the terminal).
	var m map[string]interface{}
	if err := json.Unmarshal(out.Bytes(), &m); err == nil {
		t.Error("pre-commit output must be plain text, not JSON")
	}
}

func TestRunHook_UserPrompt(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"prompt":"actually fix this"}`))
	exitCode := RunHook("user-prompt", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
	var m map[string]interface{}
	json.Unmarshal(out.Bytes(), &m)
	if m["hookSpecificOutput"] == nil {
		t.Error("expected hookSpecificOutput for correction prompt")
	}
}

func TestRunHook_UserPromptNoMatch(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"prompt":"hello"}`))
	exitCode := RunHook("user-prompt", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
	var m map[string]interface{}
	json.Unmarshal(out.Bytes(), &m)
	if m["hookSpecificOutput"] != nil {
		t.Error("hello should not trigger any output")
	}
}

func TestRunHook_PostToolSuccess(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{}`))
	exitCode := RunHook("post-tool-success", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
	if strings.TrimSpace(out.String()) != "{}" {
		t.Errorf("expected empty JSON object, got %q", out.String())
	}
}

func TestRunHook_InvalidJSON(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader("not json"))
	exitCode := RunHook("user-prompt", stdin, &out)
	// Should not crash, should output {} on error
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0 (graceful error)", exitCode)
	}
	if strings.TrimSpace(out.String()) != "{}" {
		t.Errorf("expected empty JSON on error, got %q", out.String())
	}
}

func TestRunHook_AliasPostRead(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"tool_name":"Read","tool_input":{"file_path":"test.go"}}`))
	exitCode := RunHook("post-read", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
}

func TestRunHook_AliasStopAudit(t *testing.T) {
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{}`))
	exitCode := RunHook("stop-audit", stdin, &out)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}
}

func TestRunHook_TelemetryLogged(t *testing.T) {
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"prompt":"hello"}`))

	exitCode := RunHookWithTelemetry("user-prompt", stdin, &out, db)
	if exitCode != 0 {
		t.Errorf("got exit code %d, want 0", exitCode)
	}

	// Verify telemetry event was logged
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry WHERE hook_name = 'user-prompt'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Errorf("telemetry events = %d, want 1", count)
	}

	// Verify duration was recorded
	var durationMs int64
	if err := db.QueryRow("SELECT duration_ms FROM telemetry WHERE hook_name = 'user-prompt'").Scan(&durationMs); err != nil {
		t.Fatal(err)
	}
	if durationMs < 0 {
		t.Errorf("duration_ms = %d, want >= 0", durationMs)
	}
}

func TestRunHook_TelemetryOutcome(t *testing.T) {
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Unknown hook should record error outcome
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{}`))
	RunHookWithTelemetry("unknown-hook", stdin, &out, db)

	var success int
	if err := db.QueryRow("SELECT success FROM telemetry WHERE hook_name = 'unknown-hook'").Scan(&success); err != nil {
		t.Fatal(err)
	}
	if success != 0 {
		t.Errorf("success = %d, want 0 for unknown hook", success)
	}
}

func TestRunHookWithTelemetry_ParseErrorLogsErrorOutcome(t *testing.T) {
	t.Parallel()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Send invalid JSON to user-prompt hook
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader("not valid json"))
	code := RunHookWithTelemetry("user-prompt", stdin, &out, db)

	// Exit code should still be 0 (graceful degradation for Claude Code)
	if code != 0 {
		t.Errorf("got exit code %d, want 0 (graceful degradation)", code)
	}

	// But telemetry outcome should be error, not success
	var success int
	if err := db.QueryRow("SELECT success FROM telemetry WHERE hook_name = 'user-prompt'").Scan(&success); err != nil {
		t.Fatal(err)
	}
	if success != 0 {
		t.Errorf("parse failure should log error outcome (success=0), got success=%d", success)
	}
}

func TestRunHookWithTelemetry_ValidInputLogsSuccess(t *testing.T) {
	t.Parallel()
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Send valid JSON to user-prompt hook
	var out bytes.Buffer
	stdin := io.NopCloser(strings.NewReader(`{"prompt":"hello"}`))
	RunHookWithTelemetry("user-prompt", stdin, &out, db)

	// Valid input should log success outcome
	var success int
	if err := db.QueryRow("SELECT success FROM telemetry WHERE hook_name = 'user-prompt'").Scan(&success); err != nil {
		t.Fatal(err)
	}
	if success != 1 {
		t.Errorf("valid input should log success outcome (success=1), got success=%d", success)
	}
}

func TestRunHook_AllHooksLogTelemetry(t *testing.T) {
	hooks := []struct {
		name  string
		stdin string
	}{
		{"user-prompt", `{"prompt":"test"}`},
		{"post-tool-failure", `{"tool_name":"Bash","tool_input":{},"tool_output":"error"}`},
		{"post-tool-success", `{}`},
		{"phase-guard", `{"tool_name":"Read","tool_input":{}}`},
		{"read-tracker", `{"tool_name":"Read","tool_input":{"file_path":"test.go"}}`},
		{"stop-audit", `{}`},
		{"pre-commit", `{}`},
	}

	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, h := range hooks {
		var out bytes.Buffer
		stdin := io.NopCloser(strings.NewReader(h.stdin))
		RunHookWithTelemetry(h.name, stdin, &out, db)
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM telemetry").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != len(hooks) {
		t.Errorf("telemetry events = %d, want %d", count, len(hooks))
	}
}
