/**
 * Vector search with cosine similarity
 *
 * Embeds query text and ranks lessons by semantic similarity.
 * Uses SQLite cache to avoid recomputing embeddings.
 */

import { embedText } from '../embeddings/index.js';
import { contentHash, getCachedEmbedding, readMemoryItems, setCachedEmbedding } from '../storage/index.js';
import type { MemoryItem } from '../types.js';

/**
 * Calculate cosine similarity between two vectors.
 * Returns value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Memory item with similarity score.
 * The `lesson` field holds any MemoryItem type (not just Lesson).
 * Field name kept for backward compatibility.
 */
export interface ScoredLesson {
  lesson: MemoryItem;
  score: number;
}

/** Alias for ScoredLesson for unified memory API consumers. */
export type ScoredMemoryItem = ScoredLesson;

/** Options for vector search */
export interface SearchVectorOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
}

/** Default number of results to return */
const DEFAULT_LIMIT = 10;

/**
 * Search lessons by vector similarity to query text.
 * Returns top N lessons sorted by similarity score (descending).
 * Uses embedding cache to avoid recomputing embeddings.
 */
export async function searchVector(
  repoRoot: string,
  query: string,
  options?: SearchVectorOptions
): Promise<ScoredLesson[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  // Read all memory items (all types)
  const { items } = await readMemoryItems(repoRoot);
  if (items.length === 0) return [];

  // Embed the query
  const queryVector = await embedText(query);

  // Score each item, skipping invalidated ones
  const scored: ScoredLesson[] = [];
  for (const item of items) {
    // Skip invalidated items
    if (item.invalidatedAt) continue;

    try {
      const itemText = `${item.trigger} ${item.insight}`;
      const hash = contentHash(item.trigger, item.insight);

      // Try cache first
      let itemVector = getCachedEmbedding(repoRoot, item.id, hash);

      if (!itemVector) {
        // Cache miss - compute and store
        itemVector = await embedText(itemText);
        setCachedEmbedding(repoRoot, item.id, itemVector, hash);
      }

      const score = cosineSimilarity(queryVector, itemVector);
      scored.push({ lesson: item, score });
    } catch {
      // Skip items that fail embedding — return partial results
      continue;
    }
  }

  // Sort by score descending and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
