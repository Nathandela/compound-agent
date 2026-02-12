/**
 * SQLite search operations using FTS5 full-text search.
 */

import type { MemoryItem, MemoryItemType } from '../../types.js';

import type { MemoryItemRow, RetrievalStat } from './types.js';
import { openDb } from './connection.js';

/**
 * Convert a database row to a MemoryItem object.
 * @param row - Database row
 * @returns MemoryItem object
 */
function rowToMemoryItem(row: MemoryItemRow): MemoryItem {
  const item: MemoryItem = {
    id: row.id,
    type: row.type as MemoryItem['type'],
    trigger: row.trigger,
    insight: row.insight,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    source: row.source as MemoryItem['source'],
    context: JSON.parse(row.context) as MemoryItem['context'],
    supersedes: JSON.parse(row.supersedes) as string[],
    related: JSON.parse(row.related) as string[],
    created: row.created,
    confirmed: row.confirmed === 1,
  } as MemoryItem;

  if (row.evidence !== null) item.evidence = row.evidence;
  if (row.severity !== null) item.severity = row.severity as 'high' | 'medium' | 'low';
  if (row.deleted === 1) item.deleted = true;
  if (row.retrieval_count > 0) item.retrievalCount = row.retrieval_count;
  if (row.invalidated_at !== null) item.invalidatedAt = row.invalidated_at;
  if (row.invalidation_reason !== null) item.invalidationReason = row.invalidation_reason;
  if (row.citation_file !== null) {
    item.citation = {
      file: row.citation_file,
      ...(row.citation_line !== null && { line: row.citation_line }),
      ...(row.citation_commit !== null && { commit: row.citation_commit }),
    };
  }
  if (row.compaction_level !== null && row.compaction_level !== 0) {
    item.compactionLevel = row.compaction_level as 0 | 1 | 2;
  }
  if (row.compacted_at !== null) item.compactedAt = row.compacted_at;
  if (row.last_retrieved !== null) item.lastRetrieved = row.last_retrieved;
  if (row.pattern_bad !== null && row.pattern_good !== null) {
    item.pattern = { bad: row.pattern_bad, good: row.pattern_good };
  }

  return item;
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
 * @param typeFilter - Optional memory item type to filter by
 * @returns Matching lessons
 */
export async function searchKeyword(
  repoRoot: string,
  query: string,
  limit: number,
  typeFilter?: MemoryItemType
): Promise<MemoryItem[]> {
  const database = openDb(repoRoot);

  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  if (typeFilter) {
    const rows = database
      .prepare(
        `
        SELECT l.*
        FROM lessons l
        JOIN lessons_fts fts ON l.rowid = fts.rowid
        WHERE lessons_fts MATCH ?
          AND l.invalidated_at IS NULL
          AND l.type = ?
        LIMIT ?
      `
      )
      .all(query, typeFilter, limit) as MemoryItemRow[];
    return rows.map(rowToMemoryItem);
  }

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
    .all(query, limit) as MemoryItemRow[];

  return rows.map(rowToMemoryItem);
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
