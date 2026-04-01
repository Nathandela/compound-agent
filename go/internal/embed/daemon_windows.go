//go:build windows

package embed

import "errors"

// ErrNotSupported is returned when the embed daemon is called on Windows.
// The daemon requires Unix domain sockets which are unavailable on native Windows.
// Callers should fall back to keyword-only search.
var ErrNotSupported = errors.New("embed daemon not supported on Windows (requires Unix sockets)")

// EnsureDaemon is not supported on Windows. Returns ErrNotSupported.
// The embed daemon uses Unix domain sockets for IPC, which are unavailable
// on native Windows. Callers should fall back to keyword-only FTS5 search.
func EnsureDaemon(repoRoot, modelPath, tokenizerPath string) (*Client, error) {
	return nil, ErrNotSupported
}
