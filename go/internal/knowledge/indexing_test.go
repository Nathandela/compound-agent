package knowledge

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

func setupTestRepo(t *testing.T) (string, *storage.KnowledgeDB) {
	t.Helper()
	dir := t.TempDir()

	// Create docs directory with test files
	docsDir := filepath.Join(dir, "docs")
	os.MkdirAll(docsDir, 0o755)

	os.WriteFile(filepath.Join(docsDir, "intro.md"), []byte("# Introduction\n\nThis is a test document about Go programming."), 0o644)
	os.WriteFile(filepath.Join(docsDir, "guide.txt"), []byte("A guide to testing in Go.\n\nUse table-driven tests."), 0o644)

	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	kdb := storage.NewKnowledgeDB(db)
	return dir, kdb
}

func TestIndexDocs_BasicIndexing(t *testing.T) {
	repoRoot, kdb := setupTestRepo(t)

	result, err := IndexDocs(repoRoot, kdb, nil)
	if err != nil {
		t.Fatalf("indexDocs: %v", err)
	}

	if result.FilesIndexed != 2 {
		t.Errorf("filesIndexed = %d, want 2", result.FilesIndexed)
	}
	if result.ChunksCreated < 2 {
		t.Errorf("chunksCreated = %d, want >= 2", result.ChunksCreated)
	}
	if result.DurationMs < 0 {
		t.Error("durationMs should be non-negative")
	}
}

func TestIndexDocs_SkipsUnchanged(t *testing.T) {
	repoRoot, kdb := setupTestRepo(t)

	// First index
	IndexDocs(repoRoot, kdb, nil)

	// Second index should skip all files
	result, err := IndexDocs(repoRoot, kdb, nil)
	if err != nil {
		t.Fatalf("second indexDocs: %v", err)
	}
	if result.FilesSkipped != 2 {
		t.Errorf("filesSkipped = %d, want 2", result.FilesSkipped)
	}
	if result.FilesIndexed != 0 {
		t.Errorf("filesIndexed = %d, want 0", result.FilesIndexed)
	}
}

func TestIndexDocs_ForceReindex(t *testing.T) {
	repoRoot, kdb := setupTestRepo(t)

	IndexDocs(repoRoot, kdb, nil)

	// Force re-index
	result, err := IndexDocs(repoRoot, kdb, &IndexOptions{Force: true})
	if err != nil {
		t.Fatalf("force indexDocs: %v", err)
	}
	if result.FilesIndexed != 2 {
		t.Errorf("filesIndexed = %d, want 2 (force)", result.FilesIndexed)
	}
}

func TestIndexDocs_DetectsFileChanges(t *testing.T) {
	repoRoot, kdb := setupTestRepo(t)

	IndexDocs(repoRoot, kdb, nil)

	// Modify one file
	os.WriteFile(filepath.Join(repoRoot, "docs", "intro.md"), []byte("# Updated Introduction\n\nNew content here."), 0o644)

	result, err := IndexDocs(repoRoot, kdb, nil)
	if err != nil {
		t.Fatalf("indexDocs after change: %v", err)
	}
	if result.FilesIndexed != 1 {
		t.Errorf("filesIndexed = %d, want 1 (changed file)", result.FilesIndexed)
	}
	if result.FilesSkipped != 1 {
		t.Errorf("filesSkipped = %d, want 1 (unchanged file)", result.FilesSkipped)
	}
}

func TestIndexDocs_CleansUpStaleFiles(t *testing.T) {
	repoRoot, kdb := setupTestRepo(t)

	IndexDocs(repoRoot, kdb, nil)

	// Delete one file
	os.Remove(filepath.Join(repoRoot, "docs", "guide.txt"))

	result, err := IndexDocs(repoRoot, kdb, nil)
	if err != nil {
		t.Fatalf("indexDocs after delete: %v", err)
	}
	if result.ChunksDeleted == 0 {
		t.Error("expected some chunks to be deleted for removed file")
	}
}

func TestIndexDocs_CustomDocsDir(t *testing.T) {
	dir := t.TempDir()
	customDir := filepath.Join(dir, "knowledge")
	os.MkdirAll(customDir, 0o755)
	os.WriteFile(filepath.Join(customDir, "notes.md"), []byte("# Notes\n\nSome notes."), 0o644)

	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	kdb := storage.NewKnowledgeDB(db)

	result, err := IndexDocs(dir, kdb, &IndexOptions{DocsDir: "knowledge"})
	if err != nil {
		t.Fatalf("indexDocs custom dir: %v", err)
	}
	if result.FilesIndexed != 1 {
		t.Errorf("filesIndexed = %d, want 1", result.FilesIndexed)
	}
}

func TestIndexDocs_IgnoresUnsupportedExtensions(t *testing.T) {
	dir := t.TempDir()
	docsDir := filepath.Join(dir, "docs")
	os.MkdirAll(docsDir, 0o755)

	os.WriteFile(filepath.Join(docsDir, "data.csv"), []byte("a,b,c"), 0o644)
	os.WriteFile(filepath.Join(docsDir, "readme.md"), []byte("# README"), 0o644)

	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	kdb := storage.NewKnowledgeDB(db)

	result, err := IndexDocs(dir, kdb, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.FilesIndexed != 1 {
		t.Errorf("filesIndexed = %d, want 1 (only .md)", result.FilesIndexed)
	}
}

func TestIndexDocs_EmptyDocsDir(t *testing.T) {
	dir := t.TempDir()
	// No docs directory at all

	db, err := storage.OpenKnowledgeDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	kdb := storage.NewKnowledgeDB(db)

	result, err := IndexDocs(dir, kdb, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.FilesIndexed != 0 {
		t.Errorf("filesIndexed = %d, want 0", result.FilesIndexed)
	}
}
