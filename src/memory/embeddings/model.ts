/**
 * Embedding model resolution using node-llama-cpp's built-in resolver.
 *
 * Uses resolveModelFile for automatic download and caching.
 * Model is stored in ~/.node-llama-cpp/models/ by default.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getLlama, resolveModelFile } from 'node-llama-cpp';

/**
 * HuggingFace URI for EmbeddingGemma-300M (Q4_0 quantization).
 *
 * - Size: ~278MB
 * - Dimensions: 768 (default), supports MRL truncation to 512/256/128
 * - Context: 2048 tokens
 */
export const MODEL_URI = 'hf:ggml-org/embeddinggemma-300M-qat-q4_0-GGUF/embeddinggemma-300M-qat-Q4_0.gguf';

/**
 * Expected model filename after download.
 * node-llama-cpp uses format: hf_{org}_{filename}
 */
export const MODEL_FILENAME = 'hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf';

/** Default model directory used by node-llama-cpp */
const DEFAULT_MODEL_DIR = join(homedir(), '.node-llama-cpp', 'models');

/** Cached usability result (per-process) */
let cachedUsability: UsabilityResult | null = null;

/**
 * Check if the embedding model is available locally.
 *
 * @returns true if model file exists
 */
export function isModelAvailable(): boolean {
  return existsSync(join(DEFAULT_MODEL_DIR, MODEL_FILENAME));
}

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
    llama = await getLlama();

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
      try {
        context.dispose();
      } catch {
        // Ignore cleanup errors
      }
    }
    // Note: model and llama don't have explicit dispose methods in node-llama-cpp
    // The GC will handle them when references are released
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
 * const llama = await getLlama();
 * const model = await llama.loadModel({ modelPath });
 * ```
 */
export async function resolveModel(options: { cli?: boolean } = {}): Promise<string> {
  const { cli = true } = options;
  return resolveModelFile(MODEL_URI, { cli });
}
