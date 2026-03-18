/**
 * Text embedding via Transformers.js with nomic-embed-text-v1.5 model
 *
 * **Resource lifecycle:**
 * - Model is loaded lazily on first embedding call (~23MB in memory)
 * - Once loaded, the pipeline remains in memory until `unloadEmbedding()` is called
 * - Loading is fast (~140ms warm cache); keeping loaded improves subsequent call performance
 *
 * **Memory usage:**
 * - Embedding pipeline: ~23MB RAM when loaded (95% reduction from previous implementation)
 * - Embeddings themselves: ~3KB per embedding (768 dimensions x 4 bytes)
 *
 * @see {@link unloadEmbedding} for releasing memory
 * @see {@link getEmbedding} for the lazy-loading mechanism
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers';

import { isModelAvailable } from './model-info.js';
import { resolveModel } from './model.js';

/** Opaque handle to the loaded embedding pipeline. */
export interface EmbeddingContext {
  /** Embed a single text. Returns a normalized 768-dim vector. */
  embed(text: string): Promise<Float32Array>;
  /** Release resources. Safe to call multiple times. */
  dispose(): Promise<void>;
}

/** Singleton pipeline instance */
let pipelineInstance: FeatureExtractionPipeline | null = null;
/** Pending initialization promise (prevents concurrent duplicate loads) */
let pendingInit: Promise<EmbeddingContext> | null = null;
/** Wrapped context for public API */
let embeddingContext: EmbeddingContext | null = null;

/**
 * Get the EmbeddingContext instance for generating embeddings.
 *
 * **Lazy loading behavior:**
 * - First call loads the embedding model (~23MB) into memory
 * - Loading takes ~140ms (warm cache) or longer on first download
 * - Subsequent calls return the cached instance immediately
 * - Downloads model automatically if not present
 *
 * @returns The singleton embedding context
 * @throws Error if model download fails
 */
export async function getEmbedding(): Promise<EmbeddingContext> {
  if (embeddingContext) return embeddingContext;
  if (pendingInit) return pendingInit;

  pendingInit = (async () => {
    try {
      // Ensure model is downloaded
      await resolveModel({ cli: false });

      // Dynamic import to avoid pulling transformers.js at module load time
      const { pipeline } = await import('@huggingface/transformers');
      pipelineInstance = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
        dtype: 'q8',
      }) as FeatureExtractionPipeline;

      const ctx: EmbeddingContext = {
        async embed(text: string): Promise<Float32Array> {
          const output = await pipelineInstance!(text, { pooling: 'mean', normalize: true });
          return new Float32Array(output.data as Float64Array);
        },
        async dispose(): Promise<void> {
          if (pipelineInstance?.dispose) {
            try {
              await pipelineInstance.dispose();
            } catch {
              // Swallow — best-effort cleanup
            }
          }
          pipelineInstance = null;
        },
      };

      embeddingContext = ctx;
      return ctx;
    } catch (err) {
      pendingInit = null; // Allow retry on failure
      throw err;
    }
  })();

  return pendingInit;
}

/**
 * Await disposal of all loaded embedding resources.
 *
 * With Transformers.js, cleanup is a single pipeline.dispose() call.
 */
export async function unloadEmbeddingResources(): Promise<void> {
  const pending = pendingInit;
  if (pending) {
    try {
      await pending;
    } catch {
      // Ignore initialization failures; dispose any partially created refs below.
    }
  }

  const ctx = embeddingContext;
  embeddingContext = null;
  pendingInit = null;

  if (ctx) {
    await ctx.dispose();
  } else if (pipelineInstance) {
    // Partial init — pipeline created but context wrapper failed
    try {
      if (pipelineInstance.dispose) {
        await pipelineInstance.dispose();
      }
    } catch {
      // Swallow
    }
    pipelineInstance = null;
  }
}

/**
 * Unload the embedding pipeline to free memory (~23MB).
 *
 * @see {@link getEmbedding} for loading the model
 */
export function unloadEmbedding(): void {
  void unloadEmbeddingResources();
}

/**
 * Run a callback with embedding resources, guaranteeing cleanup.
 *
 * The model loads lazily on the first embedText/embedTexts call inside
 * the callback (via the existing singleton). After the callback completes
 * or throws, all resources are disposed.
 */
export async function withEmbedding<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    await unloadEmbeddingResources();
  }
}

/**
 * Embed a single text string into a vector.
 *
 * **Lazy loading:** First call loads the embedding model (~23MB, ~140ms).
 * Subsequent calls use the cached pipeline and complete in ~6ms.
 *
 * @param text - The text to embed
 * @returns A 768-dimensional Float32Array vector
 * @throws Error if model download fails
 */
export async function embedText(text: string): Promise<Float32Array> {
  const ctx = await getEmbedding();
  return ctx.embed(text);
}

/**
 * Embed multiple texts into vectors.
 *
 * Texts are embedded sequentially. The advantage over a manual loop
 * is shared pipeline initialization.
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dimensional vectors, same order as input
 * @throws Error if model download fails
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const ctx = await getEmbedding();
  const results: Float32Array[] = [];

  for (const text of texts) {
    results.push(await ctx.embed(text));
  }

  return results;
}

// Re-export isModelAvailable for test utilities
export { isModelAvailable };
