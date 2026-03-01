/**
 * Tests for the knowledge indexing pipeline.
 *
 * Written BEFORE implementation (TDD).
 * Uses real temp directories and in-memory SQLite.
 */

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { openKnowledgeDb, closeKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { getIndexedFilePaths, getLastIndexTime } from '../storage/sqlite-knowledge/sync.js';
import { indexDocs } from './indexing.js';
import type { IndexResult } from './indexing.js';

// ---------------------------------------------------------------------------
// Test setup: temp dir with docs/ subdirectory
// ---------------------------------------------------------------------------

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'knowledge-index-'));
  // Initialize in-memory knowledge DB for this repoRoot
  openKnowledgeDb(repoRoot, { inMemory: true });
});

afterEach(async () => {
  closeKnowledgeDb();
  await rm(repoRoot, { recursive: true, force: true });
});

/** Helper: create a file in the temp repo's docs/ directory */
async function createDocFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(repoRoot, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Empty / missing docs directory
// ---------------------------------------------------------------------------

describe('indexDocs - empty and missing', () => {
  it('returns zero stats when docs/ directory does not exist', async () => {
    const result = await indexDocs(repoRoot);
    expect(result.filesIndexed).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.chunksCreated).toBe(0);
    expect(result.chunksDeleted).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns zero stats when docs/ directory is empty', async () => {
    await mkdir(join(repoRoot, 'docs'), { recursive: true });
    const result = await indexDocs(repoRoot);
    expect(result.filesIndexed).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.chunksCreated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Basic indexing
// ---------------------------------------------------------------------------

describe('indexDocs - basic indexing', () => {
  it('indexes supported files and returns correct stats', async () => {
    await createDocFile('docs/README.md', '# README\n\nSome content here.');
    await createDocFile('docs/guide.txt', 'A plain text guide.');

    const result = await indexDocs(repoRoot);

    expect(result.filesIndexed).toBe(2);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stores chunks in the knowledge database', async () => {
    await createDocFile('docs/api.md', '# API Docs\n\nEndpoint details.');

    await indexDocs(repoRoot);

    const paths = getIndexedFilePaths(repoRoot);
    expect(paths).toContain('docs/api.md');
  });

  it('updates last index time after indexing', async () => {
    await createDocFile('docs/notes.md', '# Notes\n\nSome notes.');

    const before = getLastIndexTime(repoRoot);
    expect(before).toBeNull();

    await indexDocs(repoRoot);

    const after = getLastIndexTime(repoRoot);
    expect(after).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unsupported file extensions
// ---------------------------------------------------------------------------

describe('indexDocs - file filtering', () => {
  it('ignores unsupported file extensions', async () => {
    await createDocFile('docs/image.png', 'fake png data');
    await createDocFile('docs/archive.zip', 'fake zip data');
    await createDocFile('docs/readme.md', '# Hello');

    const result = await indexDocs(repoRoot);

    expect(result.filesIndexed).toBe(1);
    // Only readme.md should be indexed
    const paths = getIndexedFilePaths(repoRoot);
    expect(paths).toContain('docs/readme.md');
    expect(paths).not.toContain('docs/image.png');
  });
});

// ---------------------------------------------------------------------------
// Nested directories
// ---------------------------------------------------------------------------

describe('indexDocs - nested directories', () => {
  it('recursively finds files in nested directories', async () => {
    await createDocFile('docs/top.md', '# Top');
    await createDocFile('docs/sub/nested.md', '# Nested');
    await createDocFile('docs/sub/deep/deep.txt', 'Deep content.');

    const result = await indexDocs(repoRoot);

    expect(result.filesIndexed).toBe(3);
    const paths = getIndexedFilePaths(repoRoot);
    expect(paths).toContain('docs/top.md');
    expect(paths).toContain('docs/sub/nested.md');
    expect(paths).toContain('docs/sub/deep/deep.txt');
  });
});

// ---------------------------------------------------------------------------
// Incremental indexing (cache via file hash)
// ---------------------------------------------------------------------------

describe('indexDocs - incremental', () => {
  it('skips unchanged files on re-index', async () => {
    await createDocFile('docs/stable.md', '# Stable Content');

    const first = await indexDocs(repoRoot);
    expect(first.filesIndexed).toBe(1);
    expect(first.filesSkipped).toBe(0);

    const second = await indexDocs(repoRoot);
    expect(second.filesSkipped).toBe(1);
    expect(second.filesIndexed).toBe(0);
  });

  it('re-indexes files that changed', async () => {
    await createDocFile('docs/changing.md', '# Version 1');

    await indexDocs(repoRoot);

    // Modify the file
    await createDocFile('docs/changing.md', '# Version 2 - Updated');

    const result = await indexDocs(repoRoot);
    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Force re-index
// ---------------------------------------------------------------------------

describe('indexDocs - force', () => {
  it('re-indexes all files when force=true', async () => {
    await createDocFile('docs/stable.md', '# Stable');

    await indexDocs(repoRoot);

    const result = await indexDocs(repoRoot, { force: true });
    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stale file deletion
// ---------------------------------------------------------------------------

describe('indexDocs - stale file deletion', () => {
  it('removes chunks for deleted files', async () => {
    await createDocFile('docs/keep.md', '# Keep');
    await createDocFile('docs/remove.md', '# Remove');

    await indexDocs(repoRoot);

    const pathsBefore = getIndexedFilePaths(repoRoot);
    expect(pathsBefore).toContain('docs/remove.md');

    // Delete the file from disk
    await rm(join(repoRoot, 'docs/remove.md'));

    const result = await indexDocs(repoRoot);
    expect(result.chunksDeleted).toBeGreaterThan(0);

    const pathsAfter = getIndexedFilePaths(repoRoot);
    expect(pathsAfter).not.toContain('docs/remove.md');
    expect(pathsAfter).toContain('docs/keep.md');
  });
});

// ---------------------------------------------------------------------------
// Custom docsDir
// ---------------------------------------------------------------------------

describe('indexDocs - custom docsDir', () => {
  it('indexes a custom directory instead of docs/', async () => {
    await createDocFile('knowledge/guide.md', '# Guide');

    const result = await indexDocs(repoRoot, { docsDir: 'knowledge' });

    expect(result.filesIndexed).toBe(1);
    const paths = getIndexedFilePaths(repoRoot);
    expect(paths).toContain('knowledge/guide.md');
  });
});

// ---------------------------------------------------------------------------
// IndexResult type
// ---------------------------------------------------------------------------

describe('IndexResult shape', () => {
  it('has all required fields', async () => {
    await createDocFile('docs/test.md', '# Test');
    const result: IndexResult = await indexDocs(repoRoot);

    expect(typeof result.filesIndexed).toBe('number');
    expect(typeof result.filesSkipped).toBe('number');
    expect(typeof result.chunksCreated).toBe('number');
    expect(typeof result.chunksDeleted).toBe('number');
    expect(typeof result.chunksEmbedded).toBe('number');
    expect(typeof result.durationMs).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Embed option
// ---------------------------------------------------------------------------

describe('indexDocs - embed option', () => {
  it('returns chunksEmbedded: 0 when embed option is absent', async () => {
    await createDocFile('docs/readme.md', '# Hello\n\nSome content.');
    const result = await indexDocs(repoRoot);
    expect(result.chunksEmbedded).toBe(0);
  });

  it('returns chunksEmbedded: 0 when embed option is false', async () => {
    await createDocFile('docs/readme.md', '# Hello\n\nSome content.');
    const result = await indexDocs(repoRoot, { embed: false });
    expect(result.chunksEmbedded).toBe(0);
  });

  it('returns chunksEmbedded: 0 when embed requested but model unavailable', async () => {
    // Mock isModelUsable to return unavailable
    const modelModule = await import('../embeddings/model.js');
    const spy = vi.spyOn(modelModule, 'isModelUsable').mockResolvedValue({
      usable: false,
      reason: 'Model file not found',
      action: 'Run ca download-model',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await createDocFile('docs/readme.md', '# Hello\n\nSome content.');
    const result = await indexDocs(repoRoot, { embed: true });

    expect(result.chunksEmbedded).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Embedding skipped'),
    );

    spy.mockRestore();
    warnSpy.mockRestore();
  });
});
