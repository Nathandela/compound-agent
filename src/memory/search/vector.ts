/**
 * Vector search with cosine similarity
 *
 * Embeds query text and ranks lessons by semantic similarity.
 * Uses SQLite cache to avoid recomputing embeddings.
 */

import { readCctPatterns, type CctPattern } from '../../compound/index.js';
import { embedText } from '../embeddings/index.js';
import { isModelAvailable } from '../embeddings/model-info.js';
import { contentHash, getCachedEmbeddingsBulk, getCachedInsightEmbedding, readAllFromSqlite, setCachedEmbedding, setCachedInsightEmbedding, syncIfNeeded } from '../storage/index.js';
import type { MemoryItem } from '../types.js';

/**
 * In-memory embedding cache for CCT patterns.
 * CCT patterns don't have rows in the SQLite lessons table,
 * so setCachedEmbedding (UPDATE-only) is a no-op for them.
 * This Map caches embeddings keyed by "id:contentHash".
 *
 * NOTE: This cache is intentionally unbounded. Compound Agent is a CLI tool
 * (one process per command), so entries are bounded by a single command's
 * lifetime. Do not use this pattern in long-running servers.
 */
const cctEmbeddingCache = new Map<string, Float32Array>();

/** Clear the CCT embedding cache. Exported for testing. */
export function clearCctEmbeddingCache(): void {
  cctEmbeddingCache.clear();
}

/**
 * Calculate cosine similarity between two vectors.
 * Returns value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
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
/**
 * Convert a CctPattern to a MemoryItem-like shape for search results.
 */
function cctToMemoryItem(pattern: CctPattern): MemoryItem {
  return {
    id: pattern.id,
    type: 'lesson',
    trigger: pattern.name,
    insight: pattern.description,
    tags: [],
    source: 'manual',
    context: { tool: 'compound', intent: 'synthesis' },
    created: pattern.created,
    confirmed: true,
    supersedes: [],
    related: pattern.sourceIds,
  };
}

export async function searchVector(
  repoRoot: string,
  query: string,
  options?: SearchVectorOptions
): Promise<ScoredLesson[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  // Ensure SQLite cache is fresh, then read from it (avoids redundant JSONL parse)
  await syncIfNeeded(repoRoot);
  const items = readAllFromSqlite(repoRoot);

  // Read CCT patterns if available
  let cctPatterns: CctPattern[] = [];
  try {
    cctPatterns = await readCctPatterns(repoRoot);
  } catch {
    // File doesn't exist or is unreadable — proceed without CCT patterns
  }

  if (items.length === 0 && cctPatterns.length === 0) return [];

  // Embed the query
  const queryVector = await embedText(query);

  // Bulk-read all cached embeddings in one query (instead of N individual reads)
  const cachedEmbeddings = getCachedEmbeddingsBulk(repoRoot);

  // Score each item, skipping invalidated ones
  const scored: ScoredLesson[] = [];
  for (const item of items) {
    // Skip invalidated items
    if (item.invalidatedAt) continue;

    try {
      const itemText = `${item.trigger} ${item.insight}`;
      const hash = contentHash(item.trigger, item.insight);

      // Try bulk cache first
      const cached = cachedEmbeddings.get(item.id);
      let itemVector: Float32Array;

      if (cached && cached.hash === hash) {
        itemVector = cached.vector;
      } else {
        // Cache miss or stale - compute and store
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

  // Score CCT patterns (use in-memory cache since they lack SQLite rows)
  for (const pattern of cctPatterns) {
    try {
      const text = `${pattern.name} ${pattern.description}`;
      const hash = contentHash(pattern.name, pattern.description);
      const cacheKey = `${pattern.id}:${hash}`;

      let vec = cctEmbeddingCache.get(cacheKey);
      if (!vec) {
        vec = await embedText(text);
        cctEmbeddingCache.set(cacheKey, vec);
      }

      const score = cosineSimilarity(queryVector, vec);
      scored.push({ lesson: cctToMemoryItem(pattern), score });
    } catch {
      continue;
    }
  }

  // Sort by score descending and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export interface SimilarLesson {
  item: MemoryItem;
  score: number;
}

export interface FindSimilarOptions {
  threshold?: number;
  excludeId?: string;
  /** Pre-loaded items to search. When provided, skips readMemoryItems(). */
  items?: MemoryItem[];
}

const DEFAULT_THRESHOLD = 0.80;

/**
 * Find lessons semantically similar to the given text.
 * Embeds using insight text only (not trigger) to avoid noise from generic triggers.
 * Does NOT include CCT patterns.
 */
export async function findSimilarLessons(
  repoRoot: string,
  text: string,
  options?: FindSimilarOptions
): Promise<SimilarLesson[]> {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const excludeId = options?.excludeId;

  if (!isModelAvailable()) return [];

  let items: MemoryItem[];
  if (options?.items) {
    items = options.items;
  } else {
    await syncIfNeeded(repoRoot);
    items = readAllFromSqlite(repoRoot);
  }
  if (items.length === 0) return [];

  const queryVector = await embedText(text);

  const scored: SimilarLesson[] = [];
  for (const item of items) {
    if (item.invalidatedAt) continue;
    if (excludeId && item.id === excludeId) continue;

    try {
      // Use insight ONLY for embedding (NOT trigger + insight).
      // Stored in separate columns to avoid cache conflicts with searchVector.
      const hash = contentHash(item.insight, '');
      let itemVector = getCachedInsightEmbedding(repoRoot, item.id, hash);

      if (!itemVector) {
        itemVector = await embedText(item.insight);
        setCachedInsightEmbedding(repoRoot, item.id, itemVector, hash);
      }

      const score = cosineSimilarity(queryVector, itemVector);
      if (score >= threshold) {
        scored.push({ item, score });
      }
    } catch {
      continue;
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
