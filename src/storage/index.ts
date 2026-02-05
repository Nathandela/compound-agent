/**
 * Storage module - JSONL + SQLite storage layer
 *
 * JSONL is the source of truth (git-tracked).
 * SQLite is a rebuildable index with FTS5 and embedding cache.
 */

// JSONL storage (source of truth)
export { appendLesson, appendTombstone, LESSONS_PATH, readLessons } from './jsonl.js';
export type { ParseError, ReadLessonsOptions, ReadLessonsResult } from './jsonl.js';

// SQLite storage (rebuildable index)
// Note: test-only APIs (_resetSqliteState, _setForceUnavailable) live in
// './sqlite/test-helpers.js' and are NOT re-exported through this barrel.
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
} from './sqlite/index.js';
export type { DbOptions, RetrievalStat, SyncOptions } from './sqlite/index.js';

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
