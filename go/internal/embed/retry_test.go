//go:build !windows

package embed

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestRetryClient_HealthRetryOnDisconnect(t *testing.T) {
	var callCount atomic.Int32

	// Handler that closes connection on first request, responds on second
	handler := func(conn net.Conn) {
		defer conn.Close()
		buf := make([]byte, 4096)
		for {
			n, err := conn.Read(buf)
			if err != nil {
				return
			}
			count := callCount.Add(1)
			if count == 1 {
				// Simulate crash: close connection without responding
				return
			}
			var req Request
			if err := json.Unmarshal(buf[:n-1], &req); err != nil {
				return
			}
			resp := Response{ID: req.ID, Status: "ok", Model: "nomic-embed-text-v1.5"}
			data, merr := json.Marshal(resp)
			if merr != nil {
				return
			}
			if _, werr := conn.Write(append(data, '\n')); werr != nil {
				return
			}
		}
	}

	sock, cleanup := startMockDaemon(t, handler)
	defer cleanup()

	client, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	rc := NewRetryClient(client, func() (*Client, error) {
		return NewClient(sock, 2*time.Second)
	})
	defer rc.Close()

	resp, err := rc.Health()
	if err != nil {
		t.Fatalf("health with retry: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %v, want ok", resp.Status)
	}
}

func TestRetryClient_EmbedRetryOnDisconnect(t *testing.T) {
	var callCount atomic.Int32

	handler := func(conn net.Conn) {
		defer conn.Close()
		buf := make([]byte, 4096)
		for {
			n, err := conn.Read(buf)
			if err != nil {
				return
			}
			count := callCount.Add(1)
			if count == 1 {
				return // Simulate crash
			}
			var req Request
			if err := json.Unmarshal(buf[:n-1], &req); err != nil {
				return
			}
			vecs := make([][]float64, len(req.Texts))
			for i := range req.Texts {
				vecs[i] = []float64{0.1, 0.2}
			}
			resp := Response{ID: req.ID, Vectors: vecs}
			data, merr := json.Marshal(resp)
			if merr != nil {
				return
			}
			if _, werr := conn.Write(append(data, '\n')); werr != nil {
				return
			}
		}
	}

	sock, cleanup := startMockDaemon(t, handler)
	defer cleanup()

	client, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	rc := NewRetryClient(client, func() (*Client, error) {
		return NewClient(sock, 2*time.Second)
	})
	defer rc.Close()

	resp, err := rc.Embed([]string{"test"})
	if err != nil {
		t.Fatalf("embed with retry: %v", err)
	}
	if len(resp.Vectors) != 1 {
		t.Errorf("vectors len = %d, want 1", len(resp.Vectors))
	}
}

func TestRetryClient_NoRetryOnSuccess(t *testing.T) {
	sock, cleanup := startMockDaemon(t, echoHandler)
	defer cleanup()

	client, err := NewClient(sock, 2*time.Second)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	connectCalled := false
	rc := NewRetryClient(client, func() (*Client, error) {
		connectCalled = true
		return NewClient(sock, 2*time.Second)
	})
	defer rc.Close()

	_, err = rc.Health()
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	if connectCalled {
		t.Error("connect should not be called on success")
	}
}

func TestRetryClient_ReconnectFails(t *testing.T) {
	dir, err := os.MkdirTemp("/tmp", "embed-test-")
	if err != nil {
		t.Fatalf("mkdirtemp: %v", err)
	}
	defer os.RemoveAll(dir)
	sock := filepath.Join(dir, "t.sock")

	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	// Handler that always closes immediately
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()

	client, err := NewClient(sock, 500*time.Millisecond)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	ln.Close() // Stop accepting new connections

	rc := NewRetryClient(client, func() (*Client, error) {
		return NewClient(sock, 200*time.Millisecond)
	})
	defer rc.Close()

	_, err = rc.Health()
	if err == nil {
		t.Error("expected error when reconnect fails")
	}
}
