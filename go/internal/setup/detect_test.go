package setup

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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

// --- Fallback command behavior (audit item E) ---
//
// The fallback strings are substituted into SKILL.md files where agents
// interpret them as shell commands (e.g., "Run `{{QUALITY_GATE_TEST}}`").
// Prose like "detect and run the project's test suite" executes as a
// command and fails silently or with a confusing error.
//
// Fallbacks must be concrete shell commands that fail loudly so the
// agent sees a diagnostic and can ask the user for guidance.

func TestFallbackCommand_ExitsNonZero(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("sh-based fallback contract applies to POSIX hosts only")
	}
	cases := []struct{ name, cmd string }{
		{"test", FallbackTestCmd},
		{"lint", FallbackLintCmd},
		{"build", FallbackBuildCmd},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			cmd := exec.Command("/bin/sh", "-c", tc.cmd)
			out, err := cmd.CombinedOutput()
			if err == nil {
				t.Fatalf("fallback %s command succeeded; expected non-zero exit\noutput: %s", tc.name, out)
			}
			exitErr, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatalf("fallback %s: expected *exec.ExitError, got %T: %v", tc.name, err, err)
			}
			if exitErr.ExitCode() == 0 {
				t.Fatalf("fallback %s exited 0; want non-zero", tc.name)
			}
		})
	}
}

func TestFallbackCommand_DiagnosticOnStderr(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("sh-based fallback contract applies to POSIX hosts only")
	}
	cases := []struct {
		name      string
		cmd       string
		wantInMsg string
	}{
		{"test", FallbackTestCmd, "test"},
		{"lint", FallbackLintCmd, "lint"},
		{"build", FallbackBuildCmd, "build"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			cmd := exec.Command("/bin/sh", "-c", tc.cmd)
			var stderr strings.Builder
			cmd.Stderr = &stderr
			_ = cmd.Run()
			msg := stderr.String()
			if msg == "" {
				t.Fatalf("fallback %s produced no stderr diagnostic", tc.name)
			}
			if !strings.Contains(strings.ToLower(msg), "compound-agent") {
				t.Errorf("fallback %s stderr missing 'compound-agent' tag: %q", tc.name, msg)
			}
			if !strings.Contains(strings.ToLower(msg), tc.wantInMsg) {
				t.Errorf("fallback %s stderr missing gate identifier %q: %q", tc.name, tc.wantInMsg, msg)
			}
		})
	}
}

func TestFallbackCommand_Idempotent(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("sh-based fallback contract applies to POSIX hosts only")
	}
	// Running the fallback twice must yield identical exit codes and no side effects
	// (no file writes into cwd).
	dir := t.TempDir()
	for i := 0; i < 2; i++ {
		cmd := exec.Command("/bin/sh", "-c", FallbackTestCmd)
		cmd.Dir = dir
		_ = cmd.Run()
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read tempdir: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("fallback command had side effects in cwd: %v", entries)
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
