/**
 * Knowledge chunk sync operations: upsert, delete, metadata tracking.
 */

import type { KnowledgeChunk } from './types.js';
import { openKnowledgeDb } from './connection.js';

/**
 * Upsert chunks into the knowledge database.
 * Uses INSERT OR REPLACE for conflict resolution on id.
 * @param repoRoot - Absolute path to repository root
 * @param chunks - Chunks to upsert
 * @param embeddings - Optional map of chunk ID to embedding vector
 */
export function upsertChunks(
  repoRoot: string,
  chunks: KnowledgeChunk[],
  embeddings?: Map<string, Float32Array>
): void {
  if (chunks.length === 0) return;

  const database = openKnowledgeDb(repoRoot);

  const insert = database.prepare(`
    INSERT OR REPLACE INTO chunks (id, file_path, start_line, end_line, content_hash, text, embedding, model, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertMany = database.transaction((items: KnowledgeChunk[]) => {
    for (const chunk of items) {
      const emb = embeddings?.get(chunk.id);
      const embBuffer = emb
        ? Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength)
        : null;

      insert.run(
        chunk.id,
        chunk.filePath,
        chunk.startLine,
        chunk.endLine,
        chunk.contentHash,
        chunk.text,
        embBuffer,
        chunk.model ?? null,
        chunk.updatedAt
      );
    }
  });

  upsertMany(chunks);
}

/**
 * Delete all chunks for the given file paths.
 * @param repoRoot - Absolute path to repository root
 * @param filePaths - File paths whose chunks should be removed
 */
export function deleteChunksByFilePath(repoRoot: string, filePaths: string[]): void {
  if (filePaths.length === 0) return;

  const database = openKnowledgeDb(repoRoot);

  const del = database.prepare('DELETE FROM chunks WHERE file_path = ?');

  const deleteMany = database.transaction((paths: string[]) => {
    for (const path of paths) {
      del.run(path);
    }
  });

  deleteMany(filePaths);
}

/**
 * Get all distinct file paths currently indexed in the knowledge database.
 * @param repoRoot - Absolute path to repository root
 * @returns Array of file paths
 */
export function getIndexedFilePaths(repoRoot: string): string[] {
  const database = openKnowledgeDb(repoRoot);

  const rows = database
    .prepare('SELECT DISTINCT file_path FROM chunks')
    .all() as Array<{ file_path: string }>;

  return rows.map((r) => r.file_path);
}

/**
 * Get the last index time from metadata.
 * @param repoRoot - Absolute path to repository root
 * @returns ISO timestamp or null if never indexed
 */
export function getLastIndexTime(repoRoot: string): string | null {
  const database = openKnowledgeDb(repoRoot);

  const row = database
    .prepare("SELECT value FROM metadata WHERE key = 'last_index_time'")
    .get() as { value: string } | undefined;

  return row?.value ?? null;
}

/**
 * Set the last index time in metadata.
 * @param repoRoot - Absolute path to repository root
 * @param time - ISO timestamp
 */
export function setLastIndexTime(repoRoot: string, time: string): void {
  const database = openKnowledgeDb(repoRoot);

  database
    .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_index_time', ?)")
    .run(time);
}
