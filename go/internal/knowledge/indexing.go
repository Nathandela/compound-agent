package knowledge

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/storage"
)

// IndexOptions controls the indexing behavior.
type IndexOptions struct {
	Force   bool
	DocsDir string
}

// IndexResult holds statistics about an indexing operation.
type IndexResult struct {
	FilesIndexed   int
	FilesSkipped   int
	FilesErrored   int
	ChunksCreated  int
	ChunksDeleted  int
	ChunksEmbedded int
	DurationMs     int64
}

// IndexDocs indexes documentation files into the knowledge database.
func IndexDocs(repoRoot string, kdb *storage.KnowledgeDB, opts *IndexOptions) (*IndexResult, error) {
	start := time.Now()

	docsDir := "docs"
	force := false
	if opts != nil {
		if opts.DocsDir != "" {
			docsDir = opts.DocsDir
		}
		force = opts.Force
	}

	stats := &IndexResult{}

	docsPath := filepath.Join(repoRoot, docsDir)
	filePaths, err := walkSupportedFiles(docsPath, repoRoot)
	if err != nil {
		return stats, fmt.Errorf("walk docs: %w", err)
	}

	indexFiles(repoRoot, kdb, filePaths, force, stats)

	if err := syncDeletedFiles(kdb, filePaths, stats); err != nil {
		return stats, err
	}

	// Non-fatal: failing to record index time doesn't affect correctness
	_ = kdb.SetLastIndexTime(time.Now().UTC().Format(time.RFC3339))

	stats.DurationMs = time.Since(start).Milliseconds()
	return stats, nil
}

// indexFiles processes each file path: reads content, checks hash freshness,
// chunks the file, and atomically replaces chunks in the database.
func indexFiles(repoRoot string, kdb *storage.KnowledgeDB, filePaths []string, force bool, stats *IndexResult) {
	for _, relPath := range filePaths {
		indexed, chunks := indexSingleFile(repoRoot, kdb, relPath, force)
		if indexed {
			stats.FilesIndexed++
			stats.ChunksCreated += chunks
		} else if chunks == -1 {
			stats.FilesErrored++
		} else {
			stats.FilesSkipped++
		}
	}
}

// indexSingleFile reads, hashes, chunks, and stores a single file.
// Returns (true, chunkCount) on success, (false, -1) on error, (false, 0) on skip.
func indexSingleFile(repoRoot string, kdb *storage.KnowledgeDB, relPath string, force bool) (bool, int) {
	fullPath := filepath.Join(repoRoot, relPath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return false, -1
	}

	hash := fileHash(string(content))
	if !force && kdb.GetFileHash(relPath) == hash {
		return false, 0
	}

	kChunks := toKnowledgeChunks(relPath, string(content))

	if err := kdb.DeleteChunksByFilePath([]string{relPath}); err != nil {
		return false, -1
	}
	if len(kChunks) > 0 {
		if err := kdb.UpsertChunks(kChunks); err != nil {
			return false, -1
		}
	}
	if err := kdb.SetFileHash(relPath, hash); err != nil {
		return false, -1
	}

	return true, len(kChunks)
}

// toKnowledgeChunks chunks a file and converts to storage-layer chunks.
func toKnowledgeChunks(relPath, content string) []storage.KnowledgeChunk {
	chunks := ChunkFile(relPath, content, nil)
	now := time.Now().UTC().Format(time.RFC3339)
	kChunks := make([]storage.KnowledgeChunk, len(chunks))
	for i, c := range chunks {
		kChunks[i] = storage.KnowledgeChunk{
			ID:          c.ID,
			FilePath:    c.FilePath,
			StartLine:   c.StartLine,
			EndLine:     c.EndLine,
			ContentHash: c.ContentHash,
			Text:        c.Text,
			UpdatedAt:   now,
		}
	}
	return kChunks
}

// syncDeletedFiles removes chunks for files that no longer exist on disk.
func syncDeletedFiles(kdb *storage.KnowledgeDB, currentFiles []string, stats *IndexResult) error {
	indexedPaths := kdb.GetIndexedFilePaths()
	currentPathSet := make(map[string]bool, len(currentFiles))
	for _, p := range currentFiles {
		currentPathSet[p] = true
	}

	var stalePaths []string
	for _, p := range indexedPaths {
		if !currentPathSet[p] {
			stalePaths = append(stalePaths, p)
		}
	}

	if len(stalePaths) == 0 {
		return nil
	}

	for _, p := range stalePaths {
		stats.ChunksDeleted += kdb.GetChunkCountByFilePath(p)
	}
	if err := kdb.DeleteChunksByFilePath(stalePaths); err != nil {
		return fmt.Errorf("delete stale chunks: %w", err)
	}
	for _, p := range stalePaths {
		// Non-fatal: stale hash metadata is harmless if removal fails
		_ = kdb.RemoveFileHash(p)
	}
	return nil
}

func fileHash(content string) string {
	h := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", h)
}

// walkSupportedFiles recursively walks a directory and returns relative paths
// of files with supported extensions.
func walkSupportedFiles(baseDir, repoRoot string) ([]string, error) {
	var results []string

	err := filepath.WalkDir(baseDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if d.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if !SupportedExtensions[ext] {
			return nil
		}

		relPath, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return nil
		}
		results = append(results, relPath)
		return nil
	})

	if err != nil {
		// Directory doesn't exist
		return nil, nil
	}
	return results, nil
}
