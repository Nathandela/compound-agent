package util

import (
	"bytes"
	"io"
	"testing"
	"time"
)

func TestReadStdin_ValidJSON(t *testing.T) {
	input := `{"tool_name":"Bash","tool_input":{"command":"ls"}}`
	r := io.NopCloser(bytes.NewBufferString(input))
	got, err := ReadStdinFrom(r, 30*time.Second, 1<<20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != input {
		t.Errorf("got %q, want %q", got, input)
	}
}

func TestReadStdin_Empty(t *testing.T) {
	r := io.NopCloser(bytes.NewBufferString(""))
	got, err := ReadStdinFrom(r, 30*time.Second, 1<<20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Errorf("got %q, want empty string", got)
	}
}

func TestReadStdin_ExceedsMaxBytes(t *testing.T) {
	input := "x" + string(make([]byte, 100))
	r := io.NopCloser(bytes.NewBufferString(input))
	_, err := ReadStdinFrom(r, 30*time.Second, 50)
	if err == nil {
		t.Fatal("expected error for exceeding max bytes")
	}
}

func TestReadStdin_Timeout(t *testing.T) {
	// Use a reader that blocks forever
	pr, _ := io.Pipe()
	_, err := ReadStdinFrom(pr, 10*time.Millisecond, 1<<20)
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestReadStdin_ExactlyMaxBytes(t *testing.T) {
	input := string(make([]byte, 50))
	r := io.NopCloser(bytes.NewBufferString(input))
	got, err := ReadStdinFrom(r, 30*time.Second, 50)
	if err != nil {
		t.Fatalf("exactly maxBytes should succeed: %v", err)
	}
	if len(got) != 50 {
		t.Errorf("got %d bytes, want 50", len(got))
	}
}

func TestReadStdin_IncrementalLimit(t *testing.T) {
	// R3: Verify the reader stops reading after maxBytes+1 bytes,
	// not after reading the entire stream into memory.
	maxBytes := 1024
	totalAvailable := maxBytes * 100
	r := &countingReader{remaining: totalAvailable}
	_, err := ReadStdinFrom(r, 5*time.Second, maxBytes)
	if err == nil {
		t.Fatal("expected error for exceeding max bytes")
	}
	// The reader should NOT have consumed all available bytes.
	// It should read at most maxBytes+1 (to detect the overflow).
	bytesRead := totalAvailable - r.remaining
	if bytesRead > maxBytes*2 {
		t.Errorf("reader consumed %d bytes, but should stop near maxBytes (%d)", bytesRead, maxBytes)
	}
}

// countingReader produces 'x' bytes on demand and tracks how many remain
type countingReader struct {
	remaining int
}

func (r *countingReader) Read(p []byte) (int, error) {
	if r.remaining <= 0 {
		return 0, io.EOF
	}
	n := len(p)
	if n > r.remaining {
		n = r.remaining
	}
	for i := 0; i < n; i++ {
		p[i] = 'x'
	}
	r.remaining -= n
	return n, nil
}
