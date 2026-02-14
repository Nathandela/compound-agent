/**
 * Embedding cache operations for SQLite storage.
 */

import { createHash } from 'node:crypto';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { CachedEmbeddingData } from './types.js';
import { openDb } from './connection.js';

/**
 * Compute content hash for a lesson's trigger and insight.
 * Used to detect content changes for embedding cache invalidation.
 * @param trigger - The lesson trigger text
 * @param insight - The lesson insight text
 * @returns SHA-256 hash of the combined content
 */
export function contentHash(trigger: string, insight: string): string {
  return createHash('sha256').update(`${trigger} ${insight}`).digest('hex');
}

/**
 * Get cached embedding for a lesson.
 * @param repoRoot - Absolute path to repository root
 * @param lessonId - ID of the lesson
 * @param expectedHash - Optional content hash to validate cache freshness
 * @returns Embedding array or null if not cached
 */
export function getCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  expectedHash?: string
): number[] | null {
  const database = openDb(repoRoot);

  const row = database
    .prepare('SELECT embedding, content_hash FROM lessons WHERE id = ?')
    .get(lessonId) as { embedding: Buffer | null; content_hash: string | null } | undefined;

  if (!row || !row.embedding || !row.content_hash) {
    return null;
  }

  if (expectedHash && row.content_hash !== expectedHash) {
    return null;
  }

  const float32 = new Float32Array(
    row.embedding.buffer,
    row.embedding.byteOffset,
    row.embedding.byteLength / 4
  );
  return Array.from(float32);
}

/**
 * Cache embedding for a lesson in SQLite.
 *
 * Uses UPDATE-only (not INSERT) — the row must already exist in the
 * lessons table. If the row hasn't been synced from JSONL yet, the
 * write is a silent no-op and the embedding will be recomputed on
 * next access. This is by-design: the cache is an optional
 * optimization, not the source of truth.
 *
 * @param repoRoot - Absolute path to repository root
 * @param lessonId - ID of the lesson
 * @param embedding - Embedding vector (Float32Array or number array)
 * @param hash - Content hash for cache validation
 */
export function setCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  embedding: Float32Array | number[],
  hash: string
): void {
  const database = openDb(repoRoot);

  const float32 = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  database
    .prepare('UPDATE lessons SET embedding = ?, content_hash = ? WHERE id = ?')
    .run(buffer, hash, lessonId);
}

/**
 * Collect all cached embeddings from the database.
 * Used during index rebuild to preserve valid caches.
 * @param database - SQLite database instance
 * @returns Map of lesson ID to cached embedding data
 */
export function collectCachedEmbeddings(database: DatabaseType): Map<string, CachedEmbeddingData> {
  const cache = new Map<string, CachedEmbeddingData>();
  const rows = database
    .prepare('SELECT id, embedding, content_hash FROM lessons WHERE embedding IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer; content_hash: string | null }>;

  for (const row of rows) {
    if (row.embedding && row.content_hash) {
      cache.set(row.id, { embedding: row.embedding, contentHash: row.content_hash });
    }
  }
  return cache;
}
