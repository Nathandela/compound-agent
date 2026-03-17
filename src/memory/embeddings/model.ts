/**
 * Embedding model resolution using node-llama-cpp's built-in resolver.
 *
 * Uses resolveModelFile for automatic download and caching.
 * Model is stored in ~/.node-llama-cpp/models/ by default.
 *
 * Lightweight metadata (MODEL_URI, MODEL_FILENAME, DEFAULT_MODEL_DIR,
 * isModelAvailable) lives in model-info.ts to avoid pulling native deps
 * into consumers that only need an fs existence check.
 */

import { join } from 'node:path';
import { getLlama, LlamaLogLevel, resolveModelFile } from 'node-llama-cpp';

// Re-export lightweight metadata from model-info.ts (zero native imports)
export { DEFAULT_MODEL_DIR, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

// Local import for use within this module (re-export doesn't bind locally)
import { DEFAULT_MODEL_DIR, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

/** Cached usability result (per-process) */
let cachedUsability: UsabilityResult | null = null;

/**
 * Result of checking if the model is usable at runtime.
 *
 * A discriminated union where `usable` determines which fields are present:
 * - usable=true: Model can initialize and create embedding context
 * - usable=false: Model cannot be used, with reason and actionable fix
 */
export type UsabilityResult =
  | { usable: true; reason?: undefined; action?: undefined }
  | { usable: false; reason: string; action: string };

/**
 * Check if the embedding model is usable at runtime.
 *
 * Goes beyond file existence to verify the model can actually initialize:
 * 1. Checks if model file exists (fast fail)
 * 2. Attempts to load llama runtime
 * 3. Attempts to load model
 * 4. Attempts to create embedding context
 * 5. Cleans up all resources after check
 *
 * WARNING: This function allocates ~400MB of native C++ memory for the probe.
 * NEVER call at module top-level in test files. When dispose() SIGABRTs in
 * vitest workers, that memory is permanently leaked. For test skip-gating,
 * use isModelAvailable() instead (zero native allocation). Reserve this
 * function for production code paths where runtime verification is needed.
 *
 * @returns UsabilityResult with usable status and actionable error if failed
 */
export async function isModelUsable(): Promise<UsabilityResult> {
  // Return cached result if available (avoids double initialization)
  if (cachedUsability !== null) {
    return cachedUsability;
  }

  // Fast fail if model file doesn't exist
  if (!isModelAvailable()) {
    cachedUsability = {
      usable: false,
      reason: 'Embedding model file not found',
      action: 'Run: npx ca download-model',
    };
    return cachedUsability;
  }

  // Attempt runtime initialization
  let llama = null;
  let model = null;
  let context = null;

  try {
    const modelPath = join(DEFAULT_MODEL_DIR, MODEL_FILENAME);

    // Step 1: Get llama runtime
    llama = await getLlama({
      build: 'never',                  // Never compile from source in a deployed tool
      progressLogs: false,             // Suppress prebuilt binary fallback warnings
      logLevel: LlamaLogLevel.error,   // Only surface real errors from C++ backend
      // Set NODE_LLAMA_CPP_DEBUG=true to re-enable all output for troubleshooting
    });

    // Step 2: Load model
    model = await llama.loadModel({ modelPath });

    // Step 3: Create embedding context
    context = await model.createEmbeddingContext();

    // Success - cache and return
    cachedUsability = { usable: true };
    return cachedUsability;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    cachedUsability = {
      usable: false,
      reason: `Embedding model runtime initialization failed: ${message}`,
      action: 'Check system compatibility or reinstall: npx ca download-model',
    };
    return cachedUsability;
  } finally {
    // Clean up resources in reverse order
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
}

/**
 * Clear the cached usability result.
 *
 * Primarily for testing purposes. Clears the cached result so the next
 * call to isModelUsable() will perform a fresh check.
 */
export function clearUsabilityCache(): void {
  cachedUsability = null;
}

/**
 * Resolve the embedding model path, downloading if necessary.
 *
 * Uses node-llama-cpp's resolveModelFile for automatic download with progress.
 *
 * @param options - Optional configuration
 * @param options.cli - Show download progress in console (default: true)
 * @returns Path to the resolved model file
 *
 * @example
 * ```typescript
 * const modelPath = await resolveModel();
 * const llama = await getLlama({ build: 'never', logLevel: LlamaLogLevel.error });
 * const model = await llama.loadModel({ modelPath });
 * ```
 */
export async function resolveModel(options: { cli?: boolean } = {}): Promise<string> {
  const { cli = true } = options;
  return resolveModelFile(MODEL_URI, { cli });
}
