/**
 * Hybrid search: BM25 normalization and result merging.
 *
 * Combines vector similarity (cosine) with FTS5 keyword matching (BM25)
 * into a single blended score for improved retrieval quality.
 */

import type { MemoryItem } from '../types.js';
import type { ScoredLesson } from './vector.js';

/** Generic scored item for hybrid merge */
export interface GenericScoredItem<T> {
  item: T;
  score: number;
}

/** Keyword search result with normalized BM25 score */
export interface ScoredKeywordResult {
  lesson: MemoryItem;
  /** BM25 rank normalized to 0-1 */
  score: number;
}

/** Options for hybrid merge */
export interface HybridMergeOptions {
  vectorWeight?: number;
  textWeight?: number;
  limit?: number;
  /** Filter results below this blended score */
  minScore?: number;
}

export const DEFAULT_VECTOR_WEIGHT = 0.7;
export const DEFAULT_TEXT_WEIGHT = 0.3;
export const CANDIDATE_MULTIPLIER = 4;
export const MIN_HYBRID_SCORE = 0.35;

/**
 * Normalize FTS5 BM25 rank to a 0-1 score.
 *
 * FTS5 ranks are negative (lower = more relevant).
 * Uses: |rank| / (1 + |rank|) so that more negative ranks
 * (more relevant) produce higher scores, making keyword
 * matches meaningful in the hybrid blend.
 *
 * Examples: -10 -> ~0.909, -1 -> 0.5, 0 -> 0, NaN -> 0
 */
export function normalizeBm25Rank(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  const abs = Math.abs(rank);
  return abs / (1 + abs);
}

/**
 * Generic hybrid merge that works with any item type.
 * Requires an getId function to identify unique items for union.
 *
 * Algorithm:
 * 1. Normalize weights to sum to 1.0
 * 2. Union both result sets by item ID
 * 3. Blend: score = vecW * vectorScore + txtW * textScore (missing source = 0)
 * 4. Sort descending by blended score
 */
export function mergeHybridScores<T>(
  vectorResults: GenericScoredItem<T>[],
  keywordResults: GenericScoredItem<T>[],
  getId: (item: T) => string,
  options?: HybridMergeOptions
): GenericScoredItem<T>[] {
  if (vectorResults.length === 0 && keywordResults.length === 0) return [];

  const rawVecW = options?.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const rawTxtW = options?.textWeight ?? DEFAULT_TEXT_WEIGHT;
  const total = rawVecW + rawTxtW;
  if (total <= 0) return [];
  const vecW = rawVecW / total;
  const txtW = rawTxtW / total;
  const limit = options?.limit;
  const minScore = options?.minScore;

  // Union by item ID
  const merged = new Map<string, { item: T; vecScore: number; txtScore: number }>();

  for (const v of vectorResults) {
    merged.set(getId(v.item), { item: v.item, vecScore: v.score, txtScore: 0 });
  }

  for (const k of keywordResults) {
    const id = getId(k.item);
    const existing = merged.get(id);
    if (existing) {
      existing.txtScore = k.score;
    } else {
      merged.set(id, { item: k.item, vecScore: 0, txtScore: k.score });
    }
  }

  // Blend and sort
  const results: GenericScoredItem<T>[] = [];
  for (const entry of merged.values()) {
    results.push({
      item: entry.item,
      score: vecW * entry.vecScore + txtW * entry.txtScore,
    });
  }

  results.sort((a, b) => b.score - a.score);

  const filtered = minScore !== undefined ? results.filter((r) => r.score >= minScore) : results;
  return limit !== undefined ? filtered.slice(0, limit) : filtered;
}

/**
 * Merge vector and keyword search results into a single ranked list.
 * Delegates to the generic mergeHybridScores.
 */
export function mergeHybridResults(
  vectorResults: ScoredLesson[],
  keywordResults: ScoredKeywordResult[],
  options?: HybridMergeOptions
): ScoredLesson[] {
  const genericVec = vectorResults.map((v) => ({ item: v.lesson, score: v.score }));
  const genericKw = keywordResults.map((k) => ({ item: k.lesson, score: k.score }));
  const merged = mergeHybridScores(genericVec, genericKw, (item) => item.id, options);
  return merged.map((m) => ({ lesson: m.item, score: m.score }));
}
