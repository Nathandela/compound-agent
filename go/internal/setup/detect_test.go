package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectStack_Go(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module example.com/foo\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "go test ./..." {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "go test ./...")
	}
	if info.LintCmd != "golangci-lint run ./..." {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "golangci-lint run ./...")
	}
	if info.BuildCmd != "go build ./..." {
		t.Errorf("BuildCmd = %q, want %q", info.BuildCmd, "go build ./...")
	}
}

func TestDetectStack_Rust(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "Cargo.toml"), []byte("[package]\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "cargo test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "cargo test")
	}
	if info.LintCmd != "cargo clippy" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "cargo clippy")
	}
}

func TestDetectStack_Python(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "pyproject.toml"), []byte("[project]\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "pytest" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "pytest")
	}
	if info.LintCmd != "ruff check ." {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "ruff check .")
	}
	if info.BuildCmd != "python -m compileall ." {
		t.Errorf("BuildCmd = %q, want %q", info.BuildCmd, "python -m compileall .")
	}
}

func TestDetectStack_PythonSetupPy(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "setup.py"), []byte("from setuptools import setup\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "pytest" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "pytest")
	}
}

func TestDetectStack_NodePnpm(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)
	os.WriteFile(filepath.Join(dir, "pnpm-lock.yaml"), []byte("lockfileVersion: 9\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "pnpm test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "pnpm test")
	}
	if info.LintCmd != "pnpm lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "pnpm lint")
	}
	if info.BuildCmd != "pnpm build" {
		t.Errorf("BuildCmd = %q, want %q", info.BuildCmd, "pnpm build")
	}
}

func TestDetectStack_NodeYarn(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)
	os.WriteFile(filepath.Join(dir, "yarn.lock"), []byte("# yarn lockfile\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "yarn test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "yarn test")
	}
	if info.LintCmd != "yarn lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "yarn lint")
	}
}

func TestDetectStack_NodeBun(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)
	os.WriteFile(filepath.Join(dir, "bun.lock"), []byte("# bun lockfile\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "bun test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "bun test")
	}
	if info.LintCmd != "bun run lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "bun run lint")
	}
}

func TestDetectStack_NodeBunBinaryLockfile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)
	os.WriteFile(filepath.Join(dir, "bun.lockb"), []byte{0x00}, 0644)

	info := DetectStack(dir)
	if info.TestCmd != "bun test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "bun test")
	}
	if info.LintCmd != "bun run lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "bun run lint")
	}
}

func TestDetectStack_NodeNpm(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)
	os.WriteFile(filepath.Join(dir, "package-lock.json"), []byte("{}\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "npm test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "npm test")
	}
	if info.LintCmd != "npm run lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "npm run lint")
	}
}

func TestDetectStack_NodeNpmNoLockfile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)

	info := DetectStack(dir)
	// npm is the default when no lockfile is present
	if info.TestCmd != "npm test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "npm test")
	}
}

func TestDetectStack_Unknown(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	info := DetectStack(dir)
	if info.TestCmd != FallbackTestCmd {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, FallbackTestCmd)
	}
	if info.LintCmd != FallbackLintCmd {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, FallbackLintCmd)
	}
	if info.BuildCmd != FallbackBuildCmd {
		t.Errorf("BuildCmd = %q, want %q", info.BuildCmd, FallbackBuildCmd)
	}
}

func TestDetectStack_PriorityGoOverNode(t *testing.T) {
	t.Parallel()
	// When both go.mod and package.json exist (monorepo), prefer Go
	// since Go is the primary language marker
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module example.com/foo\n"), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "go test ./..." {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "go test ./...")
	}
}

func TestDetectStack_MakefileOnly(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "Makefile"), []byte("test:\n\techo test\n"), 0644)

	info := DetectStack(dir)
	if info.TestCmd != "make test" {
		t.Errorf("TestCmd = %q, want %q", info.TestCmd, "make test")
	}
	if info.LintCmd != "make lint" {
		t.Errorf("LintCmd = %q, want %q", info.LintCmd, "make lint")
	}
	if info.BuildCmd != "make build" {
		t.Errorf("BuildCmd = %q, want %q", info.BuildCmd, "make build")
	}
}

func TestDetectStack_DirectoryNotFile(t *testing.T) {
	t.Parallel()
	// A directory named go.mod should not be detected as a Go project
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "go.mod"), 0755)

	info := DetectStack(dir)
	if info.TestCmd != FallbackTestCmd {
		t.Errorf("TestCmd = %q, want fallback (directory named go.mod should be ignored)", info.TestCmd)
	}
}
