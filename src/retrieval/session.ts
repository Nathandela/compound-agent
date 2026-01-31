/**
 * Session-start lesson retrieval
 *
 * Loads high-severity lessons at the start of a session.
 * No vector search - just filter by severity and recency.
 */

import { readLessons } from '../storage/jsonl.js';
import type { Lesson, Severity } from '../types.js';

/** Default number of lessons to load at session start */
const DEFAULT_LIMIT = 5;

/** A full lesson with severity field present */
type FullLesson = Lesson & { type: 'full'; severity: Severity };

/**
 * Type guard to check if a lesson is a full lesson with severity
 */
function isFullLesson(lesson: Lesson): lesson is FullLesson {
  return lesson.type === 'full' && lesson.severity !== undefined;
}

/**
 * Load high-severity lessons for session start.
 *
 * Returns confirmed, high-severity lessons sorted by recency.
 * These are the most important lessons to surface at the start
 * of a coding session.
 *
 * @param repoRoot - Repository root directory
 * @param limit - Maximum number of lessons to return (default: 5)
 * @returns Array of high-severity lessons, most recent first
 */
export async function loadSessionLessons(
  repoRoot: string,
  limit: number = DEFAULT_LIMIT
): Promise<FullLesson[]> {
  const { lessons: allLessons } = await readLessons(repoRoot);

  // Filter for high-severity, confirmed, full lessons
  const highSeverityLessons = allLessons.filter(
    (lesson): lesson is FullLesson =>
      isFullLesson(lesson) && lesson.severity === 'high' && lesson.confirmed
  );

  // Sort by recency (most recent first)
  highSeverityLessons.sort((a, b) => {
    const dateA = new Date(a.created).getTime();
    const dateB = new Date(b.created).getTime();
    return dateB - dateA;
  });

  // Return top N
  return highSeverityLessons.slice(0, limit);
}
