/**
 * Embeddings module - Text embedding via Transformers.js + nomic-embed-text-v1.5
 *
 * Provides text embedding for semantic search.
 * Model is downloaded automatically on first use (~23MB in memory).
 */

// Lightweight model metadata (zero native imports)
export { DEFAULT_MODEL_DIR, EMBEDDING_DIMS, EMBEDDING_MODEL_ID, getModelCacheDir, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

// Embedding functions (Transformers.js ONNX runtime)
export { embedText, embedTexts, getEmbedding, unloadEmbedding, unloadEmbeddingResources, withEmbedding } from './nomic.js';
export type { EmbeddingContext } from './nomic.js';

// Model resolution (loads Transformers.js on demand)
export { clearUsabilityCache, isModelUsable, resolveModel } from './model.js';
export type { UsabilityResult } from './model.js';
