//go:build !windows

package embed

import (
	"os"
	"syscall"
)

// flockExclusive acquires a blocking exclusive flock on the given file.
func flockExclusive(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_EX)
}

// flockUnlock releases the flock on the given file.
func flockUnlock(f *os.File) error {
	return syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}

// processAlive checks if a process with the given PID is still running.
func processAlive(proc *os.Process) bool {
	return proc.Signal(syscall.Signal(0)) == nil
}
