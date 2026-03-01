export { chunkFile } from './chunking.js';
export {
  chunkContentHash,
  generateChunkId,
  SUPPORTED_EXTENSIONS,
} from './types.js';
export type { Chunk, ChunkOptions } from './types.js';

export { indexDocs } from './indexing.js';
export type { IndexOptions, IndexResult } from './indexing.js';

export { searchKnowledge, searchKnowledgeVector } from './search.js';
export type { KnowledgeSearchOptions } from './search.js';

export { embedChunks, getUnembeddedChunkCount } from './embed-chunks.js';
export type { EmbedChunksOptions, EmbedChunksResult } from './embed-chunks.js';

export { acquireEmbedLock, isEmbedLocked } from './embed-lock.js';
export type { LockResult } from './embed-lock.js';

export { writeEmbedStatus, readEmbedStatus } from './embed-status.js';
export type { EmbedStatus } from './embed-status.js';

export { spawnBackgroundEmbed, runBackgroundEmbed, indexAndSpawnEmbed } from './embed-background.js';
export type { SpawnEmbedResult } from './embed-background.js';
