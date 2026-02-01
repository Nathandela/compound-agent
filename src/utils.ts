/**
 * Shared utility functions for the Learning Agent.
 */

/** Milliseconds per day for time calculations */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate the age of a lesson in days from its created date.
 *
 * @param lesson - Object with a created field (ISO8601 string)
 * @returns Age in days (integer, rounded down)
 */
export function getLessonAgeDays(lesson: { created: string }): number {
  const created = new Date(lesson.created).getTime();
  const now = Date.now();
  return Math.floor((now - created) / MS_PER_DAY);
}
