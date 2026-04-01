package util

import (
	"bytes"
	"io"
	"sync/atomic"
	"testing"
	"time"
)

func TestReadStdin_ValidJSON(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
	t.Parallel()
	input := "x" + string(make([]byte, 100))
	r := io.NopCloser(bytes.NewBufferString(input))
	_, err := ReadStdinFrom(r, 30*time.Second, 50)
	if err == nil {
		t.Fatal("expected error for exceeding max bytes")
	}
}

func TestReadStdin_Timeout(t *testing.T) {
	t.Parallel()
	// Use a reader that blocks forever
	pr, _ := io.Pipe()
	_, err := ReadStdinFrom(pr, 10*time.Millisecond, 1<<20)
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestReadStdin_TimeoutClosesInternalPipe(t *testing.T) {
	t.Parallel()
	// Verify that on timeout, the internal pipe is closed so that a
	// copy goroutine in the write phase is unblocked. We use a slow
	// reader that produces data, ensuring io.Copy enters the write phase
	// before timeout fires. After timeout, io.Copy should fail writing
	// to the closed pipe and the goroutine should terminate.
	var copyReturned atomic.Int32
	r := &trickleReader{delay: 3 * time.Millisecond, copyReturned: &copyReturned}

	_, err := ReadStdinFrom(r, 15*time.Millisecond, 1<<20)
	if err == nil {
		t.Fatal("expected timeout error")
	}

	// Wait briefly for the copy goroutine to notice the closed pipe
	time.Sleep(50 * time.Millisecond)
	if copyReturned.Load() == 0 {
		// The slow reader keeps being called because io.Copy hasn't returned.
		// This would indicate the pipe close isn't propagating.
		// In practice, once the reader blocks and the write fails, Copy returns.
		// We can't directly observe this without instrumenting ReadStdinFrom,
		// so we verify indirectly: the trickle reader should have stopped
		// getting Read calls after the pipe closed.
		if r.callCount() > 20 {
			t.Error("reader called too many times after timeout -- goroutine may be leaking")
		}
	}
}

// trickleReader produces 1 byte per call with a delay.
type trickleReader struct {
	delay        time.Duration
	copyReturned *atomic.Int32
	calls        atomic.Int32
}

func (r *trickleReader) Read(p []byte) (int, error) {
	r.calls.Add(1)
	time.Sleep(r.delay)
	p[0] = 'x'
	return 1, nil
}

func (r *trickleReader) callCount() int32 {
	return r.calls.Load()
}

func TestReadStdin_ExactlyMaxBytes(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
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
