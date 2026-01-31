/**
 * Embeddings module - Text embedding via nomic-embed-text
 *
 * Provides text embedding for semantic search.
 * Model is downloaded on first use (~500MB).
 */

// Embedding functions
export { embedText, embedTexts, getEmbedding, unloadEmbedding } from './nomic.js';

// Model download
export { ensureModel, getModelPath, MODEL_FILENAME, MODEL_URL } from './download.js';
