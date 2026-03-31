//go:build !windows

package storage

import (
	"os"
	"syscall"
	"testing"
	"time"
)

func TestOpenDB_FileLockOnRebuild(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"

	// Create DB with wrong version to trigger rebuild
	db1, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	db1.Exec("PRAGMA user_version = 1")
	db1.Close()

	// After OpenDB completes, flock is released (file may still exist on disk)
	lockPath := dbPath + ".lock"
	db2, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()

	// With flock, the lock file persists but the OS lock is released.
	// Verify we can acquire the lock again (proving it was released).
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Error("flock should be released after rebuild completes")
	}
	syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
}

func TestOpenDB_ConcurrentRebuild(t *testing.T) {
	dir := t.TempDir()
	dbPath := dir + "/test.sqlite"

	// Create DB with wrong version
	db1, err := OpenDB(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	db1.Exec("PRAGMA user_version = 1")
	db1.Close()

	// Simulate lock held by another process using flock
	lockPath := dbPath + ".lock"
	lockFile, err := os.OpenFile(lockPath, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	// OpenDB should block until lock is released (blocking flock).
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

	// Release lock after a short delay, allowing OpenDB to proceed.
	time.Sleep(50 * time.Millisecond)
	syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN)
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
