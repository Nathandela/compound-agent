/**
 * Plan-time lesson retrieval
 *
 * Retrieves relevant lessons when planning an implementation.
 * Uses vector search to find semantically similar lessons.
 */

import { CANDIDATE_MULTIPLIER, DEFAULT_TEXT_WEIGHT, MIN_HYBRID_SCORE, mergeHybridResults, rankLessons, searchVector, type RankedLesson, type ScoredLesson } from '../search/index.js';
import { incrementRetrievalCount, searchKeywordScored } from '../storage/index.js';

/** Default number of lessons to retrieve */
const DEFAULT_LIMIT = 5;

/** Result of plan-time retrieval */
export interface PlanRetrievalResult {
  lessons: RankedLesson[];
  message: string;
}

/**
 * Retrieve relevant lessons for a plan.
 *
 * Uses hybrid search (vector similarity + FTS5 keyword matching)
 * then applies ranking boosts for severity, recency, and confirmation.
 *
 * Falls back to keyword-only search when the embedding model is unavailable.
 *
 * @param repoRoot - Repository root directory
 * @param planText - The plan text to search against
 * @param limit - Maximum number of lessons to return (default: 5)
 * @returns Ranked lessons and formatted message
 */
export async function retrieveForPlan(
  repoRoot: string,
  planText: string,
  limit: number = DEFAULT_LIMIT
): Promise<PlanRetrievalResult> {
  const candidateLimit = limit * CANDIDATE_MULTIPLIER;

  // Attempt hybrid search: vector similarity + keyword matching.
  // If vector search fails (model unavailable/broken), fall back to keyword-only.
  let vectorResults: ScoredLesson[] = [];
  let vectorFailed = false;
  const keywordResultsPromise = searchKeywordScored(repoRoot, planText, candidateLimit);

  try {
    vectorResults = await searchVector(repoRoot, planText, { limit: candidateLimit });
  } catch {
    vectorFailed = true;
    console.error('[compound-agent] Vector search unavailable, falling back to keyword-only search');
  }

  const keywordResults = await keywordResultsPromise;

  let merged: ScoredLesson[];
  if (vectorFailed) {
    // Keyword-only: use text scores directly (no vector blending, no minScore filter
    // since keyword-only scores are lower than hybrid blended scores)
    merged = mergeHybridResults([], keywordResults, {
      vectorWeight: 0,
      textWeight: DEFAULT_TEXT_WEIGHT,
    });
  } else {
    merged = mergeHybridResults(vectorResults, keywordResults, { minScore: MIN_HYBRID_SCORE });
  }

  // Apply ranking boosts (severity, recency, confirmation)
  const ranked = rankLessons(merged);

  // Take top N after ranking
  const topLessons = ranked.slice(0, limit);

  // Track actual plan-time retrieval usage only for surfaced lessons.
  if (topLessons.length > 0) {
    incrementRetrievalCount(repoRoot, topLessons.map((item) => item.lesson.id));
  }

  // Format the Lessons Check message
  const message = formatLessonsCheck(topLessons);

  return { lessons: topLessons, message };
}

/**
 * Format a "Lessons Check" message for display.
 *
 * This message is intended to be shown at plan-time to remind
 * the developer of relevant lessons before implementation.
 *
 * @param lessons - Ranked lessons to include in the message
 * @returns Formatted message string
 */
export function formatLessonsCheck(lessons: ScoredLesson[]): string {
  const header = 'Lessons Check\n' + '─'.repeat(40);

  if (lessons.length === 0) {
    return `${header}\nNo relevant lessons found for this plan.`;
  }

  const lessonLines = lessons.map((l, i) => {
    const bullet = `${i + 1}.`;
    const insight = l.lesson.insight;
    return `${bullet} ${insight}`;
  });

  return `${header}\n${lessonLines.join('\n')}`;
}
