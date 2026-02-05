/**
 * SQLite search operations using FTS5 full-text search.
 */

import type { Lesson } from '../../types.js';

import type { LessonRow, RetrievalStat } from './types.js';
import { openDb } from './connection.js';

/**
 * Convert a database row to a Lesson object.
 * @param row - Database row
 * @returns Lesson object
 */
function rowToLesson(row: LessonRow): Lesson {
  const lesson: Lesson = {
    id: row.id,
    type: row.type as 'quick' | 'full',
    trigger: row.trigger,
    insight: row.insight,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    source: row.source as Lesson['source'],
    context: JSON.parse(row.context) as Lesson['context'],
    supersedes: JSON.parse(row.supersedes) as string[],
    related: JSON.parse(row.related) as string[],
    created: row.created,
    confirmed: row.confirmed === 1,
  };

  if (row.evidence !== null) lesson.evidence = row.evidence;
  if (row.severity !== null) lesson.severity = row.severity as 'high' | 'medium' | 'low';
  if (row.deleted === 1) lesson.deleted = true;
  if (row.retrieval_count > 0) lesson.retrievalCount = row.retrieval_count;
  if (row.invalidated_at !== null) lesson.invalidatedAt = row.invalidated_at;
  if (row.invalidation_reason !== null) lesson.invalidationReason = row.invalidation_reason;
  if (row.citation_file !== null) {
    lesson.citation = {
      file: row.citation_file,
      ...(row.citation_line !== null && { line: row.citation_line }),
      ...(row.citation_commit !== null && { commit: row.citation_commit }),
    };
  }
  if (row.compaction_level !== null && row.compaction_level !== 0) {
    lesson.compactionLevel = row.compaction_level as 0 | 1 | 2;
  }
  if (row.compacted_at !== null) lesson.compactedAt = row.compacted_at;
  if (row.last_retrieved !== null) lesson.lastRetrieved = row.last_retrieved;

  return lesson;
}

/**
 * Increment retrieval count for lessons.
 * @param repoRoot - Absolute path to repository root
 * @param lessonIds - IDs of retrieved lessons
 */
export function incrementRetrievalCount(repoRoot: string, lessonIds: string[]): void {
  if (lessonIds.length === 0) return;

  const database = openDb(repoRoot);

  const now = new Date().toISOString();

  const update = database.prepare(`
    UPDATE lessons
    SET retrieval_count = retrieval_count + 1,
        last_retrieved = ?
    WHERE id = ?
  `);

  const updateMany = database.transaction((ids: string[]) => {
    for (const id of ids) {
      update.run(now, id);
    }
  });

  updateMany(lessonIds);
}

/**
 * Search lessons using FTS5 full-text search.
 * @param repoRoot - Absolute path to repository root
 * @param query - FTS5 query string
 * @param limit - Maximum number of results
 * @returns Matching lessons
 */
export async function searchKeyword(
  repoRoot: string,
  query: string,
  limit: number
): Promise<Lesson[]> {
  const database = openDb(repoRoot);

  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  const rows = database
    .prepare(
      `
      SELECT l.*
      FROM lessons l
      JOIN lessons_fts fts ON l.rowid = fts.rowid
      WHERE lessons_fts MATCH ?
        AND l.invalidated_at IS NULL
      LIMIT ?
    `
    )
    .all(query, limit) as LessonRow[];

  if (rows.length > 0) {
    incrementRetrievalCount(repoRoot, rows.map((r) => r.id));
  }

  return rows.map(rowToLesson);
}

/**
 * Get retrieval statistics for all lessons.
 * @param repoRoot - Absolute path to repository root
 * @returns Array of retrieval statistics
 */
export function getRetrievalStats(repoRoot: string): RetrievalStat[] {
  const database = openDb(repoRoot);

  const rows = database
    .prepare('SELECT id, retrieval_count, last_retrieved FROM lessons')
    .all() as Array<{ id: string; retrieval_count: number; last_retrieved: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    count: row.retrieval_count,
    lastRetrieved: row.last_retrieved,
  }));
}
