// Package contracts verifies behavioral contracts for Windows native support.
// Each test exercises real runtime behavior rather than searching config files.
// The goal is catching regressions that would silently break Windows users.
package contracts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/storage"
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
// Contract: CGO_ENABLED=0 cross-compilation succeeds for all Windows targets.
// ---------------------------------------------------------------------------

// TestContract_WindowsCrossCompilationAllTargets verifies that the Go binary
// cross-compiles to every supported Windows target with CGO_ENABLED=0 and
// that go vet passes for each. Skipped in short mode.
func TestContract_WindowsCrossCompilationAllTargets(t *testing.T) {
	if testing.Short() {
		t.Skip("cross-compilation tests skipped in short mode")
	}

	targets := []struct {
		goos   string
		goarch string
	}{
		{"windows", "amd64"},
		{"windows", "arm64"},
	}

	for _, tc := range targets {
		tc := tc
		t.Run(tc.goos+"/"+tc.goarch, func(t *testing.T) {
			t.Parallel()

			env := append(os.Environ(),
				"CGO_ENABLED=0",
				"GOOS="+tc.goos,
				"GOARCH="+tc.goarch,
			)

			// Build.
			build := exec.Command("go", "build", "-o", os.DevNull, "./cmd/ca")
			build.Dir = goDir(t)
			build.Env = env
			if out, err := build.CombinedOutput(); err != nil {
				t.Fatalf("build CGO_ENABLED=0 GOOS=%s GOARCH=%s failed:\n%s",
					tc.goos, tc.goarch, out)
			}

			// Vet.
			vet := exec.Command("go", "vet", "./...")
			vet.Dir = goDir(t)
			vet.Env = env
			if out, err := vet.CombinedOutput(); err != nil {
				t.Fatalf("vet CGO_ENABLED=0 GOOS=%s GOARCH=%s failed:\n%s",
					tc.goos, tc.goarch, out)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Contract: No sqlite_fts5 build tag required (pure-Go modernc driver).
// ---------------------------------------------------------------------------

// TestContract_NoSqliteFts5BuildTag verifies that the binary builds without
// -tags sqlite_fts5, confirming modernc.org/sqlite is the active driver.
// Skipped in short mode.
func TestContract_NoSqliteFts5BuildTag(t *testing.T) {
	if testing.Short() {
		t.Skip("cross-compilation test skipped in short mode")
	}
	cmd := exec.Command("go", "build", "-o", os.DevNull, "./cmd/ca")
	cmd.Dir = goDir(t)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build without -tags sqlite_fts5 failed (CGO_ENABLED=0):\n%s", out)
	}
}

// ---------------------------------------------------------------------------
// Contract: go.mod uses modernc.org/sqlite, not mattn/go-sqlite3.
// ---------------------------------------------------------------------------

// TestContract_NoMattnSqlite3InGoMod verifies that go.mod does not reference
// mattn/go-sqlite3, which requires CGO and breaks Windows cross-compilation.
func TestContract_NoMattnSqlite3InGoMod(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(goDir(t), "go.mod"))
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	if strings.Contains(string(data), "mattn/go-sqlite3") {
		t.Error("go.mod still references mattn/go-sqlite3 — must use modernc.org/sqlite for CGO_ENABLED=0")
	}
}

// TestContract_ModerncSqliteInGoMod verifies that modernc.org/sqlite is
// declared in go.mod as the pure-Go SQLite driver.
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
// Contract: Platform file pairs (windows/unix) both exist.
// ---------------------------------------------------------------------------

// TestContract_PlatformFilePairsExist verifies that every platform-specific
// file has a matching counterpart for the opposite platform.
func TestContract_PlatformFilePairsExist(t *testing.T) {
	root := goDir(t)

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
// Contract: FTS5 keyword search (Windows fallback path) works end-to-end.
// ---------------------------------------------------------------------------

// TestContract_SearchFallbackBehavior verifies that the FTS5 keyword search
// path returns correct results from an in-memory DB. This is the search
// path used on Windows where the embed daemon is not available.
func TestContract_SearchFallbackBehavior(t *testing.T) {
	db, err := storage.OpenDB(":memory:")
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer db.Close()

	// Write a lesson to a temp repo and rebuild the index.
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".claude", "lessons"), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	// Use a distinctive term with no special characters so SanitizeFtsQuery
	// leaves it intact and FTS5 tokenization matches the stored trigger.
	item := memory.Item{
		ID:         "T001",
		Type:       memory.TypeLesson,
		Trigger:    "xplatformfallbacktest",
		Insight:    "keyword search works on Windows",
		Tags:       []string{"windows"},
		Source:     memory.SourceManual,
		Context:    memory.Context{Tool: "bash", Intent: "test"},
		Created:    "2026-01-01T00:00:00Z",
		Confirmed:  true,
		Supersedes: []string{},
		Related:    []string{},
	}
	if err := memory.AppendItem(dir, item); err != nil {
		t.Fatalf("AppendItem: %v", err)
	}
	if err := storage.RebuildIndex(db, dir); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	sdb := storage.NewSearchDB(db)
	results, err := sdb.SearchKeyword("xplatformfallbacktest", 10, "")
	if err != nil {
		t.Fatalf("SearchKeyword: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d results, want 1", len(results))
	}
	if results[0].ID != "T001" {
		t.Errorf("result ID = %q, want T001", results[0].ID)
	}
}

// ---------------------------------------------------------------------------
// Contract: DSN pragmas are applied to file-based DBs.
// ---------------------------------------------------------------------------

// TestContract_DSNPragmasApplied verifies that the modernc.org/sqlite DSN
// pragma syntax correctly sets WAL journal mode and busy_timeout on a
// file-based database. These pragmas are critical for multi-process safety.
func TestContract_DSNPragmasApplied(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.sqlite")

	db, err := storage.OpenDB(dbPath)
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer db.Close()

	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want \"wal\"", mode)
	}

	var timeout int
	if err := db.QueryRow("PRAGMA busy_timeout").Scan(&timeout); err != nil {
		t.Fatalf("PRAGMA busy_timeout: %v", err)
	}
	if timeout != 5000 {
		t.Errorf("busy_timeout = %d, want 5000", timeout)
	}
}

