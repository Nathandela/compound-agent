//go:build !windows

package embed

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// EnsureDaemon ensures the daemon is running and returns a connected client.
// Uses flock to prevent concurrent daemon starts (H1).
func EnsureDaemon(repoRoot, modelPath, tokenizerPath string) (*Client, error) {
	sockPath := SocketPath(repoRoot)
	pidPath := PIDPath(sockPath)

	// Fast path: try connecting to existing daemon without locking
	if IsDaemonRunning(pidPath) {
		client, err := tryConnect(sockPath)
		if err == nil {
			return client, nil
		}
	}

	// Slow path: acquire lock, check again, start if needed (H1 mitigation)
	return ensureDaemonLocked(sockPath, modelPath, tokenizerPath)
}

// tryConnect attempts to connect and health-check an existing daemon.
func tryConnect(sockPath string) (*Client, error) {
	client, err := NewClient(sockPath, warmTimeout)
	if err != nil {
		return nil, err
	}
	resp, err := client.Health()
	if err != nil || resp.Status != "ok" {
		client.Close()
		return nil, fmt.Errorf("health check failed")
	}
	return client, nil
}

// ensureDaemonLocked acquires an exclusive flock before starting the daemon.
func ensureDaemonLocked(sockPath, modelPath, tokenizerPath string) (*Client, error) {
	cacheDir := filepath.Dir(sockPath)
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("create cache dir: %w", err)
	}

	lockFile, err := os.OpenFile(LockPath(sockPath), os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	defer lockFile.Close()

	// Exclusive lock — blocks until other processes release
	if err := flockExclusive(lockFile); err != nil {
		return nil, fmt.Errorf("acquire lock: %w", err)
	}
	defer func() { _ = flockUnlock(lockFile) }()

	// Re-check after acquiring lock — another process may have started the daemon
	if client, err := tryConnect(sockPath); err == nil {
		return client, nil
	}

	// Clean stale socket/PID files
	CleanStaleSocket(sockPath)

	if err := startDaemon(sockPath, modelPath, tokenizerPath); err != nil {
		return nil, fmt.Errorf("start daemon: %w", err)
	}

	client, err := waitForReady(sockPath, coldStartWait)
	if err != nil {
		return nil, fmt.Errorf("daemon not ready: %w", err)
	}
	return client, nil
}

// startDaemon starts the embed daemon process.
func startDaemon(socketPath, modelPath, tokenizerPath string) error {
	binPath, err := findDaemonBinary()
	if err != nil {
		return err
	}

	devNull, err := os.Open(os.DevNull)
	if err != nil {
		return fmt.Errorf("open %s: %w", os.DevNull, err)
	}
	defer devNull.Close()

	attr := &os.ProcAttr{
		Dir: filepath.Dir(socketPath),
		Env: os.Environ(),
		Files: []*os.File{
			devNull, // stdin from /dev/null
			nil,     // stdout discarded
			os.Stderr,
		},
	}

	proc, err := os.StartProcess(binPath, []string{
		binPath, socketPath, modelPath, tokenizerPath,
	}, attr)
	if err != nil {
		return fmt.Errorf("exec %s: %w", binPath, err)
	}

	_ = proc.Release()
	return nil
}

// waitForReady polls the daemon socket until it responds to health checks.
func waitForReady(socketPath string, timeout time.Duration) (*Client, error) {
	deadline := time.Now().Add(timeout)
	interval := 50 * time.Millisecond

	for time.Now().Before(deadline) {
		client, err := tryConnect(socketPath)
		if err == nil {
			return client, nil
		}
		time.Sleep(interval)
	}

	return nil, fmt.Errorf("daemon did not become ready within %v", timeout)
}
