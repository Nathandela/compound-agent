/**
 * Embedding model resolution using Transformers.js auto-download.
 *
 * Uses @huggingface/transformers pipeline API which automatically downloads
 * and caches ONNX models from HuggingFace Hub.
 * Model is stored in ~/.cache/huggingface/hub/ by default.
 *
 * Lightweight metadata (MODEL_URI, MODEL_FILENAME, DEFAULT_MODEL_DIR,
 * isModelAvailable) lives in model-info.ts to avoid pulling heavy deps
 * into consumers that only need an fs existence check.
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers';

// Re-export lightweight metadata from model-info.ts (zero native imports)
export { DEFAULT_MODEL_DIR, EMBEDDING_DIMS, EMBEDDING_MODEL_ID, isModelAvailable, MODEL_FILENAME, MODEL_URI } from './model-info.js';

// Local import for use within this module (re-export doesn't bind locally)
import { isModelAvailable, MODEL_URI } from './model-info.js';

/** Cached usability result (per-process) */
let cachedUsability: UsabilityResult | null = null;

/**
 * Result of checking if the model is usable at runtime.
 *
 * A discriminated union where `usable` determines which fields are present:
 * - usable=true: Model can initialize and create embedding pipeline
 * - usable=false: Model cannot be used, with reason and actionable fix
 */
export type UsabilityResult =
  | { usable: true; reason?: undefined; action?: undefined }
  | { usable: false; reason: string; action: string };

/**
 * Check if the embedding model is usable at runtime.
 *
 * Goes beyond file existence to verify the model can actually initialize:
 * 1. Checks if model directory exists (fast fail)
 * 2. Attempts to create a Transformers.js pipeline
 * 3. Cleans up the pipeline after check
 *
 * Much lighter than the previous embedding probe (~23MB vs ~431MB).
 *
 * @returns UsabilityResult with usable status and actionable error if failed
 */
export async function isModelUsable(): Promise<UsabilityResult> {
  // Return cached result if available (avoids double initialization)
  if (cachedUsability !== null) {
    return cachedUsability;
  }

  // Fast fail if model directory doesn't exist
  if (!isModelAvailable()) {
    cachedUsability = {
      usable: false,
      reason: 'Embedding model not found in HuggingFace cache',
      action: 'Run: npx ca download-model',
    };
    return cachedUsability;
  }

  // Attempt runtime initialization
  let testPipeline: FeatureExtractionPipeline | null = null;

  try {
    const { pipeline } = await import('@huggingface/transformers');
    testPipeline = await pipeline('feature-extraction', MODEL_URI, {
      dtype: 'q8',
    }) as FeatureExtractionPipeline;

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
    // Clean up test pipeline
    if (testPipeline?.dispose) {
      try { await testPipeline.dispose(); } catch { /* ignore cleanup errors */ }
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
 * Resolve the embedding model, downloading if necessary.
 *
 * Uses Transformers.js pipeline API which auto-downloads from HuggingFace Hub.
 * The pipeline is created and immediately disposed — the model files persist
 * in the HuggingFace cache directory.
 *
 * @param options - Optional configuration
 * @param options.cli - Show download progress in console (default: true)
 * @returns The model identifier string
 */
export async function resolveModel(options: { cli?: boolean } = {}): Promise<string> {
  const { cli = true } = options;

  if (isModelAvailable()) {
    return MODEL_URI;
  }

  // Trigger download by creating (and disposing) a pipeline
  if (cli) {
    console.log(`Downloading embedding model: ${MODEL_URI}...`);
  }

  const { pipeline } = await import('@huggingface/transformers');
  const p = await pipeline('feature-extraction', MODEL_URI, {
    dtype: 'q8',
  }) as FeatureExtractionPipeline;

  if (p.dispose) {
    try {
        await p.dispose();
    } catch {
        // Swallow disposal errors — model was successfully downloaded
    }
  }

  if (cli) {
    console.log('Model downloaded successfully.');
  }

  return MODEL_URI;
}
