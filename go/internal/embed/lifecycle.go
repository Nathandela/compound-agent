package embed

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	daemonBinary  = "ca-embed"
	coldStartWait = 2 * time.Second
	warmTimeout   = 500 * time.Millisecond
)

// SocketPath returns the embed daemon socket path for a repo root.
func SocketPath(repoRoot string) string {
	return filepath.Join(repoRoot, ".claude", ".cache", "embed-daemon.sock")
}

// PIDPath returns the PID file path for a socket path.
func PIDPath(socketPath string) string {
	return socketPath + ".pid"
}

// DaemonBinaryName returns the name of the daemon binary.
func DaemonBinaryName() string {
	return daemonBinary
}

// IsDaemonRunning checks if the daemon process identified by the PID file is alive.
func IsDaemonRunning(pidPath string) bool {
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return false
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks if process exists without sending a signal
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}

// EnsureDaemon ensures the daemon is running and returns a connected client.
// If the daemon is not running, it starts it and waits for readiness.
func EnsureDaemon(repoRoot, modelPath, tokenizerPath string) (*Client, error) {
	sockPath := SocketPath(repoRoot)
	pidPath := PIDPath(sockPath)

	// Try connecting to existing daemon first
	if !IsSocketStale(sockPath) {
		client, err := NewClient(sockPath, warmTimeout)
		if err == nil {
			resp, err := client.Health()
			if err == nil && resp.Status == "ok" {
				return client, nil
			}
			client.Close()
		}
	}

	// Clean up stale socket if present
	if _, err := os.Stat(sockPath); err == nil {
		CleanStaleSocket(sockPath)
	}

	// Ensure cache directory exists
	cacheDir := filepath.Dir(sockPath)
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("create cache dir: %w", err)
	}

	// Start daemon
	if err := startDaemon(sockPath, modelPath, tokenizerPath); err != nil {
		return nil, fmt.Errorf("start daemon: %w", err)
	}

	// Wait for daemon to become ready
	client, err := waitForReady(sockPath, coldStartWait)
	if err != nil {
		return nil, fmt.Errorf("daemon not ready: %w", err)
	}

	_ = pidPath // used by IsDaemonRunning
	return client, nil
}

// startDaemon starts the embed daemon process.
func startDaemon(socketPath, modelPath, tokenizerPath string) error {
	// Find the daemon binary
	binPath, err := findDaemonBinary()
	if err != nil {
		return err
	}

	attr := &os.ProcAttr{
		Dir: filepath.Dir(socketPath),
		Env: os.Environ(),
		Files: []*os.File{
			os.Stdin,
			nil, // stdout discarded
			os.Stderr,
		},
	}

	proc, err := os.StartProcess(binPath, []string{
		binPath, socketPath, modelPath, tokenizerPath,
	}, attr)
	if err != nil {
		return fmt.Errorf("exec %s: %w", binPath, err)
	}

	// Release -- daemon runs independently
	proc.Release()
	return nil
}

// findDaemonBinary looks for the ca-embed binary near the Go binary or in PATH.
func findDaemonBinary() (string, error) {
	// Check next to our own binary
	self, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(self), daemonBinary)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	// Check PATH
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		candidate := filepath.Join(dir, daemonBinary)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("%s not found in PATH or next to binary", daemonBinary)
}

// waitForReady polls the daemon socket until it responds to health checks.
func waitForReady(socketPath string, timeout time.Duration) (*Client, error) {
	deadline := time.Now().Add(timeout)
	interval := 50 * time.Millisecond

	for time.Now().Before(deadline) {
		client, err := NewClient(socketPath, warmTimeout)
		if err != nil {
			time.Sleep(interval)
			continue
		}
		resp, err := client.Health()
		if err != nil {
			client.Close()
			time.Sleep(interval)
			continue
		}
		if resp.Status == "ok" {
			return client, nil
		}
		client.Close()
		time.Sleep(interval)
	}

	return nil, fmt.Errorf("daemon did not become ready within %v", timeout)
}
