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
  setCachedEmbedding,
} from './cache.js';

// Sync
export { rebuildIndex, syncIfNeeded } from './sync.js';

// Search
export {
  getRetrievalStats,
  incrementRetrievalCount,
  searchKeyword,
  searchKeywordScored,
} from './search.js';
