/**
 * Text embedding via node-llama-cpp with EmbeddingGemma model
 *
 * **Resource lifecycle:**
 * - Model is loaded lazily on first embedding call (~400MB in memory)
 * - Once loaded, the model remains in memory until `unloadEmbedding()` is called
 * - Loading is slow (~1-3s); keeping loaded improves subsequent call performance
 *
 * **Memory usage:**
 * - Embedding model: ~400MB RAM when loaded
 * - Embeddings themselves: ~3KB per embedding (768 dimensions x 4 bytes)
 *
 * @see {@link unloadEmbedding} for releasing memory
 * @see {@link getEmbedding} for the lazy-loading mechanism
 */

import type { Llama, LlamaModel } from 'node-llama-cpp';
import { getLlama, LlamaEmbeddingContext, LlamaLogLevel } from 'node-llama-cpp';

import { isModelAvailable, resolveModel } from './model.js';

/** Singleton embedding context */
let embeddingContext: LlamaEmbeddingContext | null = null;
/** Pending initialization promise (prevents concurrent duplicate loads) */
let pendingInit: Promise<LlamaEmbeddingContext> | null = null;
/** Native resource refs for proper cleanup */
let llamaInstance: Llama | null = null;
let modelInstance: LlamaModel | null = null;

/**
 * Get the LlamaEmbeddingContext instance for generating embeddings.
 *
 * **Lazy loading behavior:**
 * - First call loads the embedding model (~400MB) into memory
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
  if (pendingInit) return pendingInit;

  pendingInit = (async () => {
    try {
      const modelPath = await resolveModel({ cli: true });
      llamaInstance = await getLlama({
        build: 'never',                  // Never compile from source in a deployed tool
        progressLogs: false,             // Suppress prebuilt binary fallback warnings
        logLevel: LlamaLogLevel.error,   // Only surface real errors from C++ backend
        // Set NODE_LLAMA_CPP_DEBUG=true to re-enable all output for troubleshooting
      });
      modelInstance = await llamaInstance.loadModel({ modelPath });
      embeddingContext = await modelInstance.createEmbeddingContext();
      return embeddingContext;
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
 * This is intended for CLI shutdown paths that must wait for the native addon
 * to release worker threads before allowing the process to exit.
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

  const context = embeddingContext;
  const model = modelInstance;
  const llama = llamaInstance;

  embeddingContext = null;
  modelInstance = null;
  llamaInstance = null;
  pendingInit = null;

  // Dispose sequentially inner-to-outer (context → model → llama).
  // Concurrent disposal via Promise.allSettled caused SIGABRT when the
  // model was freed while the context still held a reference to it.
  if (context) {
    try { await context.dispose(); } catch { /* ignore cleanup errors */ }
  }
  if (model) {
    try { await model.dispose(); } catch { /* ignore cleanup errors */ }
  }
  if (llama) {
    try { await llama.dispose(); } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Unload the embedding context to free memory (~400MB).
 *
 * **Resource lifecycle:**
 * - Disposes the underlying LlamaEmbeddingContext
 * - Releases ~400MB of RAM used by the model
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
  void unloadEmbeddingResources();
}

/**
 * Run a callback with embedding resources, guaranteeing cleanup.
 *
 * The model loads lazily on the first embedText/embedTexts call inside
 * the callback (via the existing singleton). After the callback completes
 * or throws, all native resources (~400MB) are disposed.
 *
 * Use this instead of manually pairing embedText with unloadEmbeddingResources.
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
 * **Lazy loading:** First call loads the embedding model (~400MB, ~1-3s).
 * Subsequent calls use the cached model and complete in milliseconds.
 *
 * @param text - The text to embed
 * @returns A 768-dimensional Float32Array vector
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
export async function embedText(text: string): Promise<Float32Array> {
  const ctx = await getEmbedding();
  const result = await ctx.getEmbeddingFor(text);
  return new Float32Array(result.vector);
}

/**
 * Embed multiple texts into vectors.
 *
 * **Lazy loading:** First call loads the embedding model (~400MB, ~1-3s).
 * Subsequent calls use the cached model.
 *
 * **Note:** Texts are embedded sequentially (node-llama-cpp uses a mutex lock).
 * The only advantage over a manual loop is shared model initialization.
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
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const ctx = await getEmbedding();
  const results: Float32Array[] = [];

  for (const text of texts) {
    const result = await ctx.getEmbeddingFor(text);
    results.push(new Float32Array(result.vector));
  }

  return results;
}

// Re-export isModelAvailable for test utilities
export { isModelAvailable };
