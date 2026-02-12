/**
 * Session-start lesson retrieval
 *
 * Loads high-severity lessons at the start of a session.
 * No vector search - just filter by severity and recency.
 */

import { incrementRetrievalCount, readMemoryItems } from '../storage/index.js';
import type { MemoryItem, Severity } from '../types.js';

/** Default number of lessons to load at session start */
const DEFAULT_LIMIT = 5;

/** A memory item with severity field present */
type LessonWithSeverity = MemoryItem & { severity: Severity };

/**
 * Type guard to check if a memory item has severity set
 */
function hasSeverity(item: MemoryItem): item is MemoryItem & { severity: Severity } {
  return item.severity !== undefined;
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
): Promise<LessonWithSeverity[]> {
  const { items } = await readMemoryItems(repoRoot);

  // Filter for high-severity, confirmed items of any type (excluding invalidated)
  const highSeverityLessons = items.filter(
    (item): item is MemoryItem & { severity: Severity } =>
      hasSeverity(item) &&
      item.severity === 'high' &&
      item.confirmed &&
      !item.invalidatedAt
  );

  // Sort by recency (most recent first)
  highSeverityLessons.sort((a, b) => {
    const dateA = new Date(a.created).getTime();
    const dateB = new Date(b.created).getTime();
    return dateB - dateA;
  });

  // Return top N and track surfaced lessons as retrieved.
  const topLessons = highSeverityLessons.slice(0, limit);
  if (topLessons.length > 0) {
    incrementRetrievalCount(repoRoot, topLessons.map((lesson) => lesson.id));
  }

  return topLessons;
}

/**
 * @deprecated Use loadSessionMemory. Backward-compat alias.
 */
export const loadSessionMemory = loadSessionLessons;
