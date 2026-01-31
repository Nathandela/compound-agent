/**
 * Text embedding via node-llama-cpp with EmbeddingGemma model
 *
 * **Resource lifecycle:**
 * - Model is loaded lazily on first embedding call (~150MB in memory)
 * - Once loaded, the model remains in memory until `unloadEmbedding()` is called
 * - Loading is slow (~1-3s); keeping loaded improves subsequent call performance
 *
 * **Memory usage:**
 * - Embedding model: ~150MB RAM when loaded
 * - Embeddings themselves: ~3KB per embedding (768 dimensions x 4 bytes)
 *
 * @see {@link unloadEmbedding} for releasing memory
 * @see {@link getEmbedding} for the lazy-loading mechanism
 */

import { getLlama, LlamaEmbeddingContext } from 'node-llama-cpp';

import { isModelAvailable, resolveModel } from './model.js';

/** Singleton embedding context */
let embeddingContext: LlamaEmbeddingContext | null = null;

/**
 * Get the LlamaEmbeddingContext instance for generating embeddings.
 *
 * **Lazy loading behavior:**
 * - First call loads the embedding model (~150MB) into memory
 * - Loading takes ~1-3 seconds depending on hardware
 * - Subsequent calls return the cached instance immediately
 * - Downloads model automatically if not present
 *
 * **Resource lifecycle:**
 * - Once loaded, model stays in memory until `unloadEmbedding()` is called
 * - For CLI commands: typically load once, use, then unload on exit
 * - For long-running processes: keep loaded for performance
 *
 * @returns The singleton embedding context
 * @throws Error if model download fails
 *
 * @example
 * ```typescript
 * // Direct usage (prefer embedText for simple cases)
 * const ctx = await getEmbedding();
 * const result = await ctx.getEmbeddingFor('some text');
 *
 * // Ensure cleanup
 * process.on('exit', () => unloadEmbedding());
 * ```
 *
 * @see {@link embedText} for simpler text-to-vector conversion
 * @see {@link unloadEmbedding} for releasing memory
 */
export async function getEmbedding(): Promise<LlamaEmbeddingContext> {
  if (embeddingContext) return embeddingContext;

  // Resolve model path (downloads if needed)
  const modelPath = await resolveModel({ cli: true });

  // Load llama and model
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  embeddingContext = await model.createEmbeddingContext();

  return embeddingContext;
}

/**
 * Unload the embedding context to free memory (~150MB).
 *
 * **Resource lifecycle:**
 * - Disposes the underlying LlamaEmbeddingContext
 * - Releases ~150MB of RAM used by the model
 * - After unloading, subsequent embedding calls will reload the model
 *
 * **When to call:**
 * - At the end of CLI commands to ensure clean process exit
 * - In memory-constrained environments after batch processing
 * - Before process exit in graceful shutdown handlers
 * - When switching to a different model (if supported in future)
 *
 * **Best practices:**
 * - For single-operation scripts: call before exit
 * - For daemon/server processes: call in shutdown handler
 * - Not needed between embedding calls in the same process
 *
 * @example
 * ```typescript
 * // CLI command pattern
 * try {
 *   const embedding = await embedText('some text');
 *   // ... use embedding
 * } finally {
 *   unloadEmbedding();
 *   closeDb();
 * }
 *
 * // Graceful shutdown pattern
 * process.on('SIGTERM', () => {
 *   unloadEmbedding();
 *   closeDb();
 *   process.exit(0);
 * });
 * ```
 *
 * @see {@link getEmbedding} for loading the model
 * @see {@link closeDb} for database cleanup (often used together)
 */
export function unloadEmbedding(): void {
  if (embeddingContext) {
    embeddingContext.dispose();
    embeddingContext = null;
  }
}

/**
 * Embed a single text string into a vector.
 *
 * **Lazy loading:** First call loads the embedding model (~150MB, ~1-3s).
 * Subsequent calls use the cached model and complete in milliseconds.
 *
 * @param text - The text to embed
 * @returns A 768-dimensional vector (number[])
 * @throws Error if model download fails
 *
 * @example
 * ```typescript
 * const vector = await embedText('TypeScript error handling');
 * console.log(vector.length); // 768
 *
 * // Remember to clean up when done
 * unloadEmbedding();
 * ```
 *
 * @see {@link embedTexts} for batch embedding
 * @see {@link unloadEmbedding} for releasing memory
 */
export async function embedText(text: string): Promise<number[]> {
  const ctx = await getEmbedding();
  const result = await ctx.getEmbeddingFor(text);
  return Array.from(result.vector);
}

/**
 * Embed multiple texts into vectors.
 *
 * **Lazy loading:** First call loads the embedding model (~150MB, ~1-3s).
 * Subsequent calls use the cached model.
 *
 * **Performance:** More efficient than calling `embedText` in a loop
 * when processing multiple texts, as model loading happens only once.
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dimensional vectors, same order as input
 * @throws Error if model download fails
 *
 * @example
 * ```typescript
 * const texts = ['first text', 'second text'];
 * const vectors = await embedTexts(texts);
 * console.log(vectors.length); // 2
 * console.log(vectors[0].length); // 768
 *
 * // Remember to clean up when done
 * unloadEmbedding();
 * ```
 *
 * @see {@link embedText} for single text embedding
 * @see {@link unloadEmbedding} for releasing memory
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

// Re-export isModelAvailable for test utilities
export { isModelAvailable };
