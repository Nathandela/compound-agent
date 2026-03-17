/**
 * Embeddings module - Text embedding via EmbeddingGemma
 *
 * Provides text embedding for semantic search.
 * Model is downloaded automatically on first use (~400MB).
 */

// Lightweight model metadata (zero native imports)
export { DEFAULT_MODEL_DIR, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

// Embedding functions (native — loads node-llama-cpp)
export { embedText, embedTexts, getEmbedding, unloadEmbedding, unloadEmbeddingResources, withEmbedding } from './nomic.js';

// Model resolution (native — loads node-llama-cpp)
export { clearUsabilityCache, isModelUsable, resolveModel } from './model.js';
export type { UsabilityResult } from './model.js';
