/**
 * Embeddings module - Text embedding via EmbeddingGemma
 *
 * Provides text embedding for semantic search.
 * Model is downloaded automatically on first use (~150MB).
 */

// Embedding functions
export { embedText, embedTexts, getEmbedding, isModelAvailable, unloadEmbedding } from './nomic.js';

// Model resolution
export { isModelUsable, MODEL_FILENAME, MODEL_URI, resolveModel } from './model.js';
export type { UsabilityResult } from './model.js';
