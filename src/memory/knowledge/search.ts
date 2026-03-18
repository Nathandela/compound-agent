/**
 * Knowledge chunk search: vector similarity and hybrid (vector + FTS5).
 */

import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import type { GenericScoredItem } from '../search/hybrid.js';
import { openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { searchChunksKeywordScored } from '../storage/sqlite-knowledge/search.js';
import { embedText, isModelUsable } from '../embeddings/index.js';
import { cosineSimilarity } from '../search/vector.js';
import { mergeHybridScores, CANDIDATE_MULTIPLIER, MIN_HYBRID_SCORE } from '../search/hybrid.js';

export interface KnowledgeSearchOptions {
  limit?: number;
}

const DEFAULT_KNOWLEDGE_LIMIT = 6;

/** Lightweight row for phase-1 similarity scoring (no text payload) */
interface EmbeddingRow {
  id: string;
  embedding: Buffer;
}

/** Full row for phase-2 hydration of top-k results */
interface ChunkDataRow {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content_hash: string;
  text: string;
  model: string | null;
  updated_at: string;
}

/**
 * Vector search over knowledge chunks (two-phase for memory efficiency).
 *
 * Phase 1: Load only IDs + embeddings, compute similarity, select top-k.
 * Phase 2: Hydrate full chunk data for top-k results only.
 */
export async function searchKnowledgeVector(
  repoRoot: string,
  query: string,
  options?: KnowledgeSearchOptions
): Promise<GenericScoredItem<KnowledgeChunk>[]> {
  const limit = options?.limit ?? DEFAULT_KNOWLEDGE_LIMIT;
  const database = openKnowledgeDb(repoRoot);

  // Phase 1: IDs + embeddings only (avoids loading all text into memory)
  const embRows = database
    .prepare('SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL')
    .all() as EmbeddingRow[];

  if (embRows.length === 0) return [];

  const queryVector = await embedText(query);

  const scored: { id: string; score: number }[] = [];
  for (const row of embRows) {
    const embFloat = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    scored.push({ id: row.id, score: cosineSimilarity(queryVector, embFloat) });
  }

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, limit);
  if (topK.length === 0) return [];

  // Phase 2: Hydrate full data for top-k only
  // Safe: placeholders is a string of '?' characters, not user input
  const placeholders = topK.map(() => '?').join(',');
  const sql = `SELECT id, file_path, start_line, end_line, content_hash, text, model, updated_at FROM chunks WHERE id IN (${placeholders})`;
  const dataRows = database
    .prepare(sql)
    .all(...topK.map((r) => r.id)) as ChunkDataRow[];

  const dataMap = new Map(dataRows.map((r) => [r.id, r]));
  const results: GenericScoredItem<KnowledgeChunk>[] = [];

  for (const { id, score } of topK) {
    const row = dataMap.get(id);
    if (!row) continue;
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
    results.push({ item: chunk, score });
  }

  return results;
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
