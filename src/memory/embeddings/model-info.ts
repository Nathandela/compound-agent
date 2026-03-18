/**
 * Lightweight model metadata — zero native imports.
 *
 * This module provides model constants and availability checks using only
 * Node.js built-ins (fs, os, path). It MUST NOT import @huggingface/transformers
 * or any module that transitively imports it.
 *
 * Fragile contract: one accidental native import here breaks import graph decoupling.
 * CI check (scripts/check-model-info-rss.mjs) enforces RSS < 10 MB.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * HuggingFace model identifier for nomic-embed-text-v1.5.
 *
 * - Params: 137M
 * - Dimensions: 768 (default)
 * - Format: ONNX (quantized to q8 at load time)
 */
export const MODEL_URI = 'nomic-ai/nomic-embed-text-v1.5';

/**
 * Model identifier used for cache tagging and invalidation.
 * Include in content hashes to detect model changes.
 */
export const EMBEDDING_MODEL_ID = 'nomic-embed-text-v1.5-q8';

/** Embedding dimensions for the current model. */
export const EMBEDDING_DIMS = 768;

/**
 * Expected model directory name in HuggingFace cache.
 * HuggingFace stores models as: models--{org}--{name}
 */
export const MODEL_FILENAME = 'models--nomic-ai--nomic-embed-text-v1.5';

/** Default HuggingFace Hub cache directory */
export const DEFAULT_MODEL_DIR = join(homedir(), '.cache', 'huggingface', 'hub');

/**
 * Check if the embedding model is available locally (fs existence only).
 *
 * Uses the HuggingFace Hub cache structure: checks for the model directory
 * under ~/.cache/huggingface/hub/. The model is downloaded automatically
 * by Transformers.js on first pipeline creation.
 *
 * Use this for cheap pre-flight checks (e.g. spawnBackgroundEmbed) where
 * failure is handled gracefully. Use {@link isModelUsable} from model.ts
 * when you need runtime verification that the model can actually initialize.
 *
 * @returns true if model directory exists in HuggingFace cache
 */
export function isModelAvailable(): boolean {
  return existsSync(join(DEFAULT_MODEL_DIR, MODEL_FILENAME));
}
