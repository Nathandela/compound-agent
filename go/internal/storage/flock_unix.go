//go:build !windows

package storage

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
