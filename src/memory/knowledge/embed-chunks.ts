/**
 * Core embedding function for knowledge chunks.
 *
 * Embeds unembedded (or all) knowledge chunks using the local embedding model.
 * Uses batch embedding and transactional writes for performance.
 */

import { embedTexts } from '../embeddings/nomic.js';
import { openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';

const BATCH_SIZE = 16;

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
 * Processes chunks in batches of BATCH_SIZE for efficient embedding and
 * wraps each batch's DB writes in a transaction (1 fsync per batch).
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

  // Count already-embedded chunks for reporting
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
  const chunksSkipped = totalRow.count - rows.length;

  let chunksEmbedded = 0;

  const updateStmt = db.prepare(
    'UPDATE chunks SET embedding = ?, content_hash = ? WHERE id = ?'
  );
  const writeBatch = db.transaction((batch: Array<{ id: string; content_hash: string; vector: number[] }>) => {
    for (const item of batch) {
      const float32 = new Float32Array(item.vector);
      const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);
      updateStmt.run(buffer, item.content_hash, item.id);
    }
  });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map(r => r.text);
    const vectors = await embedTexts(texts);
    if (vectors.length !== texts.length) {
      throw new Error(`embedTexts returned ${vectors.length} vectors for ${texts.length} inputs`);
    }
    const enriched = batch.map((r, j) => ({ ...r, vector: vectors[j]! }));
    writeBatch(enriched);
    chunksEmbedded += batch.length;
  }

  return {
    chunksEmbedded,
    chunksSkipped,
    durationMs: Date.now() - start,
  };
}
