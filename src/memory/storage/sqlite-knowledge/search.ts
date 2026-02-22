/**
 * Knowledge chunk search operations using FTS5 full-text search.
 */

import type { KnowledgeChunk, ScoredChunk } from './types.js';
import { openKnowledgeDb } from './connection.js';
import { sanitizeFtsQuery } from '../sqlite/search.js';
import { normalizeBm25Rank } from '../../search/hybrid.js';

/** Internal row type from SQLite query */
interface ChunkRow {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content_hash: string;
  text: string;
  model: string | null;
  updated_at: string;
}

/** Row type with FTS5 rank score */
interface ScoredChunkRow extends ChunkRow {
  rank: number;
}

function rowToChunk(row: ChunkRow): KnowledgeChunk {
  const chunk: KnowledgeChunk = {
    id: row.id,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    contentHash: row.content_hash,
    text: row.text,
    updatedAt: row.updated_at,
  };
  if (row.model !== null) {
    chunk.model = row.model;
  }
  return chunk;
}

/**
 * Search knowledge chunks using FTS5 full-text search.
 * @param repoRoot - Absolute path to repository root
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @returns Matching chunks
 */
export function searchChunksKeyword(
  repoRoot: string,
  query: string,
  limit: number
): KnowledgeChunk[] {
  const database = openKnowledgeDb(repoRoot, { inMemory: true });

  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  const sanitized = sanitizeFtsQuery(query);
  if (sanitized === '') return [];

  try {
    const rows = database
      .prepare(
        `SELECT c.*
         FROM chunks c
         JOIN chunks_fts fts ON c.rowid = fts.rowid
         WHERE chunks_fts MATCH ?
         LIMIT ?`
      )
      .all(sanitized, limit) as ChunkRow[];

    return rows.map(rowToChunk);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown FTS5 error';
    console.error(`[compound-agent] knowledge search error: ${message}`);
    return [];
  }
}

/**
 * Search knowledge chunks with normalized BM25 scores.
 * @param repoRoot - Absolute path to repository root
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @returns Scored chunks with BM25 scores normalized to 0-1
 */
export function searchChunksKeywordScored(
  repoRoot: string,
  query: string,
  limit: number
): ScoredChunk[] {
  const database = openKnowledgeDb(repoRoot, { inMemory: true });

  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  const sanitized = sanitizeFtsQuery(query);
  if (sanitized === '') return [];

  try {
    const rows = database
      .prepare(
        `SELECT c.*, fts.rank
         FROM chunks c
         JOIN chunks_fts fts ON c.rowid = fts.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY fts.rank
         LIMIT ?`
      )
      .all(sanitized, limit) as ScoredChunkRow[];

    return rows.map((row) => ({
      chunk: rowToChunk(row),
      score: normalizeBm25Rank(row.rank),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown FTS5 error';
    console.error(`[compound-agent] knowledge scored search error: ${message}`);
    return [];
  }
}
