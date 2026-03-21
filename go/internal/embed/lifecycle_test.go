package embed

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestSocketPath(t *testing.T) {
	dir := t.TempDir()
	got := SocketPath(dir)
	want := filepath.Join(dir, ".claude", ".cache", "embed-daemon.sock")
	if got != want {
		t.Errorf("SocketPath = %v, want %v", got, want)
	}
}

func TestPIDPath(t *testing.T) {
	sock := "/tmp/test.sock"
	got := PIDPath(sock)
	want := "/tmp/test.sock.pid"
	if got != want {
		t.Errorf("PIDPath = %v, want %v", got, want)
	}
}

func TestIsDaemonRunning_NoPIDFile(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	if IsDaemonRunning(pid) {
		t.Error("expected false when PID file doesn't exist")
	}
}

func TestIsDaemonRunning_StalePID(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	// Write a PID that almost certainly doesn't exist
	os.WriteFile(pid, []byte("9999999"), 0644)
	if IsDaemonRunning(pid) {
		t.Error("expected false for non-existent PID")
	}
}

func TestIsDaemonRunning_CurrentProcess(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	// Use our own PID -- we know it's running
	os.WriteFile(pid, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	if !IsDaemonRunning(pid) {
		t.Error("expected true for current process PID")
	}
}

func TestDaemonBinaryName(t *testing.T) {
	name := DaemonBinaryName()
	if name != "ca-embed" {
		t.Errorf("DaemonBinaryName = %v, want ca-embed", name)
	}
}

func TestLockPath(t *testing.T) {
	sock := "/tmp/test.sock"
	got := LockPath(sock)
	want := "/tmp/test.sock.lock"
	if got != want {
		t.Errorf("LockPath = %v, want %v", got, want)
	}
}
