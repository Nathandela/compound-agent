package hook

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

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
