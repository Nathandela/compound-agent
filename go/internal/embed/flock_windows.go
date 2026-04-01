//go:build windows

package embed

import (
	"os"

	"golang.org/x/sys/windows"
)

// stillActive is the Windows exit code meaning a process has not yet exited.
const stillActive uint32 = 259

// flockExclusive acquires a blocking exclusive lock using Windows LockFileEx.
func flockExclusive(f *os.File) error {
	ol := new(windows.Overlapped)
	return windows.LockFileEx(
		windows.Handle(f.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK,
		0, 1, 0, ol,
	)
}

// flockUnlock releases the file lock using Windows UnlockFileEx.
func flockUnlock(f *os.File) error {
	ol := new(windows.Overlapped)
	return windows.UnlockFileEx(
		windows.Handle(f.Fd()),
		0, 1, 0, ol,
	)
}

// processAlive checks if a process with the given PID is still running.
// Uses OpenProcess with PROCESS_QUERY_LIMITED_INFORMATION and GetExitCodeProcess
// to determine if the process is still active.
func processAlive(proc *os.Process) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(proc.Pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)

	var exitCode uint32
	if err := windows.GetExitCodeProcess(h, &exitCode); err != nil {
		return false
	}
	return exitCode == stillActive
}
