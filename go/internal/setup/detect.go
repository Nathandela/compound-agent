package setup

import (
	"os"
	"path/filepath"
)

// Fallback commands are substituted for {{QUALITY_GATE_*}} placeholders
// when the project stack cannot be detected. They MUST be concrete shell
// commands that exit non-zero with a diagnostic on stderr so that:
//  1. Agents see a visible failure instead of interpreting English prose
//     as a command, which silently "succeeds" or produces confusing errors.
//  2. Humans running the command see a clear message about what to configure.
//
// Format: sh -c 'echo "<diagnostic>" >&2; exit 1'. Single-token, POSIX-only
// dependencies (echo, exit). Safe to run multiple times with no side effects.
//
// Keep the diagnostic prefixed with [compound-agent] so tests and users
// can grep for it reliably.
const FallbackTestCmd = `sh -c 'echo "[compound-agent] test command not configured for this stack — edit .claude/skills/compound/*/SKILL.md or re-run ca setup in a repo with a detectable stack (go.mod, Cargo.toml, pyproject.toml, package.json, Makefile)" >&2; exit 1'`

// FallbackLintCmd: see FallbackTestCmd for the contract.
const FallbackLintCmd = `sh -c 'echo "[compound-agent] lint command not configured for this stack — edit .claude/skills/compound/*/SKILL.md or re-run ca setup in a repo with a detectable stack" >&2; exit 1'`

// FallbackBuildCmd: see FallbackTestCmd for the contract.
const FallbackBuildCmd = `sh -c 'echo "[compound-agent] build command not configured for this stack — edit .claude/skills/compound/*/SKILL.md or re-run ca setup in a repo with a detectable stack" >&2; exit 1'`

// StackInfo holds the detected quality gate commands for a project.
type StackInfo struct {
	TestCmd  string
	LintCmd  string
	BuildCmd string
}

// withFallbacks fills empty command fields with descriptive fallback guidance.
func (s StackInfo) withFallbacks() StackInfo {
	if s.TestCmd == "" {
		s.TestCmd = FallbackTestCmd
	}
	if s.LintCmd == "" {
		s.LintCmd = FallbackLintCmd
	}
	if s.BuildCmd == "" {
		s.BuildCmd = FallbackBuildCmd
	}
	return s
}

// DetectStack inspects repoRoot for language marker files and returns
// the appropriate test, lint, and build/package verification commands.
// Priority: Go > Rust > Python > Node > Makefile.
func DetectStack(repoRoot string) StackInfo {
	if fileExists(repoRoot, "go.mod") {
		return StackInfo{
			TestCmd:  "go test ./...",
			LintCmd:  "golangci-lint run ./...",
			BuildCmd: "go build ./...",
		}
	}
	if fileExists(repoRoot, "Cargo.toml") {
		return StackInfo{
			TestCmd:  "cargo test",
			LintCmd:  "cargo clippy",
			BuildCmd: "cargo build",
		}
	}
	if fileExists(repoRoot, "pyproject.toml") || fileExists(repoRoot, "setup.py") {
		return StackInfo{
			TestCmd:  "pytest",
			LintCmd:  "ruff check .",
			BuildCmd: "python -m compileall .",
		}
	}
	if fileExists(repoRoot, "package.json") {
		return detectNodePackageManager(repoRoot)
	}
	if fileExists(repoRoot, "Makefile") {
		return StackInfo{
			TestCmd:  "make test",
			LintCmd:  "make lint",
			BuildCmd: "make build",
		}
	}
	return StackInfo{
		TestCmd:  FallbackTestCmd,
		LintCmd:  FallbackLintCmd,
		BuildCmd: FallbackBuildCmd,
	}
}

// detectNodePackageManager determines the Node package manager from lockfiles.
func detectNodePackageManager(repoRoot string) StackInfo {
	if fileExists(repoRoot, "pnpm-lock.yaml") {
		return StackInfo{
			TestCmd:  "pnpm test",
			LintCmd:  "pnpm lint",
			BuildCmd: "pnpm build",
		}
	}
	if fileExists(repoRoot, "yarn.lock") {
		return StackInfo{
			TestCmd:  "yarn test",
			LintCmd:  "yarn lint",
			BuildCmd: "yarn build",
		}
	}
	if fileExists(repoRoot, "bun.lock") || fileExists(repoRoot, "bun.lockb") {
		return StackInfo{
			TestCmd:  "bun test",
			LintCmd:  "bun run lint",
			BuildCmd: "bun run build",
		}
	}
	// Default to npm (package-lock.json or no lockfile)
	return StackInfo{
		TestCmd:  "npm test",
		LintCmd:  "npm run lint",
		BuildCmd: "npm run build",
	}
}

// fileExists checks whether a regular file (not a directory) exists at repoRoot/name.
func fileExists(repoRoot, name string) bool {
	info, err := os.Stat(filepath.Join(repoRoot, name))
	return err == nil && !info.IsDir()
}
