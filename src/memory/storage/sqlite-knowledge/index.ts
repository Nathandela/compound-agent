/**
 * Knowledge SQLite storage module - documentation chunks with FTS5 search.
 */

// Types
export type { KnowledgeChunk, KnowledgeDbOptions, ScoredChunk } from './types.js';

// Connection
export { openKnowledgeDb, closeKnowledgeDb, KNOWLEDGE_DB_PATH } from './connection.js';

// Schema
export { KNOWLEDGE_SCHEMA_VERSION } from './schema.js';

// Cache
export {
  chunkContentHash,
  collectCachedChunkEmbeddings,
  getCachedChunkEmbedding,
  setCachedChunkEmbedding,
} from './cache.js';

// Search
export { searchChunksKeywordScored } from './search.js';

// Sync
export {
  upsertChunks,
  deleteChunksByFilePath,
  getIndexedFilePaths,
  getChunkCount,
  getChunkCountByFilePath,
  getLastIndexTime,
  setLastIndexTime,
} from './sync.js';
