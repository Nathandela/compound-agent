//go:build windows

package storage

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// TestFlockExclusive_AcquireAndRelease verifies that flockExclusive and
// flockUnlock succeed without error on a normal temp file.
func TestFlockExclusive_AcquireAndRelease(t *testing.T) {
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

// TestFlockExclusive_BlocksConcurrent verifies that LockFileEx actually blocks
// a second caller rather than being a no-op. The second goroutine must not
// complete until the first holder calls flockUnlock.
func TestFlockExclusive_BlocksConcurrent(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	lockPath := filepath.Join(dir, "shared.lock")
	f1, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f1.Close()

	// Acquire the lock in the main goroutine.
	if err := flockExclusive(f1); err != nil {
		t.Fatalf("first flockExclusive: %v", err)
	}

	// Open a second handle to the same file from the competing goroutine.
	f2, err := os.OpenFile(lockPath, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f2.Close()

	acquired := make(chan struct{})
	var mu sync.Mutex
	blocked := true

	go func() {
		// This call blocks until f1's lock is released.
		if err := flockExclusive(f2); err != nil {
			return
		}
		mu.Lock()
		blocked = false
		mu.Unlock()
		close(acquired)
		_ = flockUnlock(f2)
	}()

	// Give the goroutine time to reach the blocking call.
	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	if !blocked {
		mu.Unlock()
		t.Fatal("second goroutine acquired lock while first still holds it")
	}
	mu.Unlock()

	// Release the first lock; the goroutine should now proceed.
	if err := flockUnlock(f1); err != nil {
		t.Fatalf("flockUnlock: %v", err)
	}

	select {
	case <-acquired:
		// success
	case <-time.After(5 * time.Second):
		t.Fatal("second goroutine did not acquire lock within 5s after unlock")
	}
}

// TestOpenDB_FileLockOnRebuild_Windows mirrors TestOpenDB_FileLockOnRebuild
// from sqlite_flock_test.go for Windows: after a rebuild triggered by a stale
// schema version, the lock file must be released so callers can re-acquire it.
func TestOpenDB_FileLockOnRebuild_Windows(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.sqlite")

	// Create DB with wrong version to trigger rebuild.
	db1, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = db1.Exec("PRAGMA user_version = 1")
	db1.Close()

	db2, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()

	// The lock file persists on disk but the OS lock must be released after
	// OpenDB completes. Verify by acquiring the lock ourselves.
	lockPath := dbPath + ".lock"
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if err := flockExclusive(f); err != nil {
		t.Error("flock should be released after rebuild completes, but got:", err)
	}
	_ = flockUnlock(f)
}

// TestOpenDB_ConcurrentRebuild_Windows mirrors TestOpenDB_ConcurrentRebuild
// from sqlite_flock_test.go for Windows: OpenDB must block on the lock file
// while another holder holds it, then proceed once the lock is released.
func TestOpenDB_ConcurrentRebuild_Windows(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.sqlite")

	// Create DB with wrong version to trigger rebuild.
	db1, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = db1.Exec("PRAGMA user_version = 1")
	db1.Close()

	// Hold the lock file exclusively, simulating a concurrent process.
	lockPath := dbPath + ".lock"
	lockFile, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if err := flockExclusive(lockFile); err != nil {
		t.Fatal(err)
	}

	// OpenDB should block until the lock is released.
	done := make(chan error, 1)
	go func() {
		db2, err := OpenDB(dbPath)
		if err != nil {
			done <- err
			return
		}
		db2.Close()
		done <- nil
	}()

	// Release lock after a short delay.
	time.Sleep(50 * time.Millisecond)
	_ = flockUnlock(lockFile)
	lockFile.Close()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("OpenDB after lock release: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("OpenDB blocked for too long after lock release")
	}
}
