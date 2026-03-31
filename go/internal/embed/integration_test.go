//go:build integration

package embed

import (
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// findRepoRoot walks up from cwd to find the repo root (contains rust/embed-daemon).
func findRepoRoot() string {
	if root := os.Getenv("CA_REPO_ROOT"); root != "" {
		return root
	}
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "rust", "embed-daemon")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// testDaemonPaths resolves paths for the Rust daemon binary and model files.
// Skips the test if any required file is missing.
func testDaemonPaths(t *testing.T) (daemonBin, modelPath, tokenizerPath string) {
	t.Helper()

	repoRoot := findRepoRoot()
	if repoRoot == "" {
		t.Skip("could not locate repo root")
		return
	}

	daemonBin = filepath.Join(repoRoot, "rust", "embed-daemon", "target", "release", "ca-embed")
	if _, err := os.Stat(daemonBin); err != nil {
		t.Skipf("daemon binary not found at %s (run: cd rust/embed-daemon && cargo build --release)", daemonBin)
	}

	// Look for model files in node_modules cache
	cacheBase := filepath.Join(repoRoot, "node_modules", ".pnpm",
		"@huggingface+transformers@3.8.1", "node_modules",
		"@huggingface", "transformers", ".cache",
		"nomic-ai", "nomic-embed-text-v1.5")

	modelPath = filepath.Join(cacheBase, "onnx", "model_quantized.onnx")
	if _, err := os.Stat(modelPath); err != nil {
		t.Skipf("ONNX model not found at %s", modelPath)
	}

	tokenizerPath = filepath.Join(cacheBase, "tokenizer.json")
	if _, err := os.Stat(tokenizerPath); err != nil {
		t.Skipf("tokenizer not found at %s", tokenizerPath)
	}

	return daemonBin, modelPath, tokenizerPath
}

// startTestDaemon starts the real Rust embed daemon for integration testing.
// Returns socket path, a connected client, and cleanup function.
func startTestDaemon(t *testing.T) (string, *Client, func()) {
	t.Helper()

	daemonBin, modelPath, tokenizerPath := testDaemonPaths(t)

	// Use /tmp for socket to avoid path length issues on macOS
	dir, err := os.MkdirTemp("/tmp", "embed-integ-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	sockPath := filepath.Join(dir, "d.sock")

	// Start daemon with short idle timeout for test cleanup
	cmd := exec.Command(daemonBin, sockPath, modelPath, tokenizerPath)
	cmd.Env = append(os.Environ(), "CA_EMBED_IDLE_TIMEOUT=30")
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		os.RemoveAll(dir)
		t.Fatalf("start daemon: %v", err)
	}

	// Wait for daemon to become ready
	var client *Client
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		c, err := NewClient(sockPath, 500*time.Millisecond)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		resp, err := c.Health()
		if err != nil {
			c.Close()
			time.Sleep(100 * time.Millisecond)
			continue
		}
		if resp.Status == "ok" {
			client = c
			break
		}
		c.Close()
		time.Sleep(100 * time.Millisecond)
	}
	if client == nil {
		cmd.Process.Kill()
		cmd.Wait()
		os.RemoveAll(dir)
		t.Fatalf("daemon did not become ready within 10s")
	}

	cleanup := func() {
		// Send shutdown
		client.Shutdown()
		client.Close()
		cmd.Wait()
		os.RemoveAll(dir)
	}

	return sockPath, client, cleanup
}

func cosineSim(a, b []float64) float64 {
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// TestIntegration_Health verifies the daemon responds to health checks.
func TestIntegration_Health(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	resp, err := client.Health()
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %v, want ok", resp.Status)
	}
	if resp.Model != "nomic-embed-text-v1.5" {
		t.Errorf("model = %v, want nomic-embed-text-v1.5", resp.Model)
	}
}

// TestIntegration_EmbedSingle verifies single-text embedding produces a 768-dim L2-normalized vector.
func TestIntegration_EmbedSingle(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	resp, err := client.Embed([]string{"search_query: hello world"})
	if err != nil {
		t.Fatalf("embed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("embed error: %v", resp.Error)
	}
	if len(resp.Vectors) != 1 {
		t.Fatalf("vectors len = %d, want 1", len(resp.Vectors))
	}

	vec := resp.Vectors[0]
	// nomic-embed-text-v1.5 produces 768-dim vectors
	if len(vec) != 768 {
		t.Errorf("vector dim = %d, want 768", len(vec))
	}

	// L2-normalized vector should have magnitude ~1.0
	var mag float64
	for _, v := range vec {
		mag += v * v
	}
	mag = math.Sqrt(mag)
	if math.Abs(mag-1.0) > 0.001 {
		t.Errorf("vector magnitude = %f, want ~1.0", mag)
	}
}

// TestIntegration_EmbedBatch verifies batch embedding with multiple texts.
func TestIntegration_EmbedBatch(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	texts := []string{
		"search_query: machine learning",
		"search_query: deep learning neural networks",
		"search_query: cooking recipes for pasta",
	}
	resp, err := client.Embed(texts)
	if err != nil {
		t.Fatalf("embed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("embed error: %v", resp.Error)
	}
	if len(resp.Vectors) != 3 {
		t.Fatalf("vectors len = %d, want 3", len(resp.Vectors))
	}

	// ML-related texts should be more similar to each other than to cooking
	simML := cosineSim(resp.Vectors[0], resp.Vectors[1])
	simCook0 := cosineSim(resp.Vectors[0], resp.Vectors[2])
	simCook1 := cosineSim(resp.Vectors[1], resp.Vectors[2])

	if simML <= simCook0 || simML <= simCook1 {
		t.Errorf("ML texts should be more similar: sim(ml,dl)=%.4f, sim(ml,cook)=%.4f, sim(dl,cook)=%.4f",
			simML, simCook0, simCook1)
	}
}

// TestIntegration_VectorDeterminism verifies the same input produces the same output.
func TestIntegration_VectorDeterminism(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	text := "search_query: deterministic embedding test"

	resp1, err := client.Embed([]string{text})
	if err != nil {
		t.Fatalf("embed 1: %v", err)
	}
	resp2, err := client.Embed([]string{text})
	if err != nil {
		t.Fatalf("embed 2: %v", err)
	}

	sim := cosineSim(resp1.Vectors[0], resp2.Vectors[0])
	if sim < 0.999999 {
		t.Errorf("same input should produce identical vectors, cosine_sim = %.6f", sim)
	}
}

// TestIntegration_VectorCompatibility verifies vectors match the TypeScript reference implementation.
// Uses reference vectors generated by the TS nomic-embed-text-v1.5 implementation.
func TestIntegration_VectorCompatibility(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	// Load reference vectors if available
	refPath := filepath.Join(findRepoRoot(), "test", "fixtures", "reference-vectors.json")
	refData, err := os.ReadFile(refPath)
	if err != nil {
		// Generate reference vectors inline with known test texts
		// and verify self-consistency at minimum
		t.Logf("No reference vectors file at %s, running self-consistency check", refPath)

		texts := []string{
			"search_query: When composing bash template functions",
			"search_query: Use property-based testing for edge cases",
		}
		resp, err := client.Embed(texts)
		if err != nil {
			t.Fatalf("embed: %v", err)
		}
		if len(resp.Vectors) != 2 {
			t.Fatalf("vectors len = %d, want 2", len(resp.Vectors))
		}

		// Verify vectors are distinct (different texts produce different embeddings)
		sim := cosineSim(resp.Vectors[0], resp.Vectors[1])
		if sim > 0.999 {
			t.Errorf("different texts should produce different vectors, cosine_sim = %.6f", sim)
		}
		if sim < 0.3 {
			t.Errorf("related texts should have some similarity, cosine_sim = %.6f", sim)
		}
		return
	}

	// Parse reference vectors
	var refs []struct {
		Text   string    `json:"text"`
		Vector []float64 `json:"vector"`
	}
	if err := json.Unmarshal(refData, &refs); err != nil {
		t.Fatalf("parse reference vectors: %v", err)
	}

	for _, ref := range refs {
		resp, err := client.Embed([]string{ref.Text})
		if err != nil {
			t.Fatalf("embed %q: %v", ref.Text, err)
		}
		if resp.IsError() {
			t.Fatalf("embed error for %q: %v", ref.Text, resp.Error)
		}

		sim := cosineSim(resp.Vectors[0], ref.Vector)
		if sim < 0.999 {
			t.Errorf("vector compatibility for %q: cosine_sim = %.6f, want > 0.999", ref.Text, sim)
		}
	}
}

// TestIntegration_Concurrent verifies concurrent embed requests work correctly.
func TestIntegration_Concurrent(t *testing.T) {
	sockPath, _, cleanup := startTestDaemon(t)
	defer cleanup()

	var wg sync.WaitGroup
	errs := make(chan error, 4)

	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			// Each goroutine gets its own connection
			c, err := NewClient(sockPath, 5*time.Second)
			if err != nil {
				errs <- err
				return
			}
			defer c.Close()

			texts := []string{"search_query: concurrent test " + string(rune('A'+id))}
			resp, err := c.Embed(texts)
			if err != nil {
				errs <- err
				return
			}
			if resp.IsError() {
				errs <- &embedError{resp.Error}
				return
			}
			if len(resp.Vectors) != 1 || len(resp.Vectors[0]) != 768 {
				errs <- &embedError{"unexpected vector dimensions"}
				return
			}
		}(i)
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent request failed: %v", err)
	}
}

type embedError struct {
	msg string
}

func (e *embedError) Error() string { return e.msg }

// TestIntegration_Shutdown verifies the daemon shuts down cleanly.
func TestIntegration_Shutdown(t *testing.T) {
	daemonBin, modelPath, tokenizerPath := testDaemonPaths(t)

	dir, err := os.MkdirTemp("/tmp", "embed-integ-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(dir)
	sockPath := filepath.Join(dir, "d.sock")

	cmd := exec.Command(daemonBin, sockPath, modelPath, tokenizerPath)
	cmd.Env = append(os.Environ(), "CA_EMBED_IDLE_TIMEOUT=60")
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start daemon: %v", err)
	}

	// Wait for ready
	var client *Client
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		c, err := NewClient(sockPath, 500*time.Millisecond)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		resp, err := c.Health()
		if err != nil {
			c.Close()
			time.Sleep(100 * time.Millisecond)
			continue
		}
		if resp.Status == "ok" {
			client = c
			break
		}
		c.Close()
		time.Sleep(100 * time.Millisecond)
	}
	if client == nil {
		cmd.Process.Kill()
		cmd.Wait()
		t.Fatalf("daemon not ready")
	}

	// Send shutdown
	resp, err := client.Shutdown()
	if err != nil {
		t.Fatalf("shutdown request: %v", err)
	}
	if resp.Status != "shutting_down" {
		t.Errorf("status = %v, want shutting_down", resp.Status)
	}
	client.Close()

	// Wait for process to exit
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		if err != nil {
			t.Logf("daemon exit: %v (expected for clean shutdown)", err)
		}
	case <-time.After(5 * time.Second):
		cmd.Process.Kill()
		t.Error("daemon did not exit within 5s after shutdown")
	}

	// Socket and PID file should be cleaned up
	time.Sleep(100 * time.Millisecond)
	if _, err := os.Stat(sockPath); !os.IsNotExist(err) {
		t.Error("socket file should be removed after shutdown")
	}
}

// TestIntegration_EmptyBatch verifies empty batch returns empty vectors.
func TestIntegration_EmptyBatch(t *testing.T) {
	_, client, cleanup := startTestDaemon(t)
	defer cleanup()

	resp, err := client.Embed([]string{})
	if err != nil {
		t.Fatalf("embed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("embed error: %v", resp.Error)
	}
	if len(resp.Vectors) != 0 {
		t.Errorf("vectors len = %d, want 0", len(resp.Vectors))
	}
}

// TestIntegration_ReconnectAfterClose verifies a new client can connect after the first closes.
func TestIntegration_ReconnectAfterClose(t *testing.T) {
	sockPath, client, cleanup := startTestDaemon(t)
	defer cleanup()

	// First health check
	resp, err := client.Health()
	if err != nil {
		t.Fatalf("first health: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("first status = %v, want ok", resp.Status)
	}

	// Close first client connection (not daemon)
	client.Close()

	// Open a new connection to the same daemon
	client2, err := NewClient(sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("reconnect: %v", err)
	}

	resp, err = client2.Health()
	if err != nil {
		t.Fatalf("second health: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("second status = %v, want ok", resp.Status)
	}

	// Shutdown daemon via the new connection
	client2.Shutdown()
	client2.Close()
}
