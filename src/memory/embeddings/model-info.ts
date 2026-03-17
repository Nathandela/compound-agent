/**
 * Lightweight model metadata — zero native imports.
 *
 * This module provides model constants and availability checks using only
 * Node.js built-ins (fs, os, path). It MUST NOT import node-llama-cpp or
 * any module that transitively imports it.
 *
 * Fragile contract: one accidental native import here breaks Epics 3 + 5.
 * CI check (scripts/check-model-info-rss.mjs) enforces RSS < 50 MB.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
export const DEFAULT_MODEL_DIR = join(homedir(), '.node-llama-cpp', 'models');

/**
 * Check if the embedding model is available locally (fs existence only).
 *
 * Use this for cheap pre-flight checks (e.g. spawnBackgroundEmbed) where
 * failure is handled gracefully. Use {@link isModelUsable} from model.ts
 * when you need runtime verification that the model can actually initialize.
 *
 * @returns true if model file exists
 */
export function isModelAvailable(): boolean {
  return existsSync(join(DEFAULT_MODEL_DIR, MODEL_FILENAME));
}
