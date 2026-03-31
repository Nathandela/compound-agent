//go:build windows

package embed

import "os"

// flockExclusive is a no-op on Windows; the embedding daemon uses Unix
// sockets which are unavailable on native Windows anyway.
func flockExclusive(f *os.File) error {
	return nil
}

// flockUnlock is a no-op on Windows.
func flockUnlock(f *os.File) error {
	return nil
}

// processAlive checks if a process with the given PID is still running.
// On Windows, FindProcess always succeeds, so we attempt a zero-signal
// equivalent — but since the daemon requires Unix sockets, this path
// is effectively unreachable on native Windows.
func processAlive(proc *os.Process) bool {
	// On Windows, os.FindProcess always succeeds. We release the handle
	// immediately; the caller treats a false return as "not running".
	_ = proc.Release()
	return false
}
