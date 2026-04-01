//go:build windows

package storage

import (
	"os"

	"golang.org/x/sys/windows"
)

// flockExclusive acquires a blocking exclusive lock on the given file using
// Windows LockFileEx. This prevents concurrent schema rebuild races (H3).
func flockExclusive(f *os.File) error {
	// LOCKFILE_EXCLUSIVE_LOCK = lock is exclusive.
	// Without LOCKFILE_FAIL_IMMEDIATELY, this call blocks until the lock is available.
	ol := new(windows.Overlapped)
	return windows.LockFileEx(
		windows.Handle(f.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK,
		0,          // reserved
		1,          // lock 1 byte
		0,          // high-order bytes
		ol,
	)
}

// flockUnlock releases the file lock using Windows UnlockFileEx.
func flockUnlock(f *os.File) error {
	ol := new(windows.Overlapped)
	return windows.UnlockFileEx(
		windows.Handle(f.Fd()),
		0, // reserved
		1, // unlock 1 byte
		0, // high-order bytes
		ol,
	)
}
