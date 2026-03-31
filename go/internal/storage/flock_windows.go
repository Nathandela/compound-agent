//go:build windows

package storage

import "os"

// flockExclusive is a no-op on Windows; SQLite's internal locking handles
// concurrency via LockFileEx on the database file itself.
func flockExclusive(f *os.File) error {
	return nil
}

// flockUnlock is a no-op on Windows.
func flockUnlock(f *os.File) error {
	return nil
}
