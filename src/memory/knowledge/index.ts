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
