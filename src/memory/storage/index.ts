/**
 * Storage module - JSONL + SQLite storage layer
 *
 * JSONL is the source of truth (git-tracked).
 * SQLite is a rebuildable index with FTS5 and embedding cache.
 */

// JSONL storage (source of truth)
export { appendLesson, appendMemoryItem, LESSONS_PATH, readLessons, readMemoryItems } from './jsonl.js';
export type { ParseError, ReadLessonsOptions, ReadLessonsResult, ReadMemoryItemsResult } from './jsonl.js';

// SQLite storage (rebuildable index)
export {
  closeDb,
  contentHash,
  DB_PATH,
  getCachedEmbedding,
  getRetrievalStats,
  incrementRetrievalCount,
  openDb,
  rebuildIndex,
  searchKeyword,
  searchKeywordScored,
  setCachedEmbedding,
  syncIfNeeded,
} from './sqlite/index.js';
export type { DbOptions, RetrievalStat, SyncOptions } from './sqlite/index.js';

// Compaction (archive + tombstone removal)
export {
  ARCHIVE_AGE_DAYS,
  ARCHIVE_DIR,
  compact,
  countTombstones,
  getArchivePath,
  needsCompaction,
  TOMBSTONE_THRESHOLD,
} from './compact.js';
export type { CompactResult } from './compact.js';
