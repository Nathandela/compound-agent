package setup

import (
	"fmt"
	"os"
	"path/filepath"
)

// InitOptions controls what init creates.
type InitOptions struct {
	SkipHooks  bool
	SkipModel  bool
	BinaryPath string // Path to the Go binary for hook commands. Empty = npx fallback.
}

// InitResult reports what init did.
type InitResult struct {
	Success        bool
	HooksInstalled bool
	DirsCreated    []string
	FilesCreated   []string
}

// InitRepo initializes compound-agent in a repository.
// Creates .claude/ structure, lessons index, and optionally installs hooks.
func InitRepo(repoRoot string, opts InitOptions) (*InitResult, error) {
	result := &InitResult{Success: true}

	// Create directory structure
	dirs := []string{
		filepath.Join(repoRoot, ".claude"),
		filepath.Join(repoRoot, ".claude", "lessons"),
		filepath.Join(repoRoot, ".claude", ".cache"),
		filepath.Join(repoRoot, ".claude", "agents", "compound"),
		filepath.Join(repoRoot, ".claude", "commands", "compound"),
		filepath.Join(repoRoot, ".claude", "skills", "compound"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create directory %s: %w", dir, err)
		}
		result.DirsCreated = append(result.DirsCreated, dir)
	}

	// Create empty index.jsonl if it doesn't exist
	indexPath := filepath.Join(repoRoot, ".claude", "lessons", "index.jsonl")
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		if err := os.WriteFile(indexPath, []byte{}, 0644); err != nil {
			return nil, fmt.Errorf("create index.jsonl: %w", err)
		}
		result.FilesCreated = append(result.FilesCreated, indexPath)
	}

	// Ensure .gitignore
	if err := EnsureGitignore(repoRoot); err != nil {
		return nil, fmt.Errorf("ensure .gitignore: %w", err)
	}

	// Install hooks unless skipped
	if !opts.SkipHooks {
		settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
		settings, err := ReadClaudeSettings(settingsPath)
		if err != nil {
			return nil, fmt.Errorf("read settings: %w", err)
		}

		if !HasAllHooks(settings) {
			AddAllHooks(settings, opts.BinaryPath)
			if err := WriteClaudeSettings(settingsPath, settings); err != nil {
				return nil, fmt.Errorf("write settings: %w", err)
			}
		}
		result.HooksInstalled = true
	}

	return result, nil
}

// EnsureGitignore creates or updates .claude/.gitignore with required patterns.
func EnsureGitignore(repoRoot string) error {
	gitignorePath := filepath.Join(repoRoot, ".claude", ".gitignore")

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(gitignorePath), 0755); err != nil {
		return err
	}

	patterns := `.cache/
*.sqlite
*.sqlite-shm
*.sqlite-wal
.ca-phase-state.json
.ca-failure-state.json
.ca-read-state.json
`

	// If gitignore exists, check if patterns are already there
	existing, err := os.ReadFile(gitignorePath)
	if err == nil && len(existing) > 0 {
		// File exists, check if it has our patterns
		content := string(existing)
		if contains(content, ".cache/") && contains(content, "*.sqlite") {
			return nil // Already has our patterns
		}
	}

	return os.WriteFile(gitignorePath, []byte(patterns), 0644)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
