/**
 * Embedding model resolution using node-llama-cpp's built-in resolver.
 *
 * Uses resolveModelFile for automatic download and caching.
 * Model is stored in ~/.node-llama-cpp/models/ by default.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveModelFile } from 'node-llama-cpp';

/**
 * HuggingFace URI for EmbeddingGemma-300M (Q4_0 quantization).
 *
 * - Size: ~150MB
 * - Dimensions: 768 (default), supports MRL truncation to 512/256/128
 * - Context: 2048 tokens
 */
export const MODEL_URI = 'hf:ggml-org/embeddinggemma-300M-qat-q4_0-GGUF/embeddinggemma-300M-qat-q4_0.gguf';

/** Expected model filename after download */
export const MODEL_FILENAME = 'embeddinggemma-300M-qat-q4_0.gguf';

/** Default model directory used by node-llama-cpp */
const DEFAULT_MODEL_DIR = join(homedir(), '.node-llama-cpp', 'models');

/**
 * Check if the embedding model is available locally.
 *
 * @returns true if model file exists
 */
export function isModelAvailable(): boolean {
  return existsSync(join(DEFAULT_MODEL_DIR, MODEL_FILENAME));
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
