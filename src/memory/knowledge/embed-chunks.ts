/**
 * Core embedding function for knowledge chunks.
 *
 * Embeds unembedded (or all) knowledge chunks using the local embedding model.
 */

import { embedText } from '../embeddings/nomic.js';
import { setCachedChunkEmbedding } from '../storage/sqlite-knowledge/cache.js';
import { openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';

export interface EmbedChunksOptions {
  /** Only embed chunks with no embedding (default: true) */
  onlyMissing?: boolean;
}

export interface EmbedChunksResult {
  chunksEmbedded: number;
  chunksSkipped: number;
  durationMs: number;
}

/**
 * Count chunks that have no embedding stored.
 * @param repoRoot - Absolute path to repository root
 */
export function getUnembeddedChunkCount(repoRoot: string): number {
  const db = openKnowledgeDb(repoRoot);
  const row = db
    .prepare('SELECT COUNT(*) as count FROM chunks WHERE embedding IS NULL')
    .get() as { count: number };
  return row.count;
}

/**
 * Embed knowledge chunks using the local embedding model.
 *
 * @param repoRoot - Absolute path to repository root
 * @param options - Embedding options
 * @returns Stats about the embedding run
 */
export async function embedChunks(
  repoRoot: string,
  options?: EmbedChunksOptions
): Promise<EmbedChunksResult> {
  const start = Date.now();
  const onlyMissing = options?.onlyMissing ?? true;
  const db = openKnowledgeDb(repoRoot);

  const query = onlyMissing
    ? 'SELECT id, text, content_hash FROM chunks WHERE embedding IS NULL'
    : 'SELECT id, text, content_hash FROM chunks';
  const rows = db
    .prepare(query)
    .all() as Array<{ id: string; text: string; content_hash: string }>;

  let chunksEmbedded = 0;

  for (const row of rows) {
    const vector = await embedText(row.text);
    setCachedChunkEmbedding(repoRoot, row.id, new Float32Array(vector), row.content_hash);
    chunksEmbedded++;
  }

  return {
    chunksEmbedded,
    chunksSkipped: 0,
    durationMs: Date.now() - start,
  };
}
