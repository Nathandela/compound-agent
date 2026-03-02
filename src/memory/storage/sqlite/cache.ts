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

/** Entry returned by getCachedEmbeddingsBulk */
export interface CachedEmbeddingEntry {
  vector: number[];
  hash: string;
}

/**
 * Bulk-read all cached embeddings in a single query.
 * Returns a Map of lessonId to {vector, hash} for every lesson
 * that has a cached embedding and content_hash.
 * Callers validate the hash themselves.
 */
export function getCachedEmbeddingsBulk(repoRoot: string): Map<string, CachedEmbeddingEntry> {
  const database = openDb(repoRoot);
  const rows = database
    .prepare('SELECT id, embedding, content_hash FROM lessons WHERE embedding IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer; content_hash: string | null }>;

  const result = new Map<string, CachedEmbeddingEntry>();
  for (const row of rows) {
    if (!row.content_hash) continue;
    const float32 = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    result.set(row.id, { vector: Array.from(float32), hash: row.content_hash });
  }
  return result;
}

/**
 * Get cached insight-only embedding for a lesson.
 * Used by findSimilarLessons (insight-only hash, separate from searchVector's trigger+insight hash).
 */
export function getCachedInsightEmbedding(
  repoRoot: string,
  lessonId: string,
  expectedHash?: string
): number[] | null {
  const database = openDb(repoRoot);

  const row = database
    .prepare('SELECT embedding_insight, content_hash_insight FROM lessons WHERE id = ?')
    .get(lessonId) as { embedding_insight: Buffer | null; content_hash_insight: string | null } | undefined;

  if (!row || !row.embedding_insight || !row.content_hash_insight) {
    return null;
  }

  if (expectedHash && row.content_hash_insight !== expectedHash) {
    return null;
  }

  const float32 = new Float32Array(
    row.embedding_insight.buffer,
    row.embedding_insight.byteOffset,
    row.embedding_insight.byteLength / 4
  );
  return Array.from(float32);
}

/**
 * Cache insight-only embedding for a lesson in SQLite.
 * Uses UPDATE-only — the row must already exist.
 */
export function setCachedInsightEmbedding(
  repoRoot: string,
  lessonId: string,
  embedding: Float32Array | number[],
  hash: string
): void {
  const database = openDb(repoRoot);

  const float32 = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  database
    .prepare('UPDATE lessons SET embedding_insight = ?, content_hash_insight = ? WHERE id = ?')
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
    .prepare('SELECT id, embedding, content_hash, embedding_insight, content_hash_insight FROM lessons WHERE embedding IS NOT NULL OR embedding_insight IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer | null; content_hash: string | null; embedding_insight: Buffer | null; content_hash_insight: string | null }>;

  for (const row of rows) {
    if (row.embedding && row.content_hash) {
      cache.set(row.id, {
        embedding: row.embedding,
        contentHash: row.content_hash,
        embeddingInsight: row.embedding_insight,
        contentHashInsight: row.content_hash_insight,
      });
    } else if (row.embedding_insight && row.content_hash_insight) {
      // Only insight cache exists — still worth preserving
      cache.set(row.id, {
        embedding: row.embedding_insight, // placeholder, won't match hash
        contentHash: '',
        embeddingInsight: row.embedding_insight,
        contentHashInsight: row.content_hash_insight,
      });
    }
  }
  return cache;
}
