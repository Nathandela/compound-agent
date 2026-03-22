package embed

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSocketPath(t *testing.T) {
	dir := t.TempDir()
	got := SocketPath(dir)
	want := filepath.Join(dir, ".claude", ".cache", "embed-daemon.sock")
	if got != want {
		t.Errorf("SocketPath = %v, want %v", got, want)
	}
}

func TestPIDPath(t *testing.T) {
	sock := "/tmp/test.sock"
	got := PIDPath(sock)
	want := "/tmp/test.sock.pid"
	if got != want {
		t.Errorf("PIDPath = %v, want %v", got, want)
	}
}

func TestIsDaemonRunning_NoPIDFile(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	if IsDaemonRunning(pid) {
		t.Error("expected false when PID file doesn't exist")
	}
}

func TestIsDaemonRunning_StalePID(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	// Write a PID that almost certainly doesn't exist
	os.WriteFile(pid, []byte("9999999"), 0644)
	if IsDaemonRunning(pid) {
		t.Error("expected false for non-existent PID")
	}
}

func TestIsDaemonRunning_CurrentProcess(t *testing.T) {
	dir := t.TempDir()
	pid := filepath.Join(dir, "test.pid")
	// Use our own PID -- we know it's running
	os.WriteFile(pid, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	if !IsDaemonRunning(pid) {
		t.Error("expected true for current process PID")
	}
}

func TestDaemonBinaryName(t *testing.T) {
	name := DaemonBinaryName()
	if name != "ca-embed" {
		t.Errorf("DaemonBinaryName = %v, want ca-embed", name)
	}
}

func TestLockPath(t *testing.T) {
	sock := "/tmp/test.sock"
	got := LockPath(sock)
	want := "/tmp/test.sock.lock"
	if got != want {
		t.Errorf("LockPath = %v, want %v", got, want)
	}
}

func TestFindModelFiles_NotFound(t *testing.T) {
	dir := t.TempDir()
	model, tokenizer := FindModelFiles(dir)
	if model != "" || tokenizer != "" {
		t.Errorf("expected empty paths, got model=%s tokenizer=%s", model, tokenizer)
	}
}

func TestModelDownloadDir(t *testing.T) {
	dir := t.TempDir()
	got := ModelDownloadDir(dir)
	want := filepath.Join(dir, ".claude", ".cache", "model")
	if got != want {
		t.Errorf("ModelDownloadDir = %v, want %v", got, want)
	}
}

func TestHTTPClientRejectsHTTPRedirect(t *testing.T) {
	// Server that redirects to a plain HTTP URL
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://evil.example.com/payload", http.StatusFound)
	}))
	defer srv.Close()

	// Use the TLS test server's client for trusted certs, but swap in our CheckRedirect
	client := srv.Client()
	client.CheckRedirect = httpClient.CheckRedirect

	_, err := client.Get(srv.URL + "/model")
	if err == nil {
		t.Fatal("expected error when redirected to HTTP, got nil")
	}
	// The error should mention refusing non-HTTPS
	if got := err.Error(); !contains(got, "non-HTTPS") {
		t.Errorf("error = %q, want it to mention non-HTTPS redirect", got)
	}
}

func TestHTTPClientAllowsHTTPSRedirect(t *testing.T) {
	// Final destination server
	dest := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer dest.Close()

	// Redirecting server that points to the destination (both HTTPS)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, dest.URL+"/final", http.StatusFound)
	}))
	defer srv.Close()

	// We need a client that trusts both test servers' certs.
	// Use srv's client and add our CheckRedirect. Since httptest.NewTLSServer
	// uses the same CA in a test, this works for same-process servers.
	client := srv.Client()
	client.CheckRedirect = httpClient.CheckRedirect

	resp, err := client.Get(srv.URL + "/start")
	if err != nil {
		t.Fatalf("expected HTTPS redirect to succeed, got error: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

// contains checks if substr is in s (avoids importing strings in test).
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestFindModelFiles_InCacheDir(t *testing.T) {
	dir := t.TempDir()
	modelDir := filepath.Join(dir, ".claude", ".cache", "model")
	os.MkdirAll(modelDir, 0755)
	os.WriteFile(filepath.Join(modelDir, "model_quantized.onnx"), []byte("fake"), 0644)
	os.WriteFile(filepath.Join(modelDir, "tokenizer.json"), []byte("fake"), 0644)

	model, tokenizer := FindModelFiles(dir)
	if model == "" || tokenizer == "" {
		t.Errorf("expected model files found, got model=%s tokenizer=%s", model, tokenizer)
	}
}
