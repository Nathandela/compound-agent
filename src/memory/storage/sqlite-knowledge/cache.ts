/**
 * Embedding cache operations for knowledge chunks.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

import type { CachedEmbeddingData } from '../sqlite/types.js';
import { openKnowledgeDb } from './connection.js';
import { chunkContentHash } from '../../knowledge/types.js';

export { chunkContentHash };

/**
 * Get cached embedding for a knowledge chunk.
 * @param repoRoot - Absolute path to repository root
 * @param chunkId - ID of the chunk
 * @param expectedHash - Optional content hash to validate cache freshness
 * @returns Float32Array embedding or null if not cached
 */
export function getCachedChunkEmbedding(
  repoRoot: string,
  chunkId: string,
  expectedHash?: string
): Float32Array | null {
  const database = openKnowledgeDb(repoRoot);

  const row = database
    .prepare('SELECT embedding, content_hash FROM chunks WHERE id = ?')
    .get(chunkId) as { embedding: Buffer | null; content_hash: string | null } | undefined;

  if (!row || !row.embedding || !row.content_hash) {
    return null;
  }

  if (expectedHash && row.content_hash !== expectedHash) {
    return null;
  }

  return new Float32Array(
    row.embedding.buffer,
    row.embedding.byteOffset,
    row.embedding.byteLength / 4
  );
}

/**
 * Cache embedding for a knowledge chunk (UPDATE-only).
 * The chunk row must already exist. If it doesn't, this is a silent no-op.
 * @param repoRoot - Absolute path to repository root
 * @param chunkId - ID of the chunk
 * @param embedding - Embedding vector
 * @param hash - Content hash for cache validation
 */
export function setCachedChunkEmbedding(
  repoRoot: string,
  chunkId: string,
  embedding: Float32Array | number[],
  hash: string
): void {
  const database = openKnowledgeDb(repoRoot);

  const float32 = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  database
    .prepare('UPDATE chunks SET embedding = ?, content_hash = ? WHERE id = ?')
    .run(buffer, hash, chunkId);
}

/**
 * Collect all cached chunk embeddings from the database.
 * @param database - SQLite database instance
 * @returns Map of chunk ID to cached embedding data
 */
export function collectCachedChunkEmbeddings(
  database: DatabaseType
): Map<string, CachedEmbeddingData> {
  const cache = new Map<string, CachedEmbeddingData>();
  const rows = database
    .prepare('SELECT id, embedding, content_hash FROM chunks WHERE embedding IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer; content_hash: string | null }>;

  for (const row of rows) {
    if (row.embedding && row.content_hash) {
      cache.set(row.id, { embedding: row.embedding, contentHash: row.content_hash });
    }
  }
  return cache;
}
