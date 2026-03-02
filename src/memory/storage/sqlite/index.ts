/**
 * SQLite storage module - rebuildable index with FTS5 full-text search.
 *
 * SQLite is required. If better-sqlite3 fails to load, a clear error
 * is thrown.
 */

// Types
export type { DbOptions, RetrievalStat, SyncOptions } from './types.js';

// Connection
export { closeDb, DB_PATH, openDb } from './connection.js';

// Cache
export {
  contentHash,
  getCachedEmbedding,
  getCachedEmbeddingsBulk,
  getCachedInsightEmbedding,
  setCachedEmbedding,
  setCachedInsightEmbedding,
} from './cache.js';
export type { CachedEmbeddingEntry } from './cache.js';

// Sync
export { rebuildIndex, syncIfNeeded } from './sync.js';

// Availability
export { ensureSqliteAvailable, resetSqliteAvailability } from './availability.js';

// Search
export {
  getRetrievalStats,
  incrementRetrievalCount,
  readAllFromSqlite,
  searchKeyword,
  searchKeywordScored,
} from './search.js';
