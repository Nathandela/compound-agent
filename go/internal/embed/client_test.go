//go:build !windows

package embed

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// startMockDaemon creates a mock UDS server for testing the client.
// Returns the socket path and a cleanup function.
func startMockDaemon(t *testing.T, handler func(net.Conn)) (string, func()) {
	t.Helper()
	// Use /tmp to avoid macOS UDS path length limit (108 chars)
	dir, err := os.MkdirTemp("/tmp", "embed-test-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	sock := filepath.Join(dir, "t.sock")

	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go handler(conn)
		}
	}()

	return sock, func() { ln.Close(); os.RemoveAll(dir) }
}

// echoHandler reads JSON-lines, echoes health/embed responses.
func echoHandler(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Bytes()
		var req Request
		if err := json.Unmarshal(line, &req); err != nil {
			resp, merr := json.Marshal(Response{ID: "unknown", Error: "parse error"})
			if merr != nil {
				return
			}
			if _, werr := conn.Write(append(resp, '\n')); werr != nil {
				return
			}
			continue
		}
		var resp interface{}
		switch req.Method {
		case "health":
			resp = Response{ID: req.ID, Status: "ok", Model: "nomic-embed-text-v1.5"}
		case "embed":
			vecs := make([][]float64, len(req.Texts))
			for i := range req.Texts {
				vecs[i] = []float64{0.1, 0.2, 0.3}
			}
			resp = Response{ID: req.ID, Vectors: vecs}
		case "shutdown":
			resp = Response{ID: req.ID, Status: "shutting_down"}
		default:
			resp = Response{ID: req.ID, Error: fmt.Sprintf("unknown method: %s", req.Method)}
		}
		data, merr := json.Marshal(resp)
		if merr != nil {
			return
		}
		if _, werr := conn.Write(append(data, '\n')); werr != nil {
			return
		}
	}
}

func TestClient_Health(t *testing.T) {
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	c, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	resp, err := c.Health()
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

func TestClient_Embed(t *testing.T) {
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	c, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	texts := []string{"hello", "world"}
	resp, err := c.Embed(texts)
	if err != nil {
		t.Fatalf("embed: %v", err)
	}
	if len(resp.Vectors) != 2 {
		t.Fatalf("vectors len = %d, want 2", len(resp.Vectors))
	}
	if resp.Vectors[0][0] != 0.1 {
		t.Errorf("vectors[0][0] = %f, want 0.1", resp.Vectors[0][0])
	}
}

func TestClient_Shutdown(t *testing.T) {
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	c, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	resp, err := c.Shutdown()
	if err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if resp.Status != "shutting_down" {
		t.Errorf("status = %v, want shutting_down", resp.Status)
	}
}

func TestClient_ErrorResponse(t *testing.T) {
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	c, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	resp, err := c.Send(Request{ID: "x", Method: "bogus"})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if !resp.IsError() {
		t.Error("expected error response for unknown method")
	}
}

func TestClient_SetDeadlineErrors(t *testing.T) {
	// Verify that SetWriteDeadline and SetReadDeadline errors are propagated.
	// We do this by closing the connection before sending, which causes
	// SetWriteDeadline to fail.
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	c, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	// Close the underlying connection
	c.conn.Close()

	// Now sending should fail (SetWriteDeadline or Write will error)
	_, err = c.Health()
	if err == nil {
		t.Error("expected error after closing connection, got nil")
	}
}

func TestClient_ConnectFailure(t *testing.T) {
	_, err := NewClient("/nonexistent/path.sock", 500*time.Millisecond)
	if err == nil {
		t.Error("expected error connecting to nonexistent socket")
	}
}

func TestClient_Timeout(t *testing.T) {
	// Daemon that never responds
	sock, cleanup := startMockDaemon(t, func(conn net.Conn) {
		defer conn.Close()
		// Read but never write back
		buf := make([]byte, 4096)
		conn.Read(buf)
		time.Sleep(5 * time.Second)
	})
	defer cleanup()

	c, err := NewClient(sock, 200*time.Millisecond)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Close()

	_, err = c.Health()
	if err == nil {
		t.Error("expected timeout error")
	}
}

func TestClient_StaleSocket(t *testing.T) {
	// Use /tmp to avoid macOS UDS path length limit
	dir, err := os.MkdirTemp("/tmp", "embed-test-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(dir)
	sock := filepath.Join(dir, "stale.sock")

	// Create a socket file but don't listen on it
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	ln.Close() // Close immediately -- socket file remains

	// IsSocketStale should detect this
	stale := IsSocketStale(sock)
	if !stale {
		t.Error("expected stale socket to be detected")
	}
}

func TestClient_IsSocketStale_NoFile(t *testing.T) {
	stale := IsSocketStale("/nonexistent/sock")
	if !stale {
		t.Error("expected nonexistent socket to be considered stale")
	}
}

func TestClient_IsSocketStale_Active(t *testing.T) {
	// Use /tmp directly to avoid path length limit on macOS (108 chars max for UDS)
	dir, err := os.MkdirTemp("/tmp", "embed-test-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(dir)
	sock := filepath.Join(dir, "test.sock")

	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()

	stale := IsSocketStale(sock)
	if stale {
		t.Error("expected active socket to not be stale")
	}
}

func TestCleanStaleSocket(t *testing.T) {
	dir := t.TempDir()
	sock := filepath.Join(dir, "stale.sock")
	pid := sock + ".pid"

	// Create fake stale files
	os.WriteFile(sock, []byte("x"), 0644)
	os.WriteFile(pid, []byte("99999"), 0644)

	CleanStaleSocket(sock)

	if _, err := os.Stat(sock); !os.IsNotExist(err) {
		t.Error("socket file should have been removed")
	}
	if _, err := os.Stat(pid); !os.IsNotExist(err) {
		t.Error("PID file should have been removed")
	}
}
