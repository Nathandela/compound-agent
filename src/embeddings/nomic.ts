/**
 * Text embedding via node-llama-cpp with nomic-embed-text model
 *
 * Lazy-loads the model on first call. Hard-fails if model unavailable.
 */

import { getLlama, LlamaEmbeddingContext } from 'node-llama-cpp';
import { getModelPath } from './download.js';
import { access } from 'fs/promises';

/** Singleton embedding context */
let embeddingContext: LlamaEmbeddingContext | null = null;

/**
 * Get the LlamaEmbeddingContext instance.
 * Loads model on first call (lazy loading).
 * Hard-fails if model unavailable.
 */
export async function getEmbedding(): Promise<LlamaEmbeddingContext> {
  if (embeddingContext) return embeddingContext;

  // Check if model exists, fail fast if not
  const modelPath = getModelPath();
  try {
    await access(modelPath);
  } catch {
    throw new Error(
      `Embedding model not found at ${modelPath}. Run 'npx learning-agent download-model' first.`
    );
  }

  // Load llama and model
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  embeddingContext = await model.createEmbeddingContext();

  return embeddingContext;
}

/**
 * Unload the embedding context to free memory.
 */
export function unloadEmbedding(): void {
  if (embeddingContext) {
    embeddingContext.dispose();
    embeddingContext = null;
  }
}

/**
 * Embed a single text string.
 * Returns a vector of numbers.
 */
export async function embedText(text: string): Promise<number[]> {
  const ctx = await getEmbedding();
  const result = await ctx.getEmbeddingFor(text);
  return Array.from(result.vector);
}

/**
 * Embed multiple texts efficiently.
 * Returns array of vectors in same order as input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const ctx = await getEmbedding();
  const results: number[][] = [];

  for (const text of texts) {
    const result = await ctx.getEmbeddingFor(text);
    results.push(Array.from(result.vector));
  }

  return results;
}
