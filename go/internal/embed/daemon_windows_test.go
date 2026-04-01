//go:build windows

package embed

import (
	"errors"
	"testing"
)

// TestEnsureDaemon_ReturnsNotSupported verifies that EnsureDaemon returns
// ErrNotSupported on Windows, where the Unix-domain-socket IPC channel is
// unavailable. Callers must fall back to keyword-only FTS5 search.
func TestEnsureDaemon_ReturnsNotSupported(t *testing.T) {
	t.Parallel()

	client, err := EnsureDaemon("", "", "")

	if client != nil {
		t.Errorf("expected nil client, got %v", client)
	}
	if !errors.Is(err, ErrNotSupported) {
		t.Errorf("expected ErrNotSupported, got %v", err)
	}
}
