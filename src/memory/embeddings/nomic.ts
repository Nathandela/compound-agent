/**
 * Text embedding via Transformers.js with nomic-embed-text-v1.5 model
 *
 * **Resource lifecycle:**
 * - Model is loaded lazily on first embedding call
 * - Once loaded, the pipeline remains in memory until `unloadEmbedding()` is called
 * - Loading is fast (~140ms warm cache); keeping loaded improves subsequent call performance
 *
 * **Memory usage:**
 * - Model file on disk: ~23MB
 * - ONNX runtime RSS when loaded: ~370-460MB (the runtime inflates well beyond the model file size)
 * - Embeddings themselves: ~3KB per embedding (768 dimensions x 4 bytes)
 * - After dispose(), RSS is NOT fully reclaimed within the same process
 *
 * @see {@link unloadEmbedding} for releasing memory
 * @see {@link getEmbedding} for the lazy-loading mechanism
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers';

import { isModelAvailable, MODEL_URI } from './model-info.js';
import { acquireSearchSlot } from './search-semaphore.js';

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
 * - First call loads the embedding model (~370-460MB RSS) into memory
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
      // Dynamic import to avoid pulling transformers.js at module load time
      const { pipeline } = await import('@huggingface/transformers');
      pipelineInstance = await pipeline('feature-extraction', MODEL_URI, {
        dtype: 'q8',
      }) as FeatureExtractionPipeline;

      // Capture at construction time so ctx.dispose() can reach the pipeline
      // even after unloadEmbeddingResources() has nulled the module-level variable.
      const capturedPipeline = pipelineInstance;

      const ctx: EmbeddingContext = {
        async embed(text: string): Promise<Float32Array> {
          const output = await capturedPipeline!(text, { pooling: 'mean', normalize: true });
          return new Float32Array(output.data as Float32Array);
        },
        async dispose(): Promise<void> {
          if (capturedPipeline?.dispose) {
            try {
              await capturedPipeline.dispose();
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
  // Capture and synchronously detach all singleton state BEFORE any await.
  // This prevents a concurrent getEmbedding() call from receiving a reference
  // to a pipeline that is simultaneously being disposed (dispose-race).
  const pending = pendingInit;
  const ctx = embeddingContext;
  const orphan = pipelineInstance;

  pendingInit = null;
  embeddingContext = null;
  pipelineInstance = null;

  // Await any in-flight initialization so we don't leak its pipeline.
  if (pending) {
    try {
      await pending;
    } catch {
      // Ignore initialization failures; captured refs handle cleanup below.
    }
  }

  // Dispose the context (which owns the pipeline) or the orphaned pipeline directly.
  if (ctx) {
    await ctx.dispose();
  } else if (orphan) {
    // Partial init — pipeline created but context wrapper failed
    try {
      if (orphan.dispose) {
        await orphan.dispose();
      }
    } catch {
      // Swallow — best-effort cleanup
    }
    // pipelineInstance already nulled above
  }
}

/**
 * Unload the embedding pipeline to free memory (~370-460MB RSS).
 *
 * @see {@link getEmbedding} for loading the model
 * @deprecated Prefer {@link unloadEmbeddingResources} (async). This synchronous
 * wrapper fires a floating promise — if the process exits before the native ONNX
 * backend finishes cleanup, a SIGABRT or segfault may occur. Safe only when
 * followed by further async work (e.g. inside withEmbedding) that gives Node.js
 * time to drain the microtask queue.
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
 * Run a callback with bounded embedding resources.
 *
 * Acquires a cross-process semaphore slot before loading the embedding model.
 * If no slot is available (too many concurrent loaders), calls the fallback
 * instead (typically keyword-only search).
 *
 * @param repoRoot - Repository root for slot directory
 * @param fn - Callback that uses embedding (runs inside withEmbedding)
 * @param fallback - Callback when no slot available (e.g. keyword search)
 */
export async function withBoundedEmbedding<T>(
  repoRoot: string,
  fn: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  const slot = acquireSearchSlot(repoRoot);
  if (!slot.acquired) {
    return fallback();
  }
  try {
    return await withEmbedding(fn);
  } finally {
    slot.release();
  }
}

/**
 * Embed a single text string into a vector.
 *
 * **Lazy loading:** First call loads the embedding model (~370-460MB RSS, ~140ms).
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
