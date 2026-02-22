/**
 * Knowledge indexing pipeline.
 *
 * Walks a docs directory, chunks files, embeds chunks (if model available),
 * and stores in the knowledge SQLite database.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

import {
  openKnowledgeDb,
} from '../storage/sqlite-knowledge/connection.js';
import {
  upsertChunks,
  deleteChunksByFilePath,
  getIndexedFilePaths,
  setLastIndexTime,
} from '../storage/sqlite-knowledge/sync.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';

import { chunkFile } from './chunking.js';
import { SUPPORTED_EXTENSIONS } from './types.js';

export interface IndexOptions {
  /** Force re-index all files (ignore cache) */
  force?: boolean;
  /** Directory to index (default: 'docs') */
  docsDir?: string;
}

export interface IndexResult {
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  chunksDeleted: number;
  durationMs: number;
}

/** Compute SHA-256 hash of file content for change detection */
function fileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Build metadata key for file hash */
function fileHashKey(relativePath: string): string {
  return 'file_hash:' + relativePath;
}

/** Get stored file hash from metadata table */
function getStoredFileHash(repoRoot: string, relativePath: string): string | null {
  const db = openKnowledgeDb(repoRoot);
  const row = db
    .prepare('SELECT value FROM metadata WHERE key = ?')
    .get(fileHashKey(relativePath)) as { value: string } | undefined;
  return row?.value ?? null;
}

/** Store file hash in metadata table */
function setFileHash(repoRoot: string, relativePath: string, hash: string): void {
  const db = openKnowledgeDb(repoRoot);
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
    .run(fileHashKey(relativePath), hash);
}

/** Remove file hash from metadata table */
function removeFileHash(repoRoot: string, relativePath: string): void {
  const db = openKnowledgeDb(repoRoot);
  db.prepare('DELETE FROM metadata WHERE key = ?').run(fileHashKey(relativePath));
}

/** Recursively walk directory and return relative paths of supported files */
async function walkSupportedFiles(baseDir: string, repoRoot: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(baseDir, { recursive: true, withFileTypes: true });
  } catch {
    // Directory doesn't exist or can't be read
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    // Build the full path. With recursive readdir, parentPath gives
    // the directory containing the entry.
    const fullPath = join(entry.parentPath ?? entry.path, entry.name);
    const relPath = relative(repoRoot, fullPath);
    results.push(relPath);
  }

  return results;
}

/**
 * Index documentation files into the knowledge database.
 *
 * @param repoRoot - Absolute path to repository root
 * @param options - Indexing options
 * @returns Statistics about the indexing operation
 */
export async function indexDocs(
  repoRoot: string,
  options: IndexOptions = {},
): Promise<IndexResult> {
  const start = Date.now();
  const docsDir = options.docsDir ?? 'docs';
  const force = options.force ?? false;

  const stats: IndexResult = {
    filesIndexed: 0,
    filesSkipped: 0,
    chunksCreated: 0,
    chunksDeleted: 0,
    durationMs: 0,
  };

  const docsPath = join(repoRoot, docsDir);
  const filePaths = await walkSupportedFiles(docsPath, repoRoot);

  // Process each file
  for (const relPath of filePaths) {
    const fullPath = join(repoRoot, relPath);
    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const hash = fileHash(content);
    const storedHash = getStoredFileHash(repoRoot, relPath);

    // Skip if unchanged and not forced
    if (!force && storedHash === hash) {
      stats.filesSkipped++;
      continue;
    }

    // Chunk the file
    const chunks = chunkFile(relPath, content);

    // Convert to KnowledgeChunk format
    const now = new Date().toISOString();
    const knowledgeChunks: KnowledgeChunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      contentHash: chunk.contentHash,
      text: chunk.text,
      updatedAt: now,
    }));

    // Delete stale chunks for this file before inserting new ones
    deleteChunksByFilePath(repoRoot, [relPath]);

    // Upsert chunks (no embeddings for now -- embedding is slow and optional)
    if (knowledgeChunks.length > 0) {
      upsertChunks(repoRoot, knowledgeChunks);
    }

    // Update file hash
    setFileHash(repoRoot, relPath, hash);

    stats.filesIndexed++;
    stats.chunksCreated += knowledgeChunks.length;
  }

  // Clean up stale files: find DB paths not in current file set
  const indexedPaths = getIndexedFilePaths(repoRoot);
  const currentPathSet = new Set(filePaths);
  const stalePaths = indexedPaths.filter((p) => !currentPathSet.has(p));

  if (stalePaths.length > 0) {
    // Count chunks that will be deleted
    const db = openKnowledgeDb(repoRoot);
    for (const path of stalePaths) {
      const row = db
        .prepare('SELECT COUNT(*) as cnt FROM chunks WHERE file_path = ?')
        .get(path) as { cnt: number };
      stats.chunksDeleted += row.cnt;
    }

    deleteChunksByFilePath(repoRoot, stalePaths);

    // Clean up file hashes for stale files
    for (const path of stalePaths) {
      removeFileHash(repoRoot, path);
    }
  }

  // Update last index time
  setLastIndexTime(repoRoot, new Date().toISOString());

  stats.durationMs = Date.now() - start;
  return stats;
}
