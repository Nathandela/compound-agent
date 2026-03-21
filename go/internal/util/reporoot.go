package util

import "os"

// GetRepoRoot returns the repository root directory.
// Uses COMPOUND_AGENT_ROOT env var if set, otherwise falls back to cwd.
func GetRepoRoot() string {
	if root := os.Getenv("COMPOUND_AGENT_ROOT"); root != "" {
		return root
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}
