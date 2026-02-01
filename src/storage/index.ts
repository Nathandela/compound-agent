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
// Note: _resetSqliteState and _setForceUnavailable are test-only APIs
// and should be imported directly from './sqlite.js' in tests
export {
  closeDb,
  contentHash,
  DB_PATH,
  getCachedEmbedding,
  getRetrievalStats,
  incrementRetrievalCount,
  isSqliteMode,
  openDb,
  rebuildIndex,
  searchKeyword,
  setCachedEmbedding,
  syncIfNeeded,
} from './sqlite.js';
export type { DbOptions, RetrievalStat, SyncOptions } from './sqlite.js';

// Compaction (archive + tombstone removal)
export {
  archiveOldLessons,
  ARCHIVE_AGE_DAYS,
  ARCHIVE_DIR,
  compact,
  countTombstones,
  getArchivePath,
  needsCompaction,
  rewriteWithoutTombstones,
  TOMBSTONE_THRESHOLD,
} from './compact.js';
export type { CompactResult } from './compact.js';
