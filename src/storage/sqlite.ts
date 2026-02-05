/**
 * SQLite storage - backward compatibility shim.
 *
 * This file re-exports from the split module structure for backward
 * compatibility. New code should import from './sqlite/index.js' or
 * preferably from '../storage/index.js'.
 *
 * @deprecated Import from './sqlite/index.js' or '../storage/index.js' instead.
 */

// Re-export everything from the split module
export {
  // Types
  type DbOptions,
  type RetrievalStat,
  type SyncOptions,

  // Availability
  isSqliteMode,

  // Connection
  closeDb,
  DB_PATH,
  openDb,

  // Cache
  contentHash,
  getCachedEmbedding,
  setCachedEmbedding,

  // Sync
  rebuildIndex,
  syncIfNeeded,

  // Search
  getRetrievalStats,
  incrementRetrievalCount,
  searchKeyword,
} from './sqlite/index.js';
