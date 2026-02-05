/**
 * SQLite storage module - rebuildable index with FTS5 full-text search.
 *
 * **Graceful degradation**: If better-sqlite3 fails to load (e.g., native
 * binding compilation issues), the module operates in JSONL-only mode.
 * JSONL remains the source of truth; SQLite is just a cache/index.
 */

// Types
export type { DbOptions, RetrievalStat, SyncOptions } from './types.js';

// Availability
export { isSqliteMode } from './availability.js';

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
} from './search.js';
