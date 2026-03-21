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

	// Process each file
	for _, relPath := range filePaths {
		fullPath := filepath.Join(repoRoot, relPath)
		content, err := os.ReadFile(fullPath)
		if err != nil {
			stats.FilesErrored++
			continue
		}

		hash := fileHash(string(content))
		storedHash := kdb.GetFileHash(relPath)

		if !force && storedHash == hash {
			stats.FilesSkipped++
			continue
		}

		chunks := ChunkFile(relPath, string(content), nil)
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

		// Atomic replacement: delete old, insert new, update hash
		if err := kdb.DeleteChunksByFilePath([]string{relPath}); err != nil {
			stats.FilesErrored++
			continue
		}
		if len(kChunks) > 0 {
			if err := kdb.UpsertChunks(kChunks); err != nil {
				stats.FilesErrored++
				continue
			}
		}
		kdb.SetFileHash(relPath, hash)

		stats.FilesIndexed++
		stats.ChunksCreated += len(kChunks)
	}

	// Clean up stale files
	indexedPaths := kdb.GetIndexedFilePaths()
	currentPathSet := make(map[string]bool, len(filePaths))
	for _, p := range filePaths {
		currentPathSet[p] = true
	}

	var stalePaths []string
	for _, p := range indexedPaths {
		if !currentPathSet[p] {
			stalePaths = append(stalePaths, p)
		}
	}

	if len(stalePaths) > 0 {
		for _, p := range stalePaths {
			stats.ChunksDeleted += kdb.GetChunkCountByFilePath(p)
		}
		if err := kdb.DeleteChunksByFilePath(stalePaths); err != nil {
			return stats, fmt.Errorf("delete stale chunks: %w", err)
		}
		for _, p := range stalePaths {
			kdb.RemoveFileHash(p)
		}
	}

	kdb.SetLastIndexTime(time.Now().UTC().Format(time.RFC3339))

	stats.DurationMs = time.Since(start).Milliseconds()
	return stats, nil
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
