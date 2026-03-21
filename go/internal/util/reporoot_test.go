package util

import (
	"os"
	"testing"
)

func TestGetRepoRoot_EnvOverride(t *testing.T) {
	t.Setenv("COMPOUND_AGENT_ROOT", "/custom/root")
	got := GetRepoRoot()
	if got != "/custom/root" {
		t.Errorf("got %q, want /custom/root", got)
	}
}

func TestGetRepoRoot_FallbackToCwd(t *testing.T) {
	t.Setenv("COMPOUND_AGENT_ROOT", "")
	got := GetRepoRoot()
	cwd, _ := os.Getwd()
	if got != cwd {
		t.Errorf("got %q, want %q", got, cwd)
	}
}
