/**
 * Plan-time lesson retrieval
 *
 * Retrieves relevant lessons when planning an implementation.
 * Uses vector search to find semantically similar lessons.
 */

import { searchVector, type ScoredLesson } from '../search/vector.js';
import { rankLessons, type RankedLesson } from '../search/ranking.js';

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
 * Uses vector search to find semantically similar lessons,
 * then applies ranking boosts for severity, recency, and confirmation.
 *
 * Hard-fails if embeddings are unavailable (propagates error from embedText).
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
  // Get lessons by vector similarity (will throw if embeddings unavailable)
  const scored = await searchVector(repoRoot, planText, { limit: limit * 2 });

  // Apply ranking boosts
  const ranked = rankLessons(scored);

  // Take top N after ranking
  const topLessons = ranked.slice(0, limit);

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
