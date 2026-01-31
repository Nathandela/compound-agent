/**
 * Storage module - JSONL + SQLite storage layer
 *
 * JSONL is the source of truth (git-tracked).
 * SQLite is a rebuildable index with FTS5 and embedding cache.
 */

// JSONL storage (source of truth)
export { appendLesson, readLessons, LESSONS_PATH } from './jsonl.js';
export type { ParseError, ReadLessonsOptions, ReadLessonsResult } from './jsonl.js';

// SQLite storage (rebuildable index)
export {
  closeDb,
  contentHash,
  DB_PATH,
  getCachedEmbedding,
  openDb,
  rebuildIndex,
  searchKeyword,
  setCachedEmbedding,
  syncIfNeeded,
} from './sqlite.js';
export type { SyncOptions } from './sqlite.js';
