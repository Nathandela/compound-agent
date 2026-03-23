package embed

import (
	"fmt"
	"io"
	"net/http"
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

// LockPath returns the lock file path for a socket path.
func LockPath(socketPath string) string {
	return socketPath + ".lock"
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
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}

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
	if err := syscall.Flock(int(lockFile.Fd()), syscall.LOCK_EX); err != nil {
		return nil, fmt.Errorf("acquire lock: %w", err)
	}
	defer func() { _ = syscall.Flock(int(lockFile.Fd()), syscall.LOCK_UN) }()

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

// findDaemonBinary looks for the ca-embed binary near the Go binary or in PATH.
func findDaemonBinary() (string, error) {
	self, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(self), daemonBinary)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		candidate := filepath.Join(dir, daemonBinary)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("%s not found in PATH or next to binary", daemonBinary)
}

// FindModelFiles searches known locations for the ONNX model and tokenizer.
// Returns empty strings if not found.
func FindModelFiles(repoRoot string) (modelPath, tokenizerPath string) {
	candidates := []struct {
		model     string
		tokenizer string
	}{
		// Location 1: .claude/.cache/model (after download-model) — preferred
		{filepath.Join(repoRoot, ".claude", ".cache", "model", "model_quantized.onnx"), filepath.Join(repoRoot, ".claude", ".cache", "model", "tokenizer.json")},
		// Location 2: Next to the Go binary
		{findNextToBinary("model_quantized.onnx"), findNextToBinary("tokenizer.json")},
	}

	// Location 3: HuggingFace transformers cache — npm/yarn (flat node_modules)
	hfDirect := filepath.Join(repoRoot, "node_modules",
		"@huggingface", "transformers", ".cache",
		"nomic-ai", "nomic-embed-text-v1.5")
	candidates = append(candidates, struct {
		model     string
		tokenizer string
	}{filepath.Join(hfDirect, "onnx", "model_quantized.onnx"), filepath.Join(hfDirect, "tokenizer.json")})

	// Location 4: HuggingFace transformers cache — pnpm (hoisted, any version)
	hfPattern := filepath.Join(repoRoot, "node_modules", ".pnpm",
		"@huggingface+transformers@*", "node_modules",
		"@huggingface", "transformers", ".cache",
		"nomic-ai", "nomic-embed-text-v1.5")
	if matches, err := filepath.Glob(hfPattern); err == nil && len(matches) > 0 {
		hfBase := matches[len(matches)-1] // Use latest version (sorted lexicographically)
		candidates = append(candidates, struct {
			model     string
			tokenizer string
		}{filepath.Join(hfBase, "onnx", "model_quantized.onnx"), filepath.Join(hfBase, "tokenizer.json")})
	}

	for _, c := range candidates {
		if c.model == "" || c.tokenizer == "" {
			continue
		}
		if _, err := os.Stat(c.model); err == nil {
			if _, err := os.Stat(c.tokenizer); err == nil {
				return c.model, c.tokenizer
			}
		}
	}
	return "", ""
}

// findNextToBinary returns a path next to the current executable, or empty string.
func findNextToBinary(filename string) string {
	self, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(self), filename)
}

// ModelDownloadDir returns the directory where model files are downloaded.
func ModelDownloadDir(repoRoot string) string {
	return filepath.Join(repoRoot, ".claude", ".cache", "model")
}

// HuggingFace model URLs for nomic-embed-text-v1.5.
const (
	hfModelURL     = "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/onnx/model_quantized.onnx"
	hfTokenizerURL = "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/tokenizer.json"
)

// DownloadResult holds the result of a model download.
type DownloadResult struct {
	ModelPath     string
	TokenizerPath string
	AlreadyExists bool
}

// DownloadModel downloads the ONNX model and tokenizer to the cache directory.
// Returns immediately if files already exist.
func DownloadModel(repoRoot string, progress func(string)) (*DownloadResult, error) {
	dir := ModelDownloadDir(repoRoot)
	modelPath := filepath.Join(dir, "model_quantized.onnx")
	tokenizerPath := filepath.Join(dir, "tokenizer.json")

	// Check if already downloaded
	_, modelErr := os.Stat(modelPath)
	_, tokErr := os.Stat(tokenizerPath)
	if modelErr == nil && tokErr == nil {
		return &DownloadResult{
			ModelPath:     modelPath,
			TokenizerPath: tokenizerPath,
			AlreadyExists: true,
		}, nil
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create model dir: %w", err)
	}

	// Download model
	if progress != nil {
		progress("Downloading model_quantized.onnx...")
	}
	if err := downloadFile(hfModelURL, modelPath); err != nil {
		return nil, fmt.Errorf("download model: %w", err)
	}

	// Download tokenizer
	if progress != nil {
		progress("Downloading tokenizer.json...")
	}
	if err := downloadFile(hfTokenizerURL, tokenizerPath); err != nil {
		os.Remove(modelPath) // Clean up partial download
		return nil, fmt.Errorf("download tokenizer: %w", err)
	}

	return &DownloadResult{
		ModelPath:     modelPath,
		TokenizerPath: tokenizerPath,
	}, nil
}

// httpClient is used for model downloads with a 10-minute timeout.
// CheckRedirect rejects redirects to non-HTTPS URLs to prevent downgrade attacks.
var httpClient = &http.Client{
	Timeout: 10 * time.Minute,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Scheme != "https" {
			return fmt.Errorf("refusing redirect to non-HTTPS URL: %s", req.URL)
		}
		if len(via) >= 10 {
			return fmt.Errorf("too many redirects")
		}
		return nil
	},
}

// downloadFile downloads a URL to a local file path.
func downloadFile(url, destPath string) error {
	resp, err := httpClient.Get(url)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}

	f, err := os.CreateTemp(filepath.Dir(destPath), filepath.Base(destPath)+".tmp.*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := f.Name()

	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write %s: %w", tmpPath, err)
	}

	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return err
	}
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
