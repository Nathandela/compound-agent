/**
 * Embeddings module - Text embedding via Transformers.js + nomic-embed-text-v1.5
 *
 * Provides text embedding for semantic search.
 * Model file is ~23MB on disk; ONNX runtime RSS is ~370-460MB when loaded.
 */

// Lightweight model metadata (zero native imports)
export { DEFAULT_MODEL_DIR, EMBEDDING_DIMS, EMBEDDING_MODEL_ID, getModelCacheDir, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

// Embedding functions (Transformers.js ONNX runtime)
export { embedText, embedTexts, getEmbedding, unloadEmbedding, unloadEmbeddingResources, withBoundedEmbedding, withEmbedding } from './nomic.js';
export type { EmbeddingContext } from './nomic.js';

// Model resolution (loads Transformers.js on demand)
export { clearUsabilityCache, isModelUsable, resolveModel } from './model.js';
export type { UsabilityResult } from './model.js';

// Subprocess-based model probe (safe for long-lived processes)
export { probeModelUsability } from './model-probe.js';
