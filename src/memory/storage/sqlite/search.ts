/**
 * SQLite search operations using FTS5 full-text search.
 */

import { MemoryItemSchema } from '../../types.js';
import type { MemoryItem, MemoryItemType } from '../../types.js';
import { normalizeBm25Rank, type ScoredKeywordResult } from '../../search/hybrid.js';

import type { MemoryItemRow, RetrievalStat } from './types.js';
import { openDb } from './connection.js';

/**
 * Convert a database row to a MemoryItem object.
 * @param row - Database row
 * @returns MemoryItem object
 */
function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToMemoryItem(row: MemoryItemRow): MemoryItem | null {
  const item = {
    id: row.id,
    type: row.type,
    trigger: row.trigger,
    insight: row.insight,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    source: row.source,
    context: safeJsonParse(row.context, {}),
    supersedes: safeJsonParse(row.supersedes, []),
    related: safeJsonParse(row.related, []),
    created: row.created,
    confirmed: row.confirmed === 1,
  } as Record<string, unknown>;

  if (row.evidence !== null) item.evidence = row.evidence;
  if (row.severity !== null) item.severity = row.severity;
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
    item.compactionLevel = row.compaction_level;
  }
  if (row.compacted_at !== null) item.compactedAt = row.compacted_at;
  if (row.last_retrieved !== null) item.lastRetrieved = row.last_retrieved;
  if (row.pattern_bad !== null && row.pattern_good !== null) {
    item.pattern = { bad: row.pattern_bad, good: row.pattern_good };
  }

  const result = MemoryItemSchema.safeParse(item);
  if (!result.success) return null;
  return result.data;
}


/** FTS5 operator tokens to remove */
const FTS_OPERATORS = new Set(['AND', 'OR', 'NOT', 'NEAR']);

/**
 * Sanitize a query string for safe use with FTS5 MATCH.
 * Strips special FTS5 syntax characters and operators.
 * @param query - Raw user query
 * @returns Sanitized query safe for FTS5
 */
export function sanitizeFtsQuery(query: string): string {
  // Strip FTS5 special chars: " * ^ + - ( ) : { }
  const stripped = query.replace(/["*^+\-():{}]/g, '');
  // Tokenize by whitespace, remove FTS operators, filter empty
  const tokens = stripped
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FTS_OPERATORS.has(t));
  return tokens.join(' ');
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
 * Row type for scored keyword query (includes FTS5 rank).
 */
interface ScoredRow extends MemoryItemRow {
  rank: number;
}

/**
 * Shared FTS5 query execution. Builds the SQL with optional rank column
 * and ORDER BY, then runs the query with sanitization and error handling.
 */
function executeFtsQuery(
  repoRoot: string,
  query: string,
  limit: number,
  options: { includeRank: boolean; typeFilter?: MemoryItemType }
): ScoredRow[] {
  const database = openDb(repoRoot);

  const sanitized = sanitizeFtsQuery(query);
  if (sanitized === '') return [];

  const selectCols = options.includeRank ? 'l.*, fts.rank' : 'l.*';
  const orderClause = options.includeRank ? 'ORDER BY fts.rank' : '';
  const typeClause = options.typeFilter ? 'AND l.type = ?' : '';

  const sql = `
    SELECT ${selectCols}
    FROM lessons l
    JOIN lessons_fts fts ON l.rowid = fts.rowid
    WHERE lessons_fts MATCH ?
      AND l.invalidated_at IS NULL
      ${typeClause}
    ${orderClause}
    LIMIT ?
  `;

  const params = options.typeFilter
    ? [sanitized, options.typeFilter, limit]
    : [sanitized, limit];

  try {
    return database.prepare(sql).all(...params) as ScoredRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown FTS5 error';
    console.error(`[compound-agent] search error: ${message}`);
    return [];
  }
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
  const rows = executeFtsQuery(repoRoot, query, limit, { includeRank: false, typeFilter });
  return rows.map(rowToMemoryItem).filter((x): x is MemoryItem => x !== null);
}

/**
 * Search lessons using FTS5 with normalized BM25 scores.
 *
 * @param repoRoot - Absolute path to repository root
 * @param query - FTS5 query string
 * @param limit - Maximum number of results
 * @param typeFilter - Optional memory item type to filter by
 * @returns Scored keyword results with BM25 scores normalized to 0-1
 */
export async function searchKeywordScored(
  repoRoot: string,
  query: string,
  limit: number,
  typeFilter?: MemoryItemType
): Promise<ScoredKeywordResult[]> {
  const rows = executeFtsQuery(repoRoot, query, limit, { includeRank: true, typeFilter });
  const results: ScoredKeywordResult[] = [];
  for (const row of rows) {
    const lesson = rowToMemoryItem(row);
    if (lesson) {
      results.push({ lesson, score: normalizeBm25Rank(row.rank) });
    }
  }
  return results;
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
