package setup

import (
	"os"
	"path/filepath"
)

// FallbackTestCmd is used when no project stack can be detected.
const FallbackTestCmd = "detect and run the project's test suite"

// FallbackLintCmd is used when no project stack can be detected.
const FallbackLintCmd = "detect and run the project's linter"

// StackInfo holds the detected quality gate commands for a project.
type StackInfo struct {
	TestCmd string
	LintCmd string
}

// DetectStack inspects repoRoot for language marker files and returns
// the appropriate test and lint commands. Priority: Go > Rust > Python > Node > Makefile.
func DetectStack(repoRoot string) StackInfo {
	if fileExists(repoRoot, "go.mod") {
		return StackInfo{TestCmd: "go test ./...", LintCmd: "golangci-lint run ./..."}
	}
	if fileExists(repoRoot, "Cargo.toml") {
		return StackInfo{TestCmd: "cargo test", LintCmd: "cargo clippy"}
	}
	if fileExists(repoRoot, "pyproject.toml") || fileExists(repoRoot, "setup.py") {
		return StackInfo{TestCmd: "pytest", LintCmd: "ruff check ."}
	}
	if fileExists(repoRoot, "package.json") {
		return detectNodePackageManager(repoRoot)
	}
	if fileExists(repoRoot, "Makefile") {
		return StackInfo{TestCmd: "make test", LintCmd: "make lint"}
	}
	return StackInfo{TestCmd: FallbackTestCmd, LintCmd: FallbackLintCmd}
}

// detectNodePackageManager determines the Node package manager from lockfiles.
func detectNodePackageManager(repoRoot string) StackInfo {
	if fileExists(repoRoot, "pnpm-lock.yaml") {
		return StackInfo{TestCmd: "pnpm test", LintCmd: "pnpm lint"}
	}
	if fileExists(repoRoot, "yarn.lock") {
		return StackInfo{TestCmd: "yarn test", LintCmd: "yarn lint"}
	}
	if fileExists(repoRoot, "bun.lock") || fileExists(repoRoot, "bun.lockb") {
		return StackInfo{TestCmd: "bun test", LintCmd: "bun run lint"}
	}
	// Default to npm (package-lock.json or no lockfile)
	return StackInfo{TestCmd: "npm test", LintCmd: "npm run lint"}
}

// fileExists checks whether a regular file (not a directory) exists at repoRoot/name.
func fileExists(repoRoot, name string) bool {
	info, err := os.Stat(filepath.Join(repoRoot, name))
	return err == nil && !info.IsDir()
}
