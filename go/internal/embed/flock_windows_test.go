//go:build windows

package embed

import (
	"os"
	"os/exec"
	"testing"
	"time"
)

// TestFlockExclusive_Basic verifies that flockExclusive and flockUnlock
// succeed without error on a normal temp file.
func TestFlockExclusive_Basic(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	f, err := os.CreateTemp(dir, "flock-*.lock")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if err := flockExclusive(f); err != nil {
		t.Fatalf("flockExclusive: unexpected error: %v", err)
	}
	if err := flockUnlock(f); err != nil {
		t.Fatalf("flockUnlock: unexpected error: %v", err)
	}
}

// TestProcessAlive_CurrentProcess verifies that processAlive returns true for
// the currently running process.
func TestProcessAlive_CurrentProcess(t *testing.T) {
	t.Parallel()

	proc, err := os.FindProcess(os.Getpid())
	if err != nil {
		t.Fatalf("FindProcess(self): %v", err)
	}

	if !processAlive(proc) {
		t.Error("processAlive returned false for the current process")
	}
}

// TestProcessAlive_DeadProcess verifies that processAlive returns false after a
// process has exited. A short-lived cmd.exe child is used so the test does not
// rely on any project binary being present.
func TestProcessAlive_DeadProcess(t *testing.T) {
	t.Parallel()

	cmd := exec.Command("cmd", "/c", "exit", "0")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start cmd: %v", err)
	}
	proc := cmd.Process

	// Wait for the process to finish before querying its exit code.
	_ = cmd.Wait()

	// Allow Windows a moment to update the exit code in the kernel.
	time.Sleep(10 * time.Millisecond)

	if processAlive(proc) {
		t.Error("processAlive returned true for a process that has already exited")
	}
}

// TestProcessAlive_InvalidPID verifies that processAlive returns false for a
// PID that almost certainly does not exist.
func TestProcessAlive_InvalidPID(t *testing.T) {
	t.Parallel()

	proc, err := os.FindProcess(999999)
	if err != nil {
		t.Skipf("FindProcess(999999) failed (%v); skipping", err)
	}

	if processAlive(proc) {
		t.Error("processAlive returned true for a very unlikely PID (999999)")
	}
}
