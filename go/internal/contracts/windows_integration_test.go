// Package contracts verifies cross-epic interface contracts for Windows native support.
// These tests validate data-only contracts between E1 (SQLite + Platform Code),
// E2 (Build Pipeline), and E3 (npm Distribution).
//
// Epic: learning_agent-mnbo (Integration Verification: Windows Native Support)
package contracts

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func repoRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	// go/internal/contracts -> go -> repo root
	root := filepath.Join(wd, "..", "..", "..")
	if _, err := os.Stat(filepath.Join(root, "package.json")); err != nil {
		t.Fatalf("cannot locate repo root from %s: %v", wd, err)
	}
	return root
}

func goDir(t *testing.T) string {
	t.Helper()
	return filepath.Join(repoRoot(t), "go")
}

// ---------------------------------------------------------------------------
// Contract 1: E1→E2 — CGO_ENABLED=0 builds pass without C compiler
// ---------------------------------------------------------------------------

func TestContract_CGODisabled_WindowsAmd64(t *testing.T) {
	if testing.Short() {
		t.Skip("cross-compilation test skipped in short mode")
	}
	cmd := exec.Command("go", "build", "-o", os.DevNull, "./cmd/ca")
	cmd.Dir = goDir(t)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=windows", "GOARCH=amd64")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("CGO_ENABLED=0 GOOS=windows GOARCH=amd64 build failed:\n%s", out)
	}
}

func TestContract_CGODisabled_WindowsArm64(t *testing.T) {
	if testing.Short() {
		t.Skip("cross-compilation test skipped in short mode")
	}
	cmd := exec.Command("go", "build", "-o", os.DevNull, "./cmd/ca")
	cmd.Dir = goDir(t)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=windows", "GOARCH=arm64")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("CGO_ENABLED=0 GOOS=windows GOARCH=arm64 build failed:\n%s", out)
	}
}

// ---------------------------------------------------------------------------
// Contract 2: E1→E2 — No sqlite_fts5 build tag required
// ---------------------------------------------------------------------------

func TestContract_NoSqliteFts5BuildTag(t *testing.T) {
	if testing.Short() {
		t.Skip("cross-compilation test skipped in short mode")
	}
	// Build for the host platform with CGO_ENABLED=0 and NO build tags.
	// If modernc.org/sqlite is in use, this should succeed without -tags sqlite_fts5.
	cmd := exec.Command("go", "build", "-o", os.DevNull, "./cmd/ca")
	cmd.Dir = goDir(t)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build without -tags sqlite_fts5 failed (CGO_ENABLED=0):\n%s", out)
	}
}

func TestContract_NoMattnSqlite3InGoMod(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "go.mod"))
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	if strings.Contains(string(data), "mattn/go-sqlite3") {
		t.Error("go.mod still references mattn/go-sqlite3 — must use modernc.org/sqlite for CGO_ENABLED=0")
	}
}

func TestContract_ModerncSqliteInGoMod(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "go.mod"))
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	if !strings.Contains(string(data), "modernc.org/sqlite") {
		t.Error("go.mod missing modernc.org/sqlite — required for CGO_ENABLED=0 builds")
	}
}

// ---------------------------------------------------------------------------
// Contract 3: E1→E2 — Binary compiles on GOOS=windows (goreleaser config)
// ---------------------------------------------------------------------------

func TestContract_GoreleaserIncludesWindows(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), ".goreleaser.yml"))
	if err != nil {
		t.Fatalf("read .goreleaser.yml: %v", err)
	}
	content := string(data)

	// Verify CGO_ENABLED=0
	if !strings.Contains(content, "CGO_ENABLED=0") {
		t.Error("goreleaser build missing CGO_ENABLED=0")
	}

	// Verify windows in goos list
	if !strings.Contains(content, "windows") {
		t.Error("goreleaser build missing goos: windows")
	}

	// Verify amd64 and arm64 in goarch list
	if !strings.Contains(content, "amd64") {
		t.Error("goreleaser build missing goarch: amd64")
	}
	if !strings.Contains(content, "arm64") {
		t.Error("goreleaser build missing goarch: arm64")
	}
}

func TestContract_GoreleaserBinaryNaming(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), ".goreleaser.yml"))
	if err != nil {
		t.Fatalf("read .goreleaser.yml: %v", err)
	}
	content := string(data)

	// Goreleaser's name_template should produce ca-{os}-{arch} format
	// GoReleaser uses {{ .Os }} and {{ .Arch }}
	if !strings.Contains(content, "ca-") {
		t.Error("archive name_template missing ca- prefix")
	}
	if !strings.Contains(content, ".Os") {
		t.Error("archive name_template missing {{ .Os }} placeholder")
	}
	if !strings.Contains(content, ".Arch") {
		t.Error("archive name_template missing {{ .Arch }} placeholder")
	}
}

// ---------------------------------------------------------------------------
// Contract 4: E2→E3 — npm platform package maps to goreleaser artifacts
// ---------------------------------------------------------------------------

type pkgJSON struct {
	Version              string            `json:"version"`
	OS                   []string          `json:"os"`
	CPU                  []string          `json:"cpu"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
	Scripts              map[string]string `json:"scripts"`
}

func TestContract_NpmPlatformPackagesIncludeWin32(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), "package.json"))
	if err != nil {
		t.Fatalf("read package.json: %v", err)
	}
	var pkg pkgJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("parse package.json: %v", err)
	}

	// Verify win32 in OS field
	hasWin32 := false
	for _, o := range pkg.OS {
		if o == "win32" {
			hasWin32 = true
			break
		}
	}
	if !hasWin32 {
		t.Error("package.json os field missing win32")
	}

	// Verify both win32 platform packages in optionalDependencies
	for _, name := range []string{"@syottos/win32-x64", "@syottos/win32-arm64"} {
		v, ok := pkg.OptionalDependencies[name]
		if !ok {
			t.Errorf("missing optionalDependency: %s", name)
		} else if v != pkg.Version {
			t.Errorf("optionalDependency %s version %q != package version %q", name, v, pkg.Version)
		}
	}
}

func TestContract_PublishPlatformsWindowsExeExtension(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), "scripts", "publish-platforms.cjs"))
	if err != nil {
		t.Fatalf("read publish-platforms.cjs: %v", err)
	}
	content := string(data)

	// Verify win32-x64 maps to windows-amd64 with .exe
	if !strings.Contains(content, `goreleaser: "windows-amd64"`) {
		t.Error("publish-platforms.cjs missing goreleaser mapping for windows-amd64")
	}
	if !strings.Contains(content, `goreleaser: "windows-arm64"`) {
		t.Error("publish-platforms.cjs missing goreleaser mapping for windows-arm64")
	}

	// Windows entries must have ext: ".exe"
	win32ExeRe := regexp.MustCompile(`win32.*ext:\s*"\.exe"`)
	matches := win32ExeRe.FindAllString(content, -1)
	if len(matches) < 2 {
		t.Errorf("expected 2 win32 entries with ext: \".exe\", found %d", len(matches))
	}
}

func TestContract_PublishPlatformsWindowsNoEmbedDaemon(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), "scripts", "publish-platforms.cjs"))
	if err != nil {
		t.Fatalf("read publish-platforms.cjs: %v", err)
	}
	content := string(data)

	// Windows entries must have embedGoreleaser: null (no embed daemon shipped)
	nullEmbedRe := regexp.MustCompile(`win32.*embedGoreleaser:\s*null`)
	matches := nullEmbedRe.FindAllString(content, -1)
	if len(matches) < 2 {
		t.Errorf("expected 2 win32 entries with embedGoreleaser: null, found %d", len(matches))
	}
}

// ---------------------------------------------------------------------------
// Contract 5: E2→E3 — Postinstall downloads Windows binary
// ---------------------------------------------------------------------------

func TestContract_PostinstallHandlesWin32(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), "scripts", "postinstall.cjs"))
	if err != nil {
		t.Fatalf("read postinstall.cjs: %v", err)
	}
	content := string(data)

	// Must detect win32 platform
	if !strings.Contains(content, `"win32"`) {
		t.Error("postinstall.cjs does not reference win32 platform")
	}

	// Must append .exe on Windows
	if !strings.Contains(content, `.exe`) {
		t.Error("postinstall.cjs does not handle .exe extension")
	}

	// Must skip embed daemon on Windows
	if !strings.Contains(content, "isWindows") {
		t.Error("postinstall.cjs does not detect isWindows for embed daemon skip")
	}
}

// ---------------------------------------------------------------------------
// Contract 6: E1→E3 — openURL works on Windows
// ---------------------------------------------------------------------------

func TestContract_OpenURLWindowsDispatch(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "cli", "commands_info.go"))
	if err != nil {
		t.Fatalf("read commands_info.go: %v", err)
	}
	content := string(data)

	// Verify openURL function exists with Windows case
	if !strings.Contains(content, `case "windows"`) {
		t.Error("openURL missing Windows case")
	}

	// Verify correct Windows command: cmd /c start
	if !strings.Contains(content, `"cmd"`) || !strings.Contains(content, `"/c"`) || !strings.Contains(content, `"start"`) {
		t.Error("openURL Windows case should use cmd /c start")
	}

	// Verify URL scheme validation (P0 security)
	if !strings.Contains(content, "http://") || !strings.Contains(content, "https://") {
		t.Error("openURL missing URL scheme validation")
	}
}

// ---------------------------------------------------------------------------
// Contract 7: E1→E3 — Search degrades to FTS5 on Windows
// ---------------------------------------------------------------------------

func TestContract_EnsureDaemonWindowsReturnsNotSupported(t *testing.T) {
	// Verify the Windows daemon stub exists with correct build tag
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "embed", "daemon_windows.go"))
	if err != nil {
		t.Fatalf("read daemon_windows.go: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "//go:build windows") {
		t.Error("daemon_windows.go missing //go:build windows tag")
	}
	if !strings.Contains(content, "ErrNotSupported") {
		t.Error("daemon_windows.go should return ErrNotSupported")
	}
}

func TestContract_SearchFallbackWithNilEmbedder(t *testing.T) {
	// Verify that executeSearch handles nil embedder by falling back to keyword search.
	// We verify the code structure rather than running the full search (which needs a DB).
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "cli", "commands.go"))
	if err != nil {
		t.Fatalf("read commands.go: %v", err)
	}
	content := string(data)

	// Verify executeSearch checks for nil embedder
	if !strings.Contains(content, "embedder != nil") {
		t.Error("executeSearch should check for nil embedder")
	}

	// Verify Windows search notice path exists
	if !strings.Contains(content, "emitWindowsSearchNotice") {
		t.Error("executeSearch missing Windows search notice emission")
	}

	// Verify fallback to keyword search
	if !strings.Contains(content, "SearchKeyword") {
		t.Error("executeSearch should fall back to SearchKeyword when embedder is nil")
	}
}

func TestContract_WindowsSearchNoticeOncePerRepo(t *testing.T) {
	// Verify the one-time search notice uses a marker file pattern
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "cli", "commands.go"))
	if err != nil {
		t.Fatalf("read commands.go: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "windows-search-notice") {
		t.Error("emitWindowsSearchNotice should use a marker file to show notice only once")
	}
}

// ---------------------------------------------------------------------------
// Contract 8: E1→E3 — LockFileEx prevents corruption
// ---------------------------------------------------------------------------

func TestContract_FlockWindowsFileExists(t *testing.T) {
	// Verify storage flock_windows.go exists with correct build tag
	path := filepath.Join(goDir(t), "internal", "storage", "flock_windows.go")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("flock_windows.go not found: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "//go:build windows") {
		t.Error("flock_windows.go missing //go:build windows tag")
	}
	if !strings.Contains(content, "LockFileEx") {
		t.Error("flock_windows.go should use windows.LockFileEx")
	}
	if !strings.Contains(content, "UnlockFileEx") {
		t.Error("flock_windows.go should use windows.UnlockFileEx")
	}
}

func TestContract_FlockUnixFileExists(t *testing.T) {
	// Verify the Unix counterpart also exists with complementary build tag
	path := filepath.Join(goDir(t), "internal", "storage", "flock_unix.go")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("flock_unix.go not found: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "//go:build !windows") {
		t.Error("flock_unix.go missing //go:build !windows tag")
	}
	if !strings.Contains(content, "syscall.Flock") {
		t.Error("flock_unix.go should use syscall.Flock")
	}
}

func TestContract_EmbedFlockWindowsFileExists(t *testing.T) {
	// Verify embed package also has Windows flock implementation
	path := filepath.Join(goDir(t), "internal", "embed", "flock_windows.go")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("embed/flock_windows.go not found: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "//go:build windows") {
		t.Error("embed/flock_windows.go missing //go:build windows tag")
	}
	if !strings.Contains(content, "LockFileEx") {
		t.Error("embed/flock_windows.go should use windows.LockFileEx")
	}
}

// ---------------------------------------------------------------------------
// Contract: Makefile cross-compilation includes Windows
// ---------------------------------------------------------------------------

func TestContract_MakefilePlatformsIncludeWindows(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "Makefile"))
	if err != nil {
		t.Fatalf("read Makefile: %v", err)
	}
	content := string(data)

	if !strings.Contains(content, "windows-amd64") {
		t.Error("Makefile PLATFORMS missing windows-amd64")
	}
	if !strings.Contains(content, "windows-arm64") {
		t.Error("Makefile PLATFORMS missing windows-arm64")
	}

	// Verify .exe extension handling in build-all
	if !strings.Contains(content, `.exe`) {
		t.Error("Makefile build-all should handle .exe extension for Windows")
	}

	// Verify CGO_ENABLED=0 in build-all
	if !strings.Contains(content, "CGO_ENABLED=0") {
		t.Error("Makefile build-all should set CGO_ENABLED=0")
	}
}

// ---------------------------------------------------------------------------
// Contract: Platform detection maps are consistent
// ---------------------------------------------------------------------------

func TestContract_NpmToGoreleaserNamingConsistency(t *testing.T) {
	// The publish-platforms.cjs PLATFORMS array maps npm names to goreleaser names.
	// The npmdist Go package maps the same names.
	// Verify the Go package handles all expected platform keys.

	tests := []struct {
		npmOS   string
		npmArch string
		wantKey string
	}{
		{"darwin", "arm64", "darwin-arm64"},
		{"darwin", "x64", "darwin-amd64"},
		{"linux", "arm64", "linux-arm64"},
		{"linux", "x64", "linux-amd64"},
		{"win32", "x64", "windows-amd64"},
		{"win32", "arm64", "windows-arm64"},
	}

	// We can't import the npmdist package directly without creating a circular
	// dependency, but we can verify the mapping file exists and contains the
	// expected entries.
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "npmdist", "npmdist.go"))
	if err != nil {
		t.Fatalf("read npmdist.go: %v", err)
	}
	content := string(data)

	for _, tt := range tests {
		// Verify the platformMap and archMap entries exist
		switch tt.npmOS {
		case "win32":
			if !strings.Contains(content, `"win32":  "windows"`) {
				t.Errorf("npmdist.go platformMap missing win32 -> windows mapping")
			}
		case "darwin":
			if !strings.Contains(content, `"darwin": "darwin"`) {
				t.Errorf("npmdist.go platformMap missing darwin -> darwin mapping")
			}
		case "linux":
			if !strings.Contains(content, `"linux":  "linux"`) {
				t.Errorf("npmdist.go platformMap missing linux -> linux mapping")
			}
		}
	}

	// Verify goreleaser names match what publish-platforms.cjs expects
	publishData, err := os.ReadFile(filepath.Join(repoRoot(t), "scripts", "publish-platforms.cjs"))
	if err != nil {
		t.Fatalf("read publish-platforms.cjs: %v", err)
	}
	publishContent := string(publishData)

	for _, tt := range tests {
		if !strings.Contains(publishContent, tt.wantKey) {
			t.Errorf("publish-platforms.cjs missing goreleaser key %q for npm %s-%s", tt.wantKey, tt.npmOS, tt.npmArch)
		}
	}
}

// ---------------------------------------------------------------------------
// Contract: CI workflow includes Windows in test matrix
// ---------------------------------------------------------------------------

func TestContract_CIWorkflowIncludesWindows(t *testing.T) {
	root := repoRoot(t)

	// Check for CI workflow file
	ciPath := filepath.Join(root, ".github", "workflows", "ci.yml")
	data, err := os.ReadFile(ciPath)
	if err != nil {
		t.Skipf("CI workflow not found at %s (may be in different location)", ciPath)
	}
	content := string(data)

	if !strings.Contains(content, "windows-latest") {
		t.Error("CI workflow should include windows-latest in test matrix")
	}
}

// ---------------------------------------------------------------------------
// Contract: Runtime platform detection for binary extension
// ---------------------------------------------------------------------------

func TestContract_BinWrapperHandlesWindowsExe(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(repoRoot(t), "bin", "ca"))
	if err != nil {
		t.Fatalf("read bin/ca: %v", err)
	}
	content := string(data)

	// Verify the wrapper handles .exe extension on Windows
	if !strings.Contains(content, ".exe") {
		t.Error("bin/ca wrapper should handle .exe extension for Windows")
	}

	// Verify win32 platform detection
	if !strings.Contains(content, "win32") {
		t.Error("bin/ca wrapper should detect win32 platform")
	}
}

// ---------------------------------------------------------------------------
// Contract: Embed daemon build-daemon-all excludes Windows (non-goal)
// ---------------------------------------------------------------------------

func TestContract_RustDaemonExcludesWindows(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "Makefile"))
	if err != nil {
		t.Fatalf("read Makefile: %v", err)
	}
	content := string(data)

	// The build-daemon-all target should skip Windows platforms
	// because the Rust embed daemon is not supported on Windows (non-goal).
	// Find the build-daemon-all section
	daemonIdx := strings.Index(content, "build-daemon-all:")
	if daemonIdx < 0 {
		t.Skip("build-daemon-all target not found in Makefile")
	}
	daemonSection := content[daemonIdx:]
	// Find the next target (starts with a newline + non-tab character)
	nextTarget := strings.Index(daemonSection[1:], "\n\n")
	if nextTarget > 0 {
		daemonSection = daemonSection[:nextTarget+1]
	}

	// Windows platforms must be explicitly skipped with continue
	if !strings.Contains(daemonSection, "windows-*) continue") {
		t.Error("build-daemon-all must skip Windows platforms with 'windows-*) continue'")
	}

	// No cargo build triple should map to a Windows target
	if strings.Contains(daemonSection, "windows-gnu") || strings.Contains(daemonSection, "windows-msvc") {
		t.Error("build-daemon-all should not have Windows cargo target triples")
	}
}

// ---------------------------------------------------------------------------
// Meta-contract: Platform-specific file pairs are complete
// ---------------------------------------------------------------------------

func TestContract_PlatformFilePairsExist(t *testing.T) {
	root := goDir(t)

	// Each platform-specific functionality should have both a _windows.go and _unix.go file
	pairs := []struct {
		dir     string
		windows string
		unix    string
	}{
		{"internal/storage", "flock_windows.go", "flock_unix.go"},
		{"internal/embed", "flock_windows.go", "flock_unix.go"},
		{"internal/embed", "daemon_windows.go", "daemon_unix.go"},
	}

	for _, pair := range pairs {
		winPath := filepath.Join(root, pair.dir, pair.windows)
		unixPath := filepath.Join(root, pair.dir, pair.unix)

		if _, err := os.Stat(winPath); os.IsNotExist(err) {
			t.Errorf("missing Windows file: %s/%s", pair.dir, pair.windows)
		}
		if _, err := os.Stat(unixPath); os.IsNotExist(err) {
			t.Errorf("missing Unix file: %s/%s", pair.dir, pair.unix)
		}
	}
}

// ---------------------------------------------------------------------------
// Contract: runtime.GOOS check exists in search path
// ---------------------------------------------------------------------------

func TestContract_SearchEmitsWindowsNotice(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "internal", "cli", "commands.go"))
	if err != nil {
		t.Fatalf("read commands.go: %v", err)
	}
	content := string(data)

	// Verify the runtime.GOOS == "windows" check exists in the search path
	if !strings.Contains(content, `runtime.GOOS == "windows"`) {
		t.Error("executeSearch should check runtime.GOOS == \"windows\" for platform-specific notice")
	}
}

// ---------------------------------------------------------------------------
// Contract: Release workflow includes Windows artifacts
// ---------------------------------------------------------------------------

func TestContract_ReleaseWorkflowWindowsArtifacts(t *testing.T) {
	root := repoRoot(t)
	releasePath := filepath.Join(root, ".github", "workflows", "release.yml")
	data, err := os.ReadFile(releasePath)
	if err != nil {
		t.Skipf("release workflow not found at %s", releasePath)
	}
	content := string(data)

	if !strings.Contains(content, "windows-amd64") {
		t.Error("release workflow should produce windows-amd64 artifacts")
	}
	if !strings.Contains(content, "windows-arm64") {
		t.Error("release workflow should produce windows-arm64 artifacts")
	}
}
