//go:build windows

package embed

// EnsureDaemon is not supported on Windows. Returns ErrNotSupported.
// The embed daemon uses Unix domain sockets for IPC, which are unavailable
// on native Windows. Callers should fall back to keyword-only FTS5 search.
func EnsureDaemon(repoRoot, modelPath, tokenizerPath string) (*Client, error) {
	return nil, ErrNotSupported
}
