package setup

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// removeIfPresent must:
//   - return (true, nil)  on successful removal
//   - return (false, nil) when the file is absent (idempotent)
//   - return (false, err) for real I/O failures (permission, etc.)
//
// The pre-fix version returned ErrNotExist in both branches, which caused
// uninstallTemplates to silently swallow real I/O errors and report success.
func TestRemoveIfPresent_AbsentReturnsFalseNil(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	existed, err := removeIfPresent(filepath.Join(dir, "does-not-exist.txt"))
	if err != nil {
		t.Errorf("removeIfPresent on missing file: got err=%v, want nil", err)
	}
	if existed {
		t.Error("removeIfPresent on missing file: existed=true, want false")
	}
}

func TestRemoveIfPresent_PresentReturnsTrueNil(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	existed, err := removeIfPresent(path)
	if err != nil {
		t.Errorf("removeIfPresent on existing file: got err=%v, want nil", err)
	}
	if !existed {
		t.Error("removeIfPresent on existing file: existed=false, want true")
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Error("file should be removed")
	}
}

func TestRemoveIfPresent_RealIOErrorSurfaces(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("directory permissions semantics differ on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("running as root; cannot simulate permission denial")
	}
	// Make the parent directory unwritable so os.Remove fails with EACCES.
	dir := t.TempDir()
	inner := filepath.Join(dir, "locked")
	if err := os.Mkdir(inner, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	path := filepath.Join(inner, "target.txt")
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.Chmod(inner, 0o555); err != nil { // r-xr-xr-x
		t.Fatalf("chmod: %v", err)
	}
	defer os.Chmod(inner, 0o755) //nolint:errcheck // cleanup best-effort

	existed, err := removeIfPresent(path)
	if err == nil {
		t.Fatal("expected a real I/O error, got nil (this means removeIfPresent is swallowing errors)")
	}
	if errors.Is(err, os.ErrNotExist) {
		t.Errorf("expected a non-ErrNotExist error, got: %v", err)
	}
	if existed {
		t.Error("existed should be false when removal failed")
	}
}

// uninstallTemplates must propagate real I/O errors from plugin.json removal,
// not silently return nil. This guards against a permission-denied failure
// that would otherwise report "uninstall success" to the user while plugin.json
// remains on disk.
func TestUninstallTemplates_PropagatesRealIOError(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		t.Skip("POSIX perm simulation")
	}
	if os.Geteuid() == 0 {
		t.Skip("running as root")
	}
	dir := t.TempDir()
	claudeDir := filepath.Join(dir, ".claude")
	if err := os.Mkdir(claudeDir, 0o755); err != nil {
		t.Fatalf("mkdir .claude: %v", err)
	}
	// Put a plugin.json inside, then lock the parent dir so it can't be removed.
	if err := os.WriteFile(filepath.Join(claudeDir, "plugin.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatalf("write plugin.json: %v", err)
	}
	if err := os.Chmod(claudeDir, 0o555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	defer os.Chmod(claudeDir, 0o755) //nolint:errcheck

	result := &UninstallResult{}
	err := uninstallTemplates(dir, result)
	if err == nil {
		t.Fatal("uninstallTemplates should surface plugin.json permission error, got nil")
	}
	if !strings.Contains(err.Error(), "plugin.json") {
		t.Errorf("error should mention plugin.json for actionable UX: %v", err)
	}
}

// Guard on absent plugin.json: uninstallTemplates must succeed silently.
func TestUninstallTemplates_AbsentPluginJSONSucceeds(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".claude"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// No plugin.json. No compound/ dirs either. Everything absent.
	result := &UninstallResult{}
	if err := uninstallTemplates(dir, result); err != nil {
		t.Errorf("uninstallTemplates on empty .claude/ should succeed, got: %v", err)
	}
	for _, p := range result.TemplatesRemoved {
		if strings.Contains(p, "plugin.json") {
			t.Errorf("should not claim plugin.json removal when it was absent: %s", p)
		}
	}
}

// Regression: workflow → minimal --confirm-prune should prune the
// workflow-specific templates (Opus review P3).
func TestInitRepo_Downgrade_WorkflowToMinimalWithConfirmPrunes(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Seed: workflow install (has skills/commands/docs but no research tree).
	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Profile: ProfileWorkflow}); err != nil {
		t.Fatalf("seed workflow: %v", err)
	}
	skillsDir := filepath.Join(dir, ".claude", "skills", "compound")
	before, _ := os.ReadDir(skillsDir)
	if len(before) == 0 {
		t.Fatal("seed: workflow install should populate skills dir")
	}

	// Downgrade workflow → minimal without --confirm-prune should error.
	if _, err := InitRepo(dir, InitOptions{SkipHooks: true, Profile: ProfileMinimal}); err == nil {
		t.Fatal("workflow→minimal without ConfirmPrune must error")
	}

	// With ConfirmPrune, prune succeeds.
	result, err := InitRepo(dir, InitOptions{
		SkipHooks:    true,
		Profile:      ProfileMinimal,
		ConfirmPrune: true,
	})
	if err != nil {
		t.Fatalf("downgrade with ConfirmPrune failed: %v", err)
	}
	if result.TemplatesPruned == 0 {
		t.Error("expected TemplatesPruned > 0")
	}
	entries, _ := os.ReadDir(skillsDir)
	for _, e := range entries {
		if e.IsDir() && e.Name() != "agents" {
			t.Errorf("phase dir should have been pruned: %s", e.Name())
		}
	}
}
