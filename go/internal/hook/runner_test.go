package hook

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
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
	var m map[string]interface{}
	json.Unmarshal(out.Bytes(), &m)
	if m["hook"] != "pre-commit" {
		t.Error("expected pre-commit hook output")
	}
	if m["message"] == nil {
		t.Error("expected message in pre-commit output")
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
