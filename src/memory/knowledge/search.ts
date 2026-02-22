/**
 * Knowledge chunk search: vector similarity and hybrid (vector + FTS5).
 */

import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import type { GenericScoredItem } from '../search/hybrid.js';
import { openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { searchChunksKeywordScored } from '../storage/sqlite-knowledge/search.js';
import { embedText } from '../embeddings/nomic.js';
import { cosineSimilarity } from '../search/vector.js';
import { mergeHybridScores, CANDIDATE_MULTIPLIER, MIN_HYBRID_SCORE } from '../search/hybrid.js';
import { isModelUsable } from '../embeddings/model.js';

export interface KnowledgeSearchOptions {
  limit?: number;
}

const DEFAULT_KNOWLEDGE_LIMIT = 6;

/** Internal row type for chunks with embeddings */
interface ChunkWithEmbedding {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content_hash: string;
  text: string;
  model: string | null;
  updated_at: string;
  embedding: Buffer;
}

/**
 * Vector search over knowledge chunks.
 * Embeds query, compares against all chunk embeddings.
 */
export async function searchKnowledgeVector(
  repoRoot: string,
  query: string,
  options?: KnowledgeSearchOptions
): Promise<GenericScoredItem<KnowledgeChunk>[]> {
  const limit = options?.limit ?? DEFAULT_KNOWLEDGE_LIMIT;
  const database = openKnowledgeDb(repoRoot);

  // Get all chunks with embeddings
  const rows = database
    .prepare('SELECT id, file_path, start_line, end_line, content_hash, text, model, updated_at, embedding FROM chunks WHERE embedding IS NOT NULL')
    .all() as ChunkWithEmbedding[];

  if (rows.length === 0) return [];

  const queryVector = await embedText(query);

  const scored: GenericScoredItem<KnowledgeChunk>[] = [];
  for (const row of rows) {
    const embFloat = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );

    const score = cosineSimilarity(queryVector, embFloat);
    const chunk: KnowledgeChunk = {
      id: row.id,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      contentHash: row.content_hash,
      text: row.text,
      updatedAt: row.updated_at,
    };
    if (row.model !== null) {
      chunk.model = row.model;
    }
    scored.push({ item: chunk, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Hybrid search combining vector + FTS5 keyword on knowledge.sqlite.
 *
 * When embedding model is usable: parallel vector + keyword search, merged.
 * When model unavailable: FTS5-only fallback.
 */
export async function searchKnowledge(
  repoRoot: string,
  query: string,
  options?: KnowledgeSearchOptions
): Promise<GenericScoredItem<KnowledgeChunk>[]> {
  const limit = options?.limit ?? DEFAULT_KNOWLEDGE_LIMIT;
  const candidateLimit = limit * CANDIDATE_MULTIPLIER;

  const usability = await isModelUsable();

  if (usability.usable) {
    // Hybrid: parallel vector + keyword
    const [vectorResults, keywordResults] = await Promise.all([
      searchKnowledgeVector(repoRoot, query, { limit: candidateLimit }),
      Promise.resolve(searchChunksKeywordScored(repoRoot, query, candidateLimit)),
    ]);

    // When no embeddings stored, vector results are empty and hybrid merge
    // would suppress keyword-only results below MIN_HYBRID_SCORE. Fall back
    // to keyword results directly.
    if (vectorResults.length === 0) {
      return keywordResults
        .map((k) => ({ item: k.chunk, score: k.score }))
        .slice(0, limit);
    }

    const genericKw: GenericScoredItem<KnowledgeChunk>[] = keywordResults.map((k) => ({
      item: k.chunk,
      score: k.score,
    }));

    const merged = mergeHybridScores(
      vectorResults,
      genericKw,
      (item) => item.id,
      { limit, minScore: MIN_HYBRID_SCORE }
    );

    return merged;
  }

  // FTS-only fallback
  const keywordResults = searchChunksKeywordScored(repoRoot, query, limit);
  return keywordResults.map((k) => ({ item: k.chunk, score: k.score }));
}
