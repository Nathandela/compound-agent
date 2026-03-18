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
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * HuggingFace model identifier for nomic-embed-text-v1.5.
 *
 * - Params: 137M
 * - Dimensions: 768 (default)
 * - Format: ONNX Q8 (pre-quantized; downloaded from HuggingFace Hub)
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
 * Return full paths to where the model directory might be cached.
 *
 * Priority order (matches @huggingface/transformers env.js behavior):
 * 1. TRANSFORMERS_CACHE env var (explicit override) — HF Hub layout
 * 2. HF_HOME/hub (HuggingFace home override) — HF Hub layout
 * 3. XDG_CACHE_HOME/huggingface/hub (XDG standard) — HF Hub layout
 * 4. ~/.cache/huggingface/hub (standard HF Hub path) — HF Hub layout
 * 5. @huggingface/transformers package-local .cache/ — org/model layout
 *
 * NOTE: HF Hub layout uses `models--org--model` subdirectories.
 *       Transformers.js package-local layout uses `org/model` subdirectories.
 *       Both layouts are handled here.
 *
 * NOTE: This function uses only node:fs, node:os, node:path, node:module —
 * no native imports. The RSS guard (scripts/check-model-info-rss.mjs) enforces this.
 */
function getCandidateModelPaths(): string[] {
  const paths: string[] = [];

  // HF Hub-style cache locations: model is at <parent>/models--nomic-ai--nomic-embed-text-v1.5
  const hubParents: string[] = [];
  if (process.env['TRANSFORMERS_CACHE']) {
    hubParents.push(process.env['TRANSFORMERS_CACHE']);
  }
  if (process.env['HF_HOME']) {
    hubParents.push(join(process.env['HF_HOME'], 'hub'));
  }
  if (process.env['XDG_CACHE_HOME']) {
    hubParents.push(join(process.env['XDG_CACHE_HOME'], 'huggingface', 'hub'));
  }
  hubParents.push(DEFAULT_MODEL_DIR);

  for (const parent of hubParents) {
    paths.push(join(parent, MODEL_FILENAME));
  }

  // Transformers.js package-local .cache/ — the actual default when no env vars are set.
  // Uses org/model layout (not models--org--model), so we must build the full path here.
  // Resolved via require.resolve to avoid importing the package (zero-native contract).
  try {
    const _require = createRequire(import.meta.url);
    const pkgMain = _require.resolve('@huggingface/transformers');
    // Walk up from the entry point to find the package root (dir with package.json)
    let dir = dirname(pkgMain);
    for (let depth = 0; depth < 5; depth++) {
      if (existsSync(join(dir, 'package.json'))) {
        paths.push(join(dir, '.cache', 'nomic-ai', 'nomic-embed-text-v1.5'));
        break;
      }
      dir = dirname(dir);
    }
  } catch {
    // @huggingface/transformers not installed or not resolvable — skip
  }

  return paths;
}

/**
 * Check if the embedding model is available locally (fs existence only).
 *
 * Checks all candidate cache locations used by @huggingface/transformers:
 * the standard HuggingFace Hub path, env-var overrides, and the
 * package-local .cache/ directory (Transformers.js default).
 *
 * Use this for cheap pre-flight checks (e.g. spawnBackgroundEmbed) where
 * failure is handled gracefully. Use {@link isModelUsable} from model.ts
 * when you need runtime verification that the model can actually initialize.
 *
 * @returns true if model directory exists in any known cache location
 */
export function isModelAvailable(): boolean {
  return getCandidateModelPaths().some(existsSync);
}

/**
 * Return the full path to the model directory where it is currently stored,
 * or the default HuggingFace Hub model path if not found anywhere.
 *
 * Used by CLI commands that need to display the model path to users.
 */
export function getModelCacheDir(): string {
  const found = getCandidateModelPaths().find(existsSync);
  return found ?? join(DEFAULT_MODEL_DIR, MODEL_FILENAME);
}
