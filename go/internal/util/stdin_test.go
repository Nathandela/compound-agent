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
