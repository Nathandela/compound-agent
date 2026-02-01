/**
 * Vector search with cosine similarity
 *
 * Embeds query text and ranks lessons by semantic similarity.
 * Uses SQLite cache to avoid recomputing embeddings.
 */

import { embedText } from '../embeddings/index.js';
import { contentHash, getCachedEmbedding, readLessons, setCachedEmbedding } from '../storage/index.js';
import type { Lesson } from '../types.js';

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

/** Lesson with similarity score */
export interface ScoredLesson {
  lesson: Lesson;
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
export async function searchVector(
  repoRoot: string,
  query: string,
  options?: SearchVectorOptions
): Promise<ScoredLesson[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  // Read all lessons
  const { lessons } = await readLessons(repoRoot);
  if (lessons.length === 0) return [];

  // Embed the query
  const queryVector = await embedText(query);

  // Score each lesson, skipping invalidated ones
  const scored: ScoredLesson[] = [];
  for (const lesson of lessons) {
    // Skip invalidated lessons
    if (lesson.invalidatedAt) continue;

    const lessonText = `${lesson.trigger} ${lesson.insight}`;
    const hash = contentHash(lesson.trigger, lesson.insight);

    // Try cache first
    let lessonVector = getCachedEmbedding(repoRoot, lesson.id, hash);

    if (!lessonVector) {
      // Cache miss - compute and store
      lessonVector = await embedText(lessonText);
      setCachedEmbedding(repoRoot, lesson.id, lessonVector, hash);
    }

    const score = cosineSimilarity(queryVector, lessonVector);
    scored.push({ lesson, score });
  }

  // Sort by score descending and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
