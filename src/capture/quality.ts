/**
 * Quality filters for lesson capture
 *
 * Filters to ensure lessons are:
 * - Novel (not duplicate)
 * - Specific (not vague)
 * - Actionable (contains action words)
 */

import { searchKeyword, rebuildIndex } from '../storage/sqlite.js';

/** Default similarity threshold for duplicate detection */
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

/** Result of novelty check */
export interface NoveltyResult {
  novel: boolean;
  reason?: string;
  existingId?: string;
}

/** Options for novelty check */
export interface NoveltyOptions {
  threshold?: number;
}

/**
 * Check if an insight is novel (not a duplicate of existing lessons).
 * Uses keyword search to find potentially similar lessons.
 */
export async function isNovel(
  repoRoot: string,
  insight: string,
  options: NoveltyOptions = {}
): Promise<NoveltyResult> {
  const threshold = options.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  // Rebuild index to ensure fresh data
  await rebuildIndex(repoRoot);

  // Extract key words for search (take first 3 significant words)
  const words = insight
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);

  if (words.length === 0) {
    return { novel: true };
  }

  // Search for each word and collect results
  const searchQuery = words.join(' OR ');
  const results = await searchKeyword(repoRoot, searchQuery, 10);

  if (results.length === 0) {
    return { novel: true };
  }

  // Check similarity using simple word overlap (since we may not have embeddings)
  const insightWords = new Set(insight.toLowerCase().split(/\s+/));

  for (const lesson of results) {
    const lessonWords = new Set(lesson.insight.toLowerCase().split(/\s+/));

    // Calculate Jaccard similarity
    const intersection = [...insightWords].filter((w) => lessonWords.has(w)).length;
    const union = new Set([...insightWords, ...lessonWords]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity >= threshold) {
      return {
        novel: false,
        reason: `Found similar existing lesson: "${lesson.insight.slice(0, 50)}..."`,
        existingId: lesson.id,
      };
    }

    // Also check exact match
    if (lesson.insight.toLowerCase() === insight.toLowerCase()) {
      return {
        novel: false,
        reason: `Exact duplicate found`,
        existingId: lesson.id,
      };
    }
  }

  return { novel: true };
}
