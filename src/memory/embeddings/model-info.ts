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
 * Return all candidate directories where the model might be cached.
 *
 * Priority order (matches @huggingface/transformers env.js behavior):
 * 1. TRANSFORMERS_CACHE env var (explicit override)
 * 2. HF_HOME/hub (HuggingFace home override)
 * 3. XDG_CACHE_HOME/huggingface/hub (XDG standard)
 * 4. ~/.cache/huggingface/hub (standard HF Hub path)
 * 5. @huggingface/transformers package-local .cache/ (Transformers.js default)
 *
 * NOTE: This function uses only node:fs, node:os, node:path, node:module —
 * no native imports. The RSS guard (scripts/check-model-info-rss.mjs) enforces this.
 */
function getCandidateModelDirs(): string[] {
  const dirs: string[] = [];

  if (process.env['TRANSFORMERS_CACHE']) {
    dirs.push(process.env['TRANSFORMERS_CACHE']);
  }
  if (process.env['HF_HOME']) {
    dirs.push(join(process.env['HF_HOME'], 'hub'));
  }
  if (process.env['XDG_CACHE_HOME']) {
    dirs.push(join(process.env['XDG_CACHE_HOME'], 'huggingface', 'hub'));
  }

  dirs.push(DEFAULT_MODEL_DIR);

  // Transformers.js package-local .cache/ — the actual default when no env vars are set.
  // Resolved via require.resolve to avoid importing the package (zero-native contract).
  try {
    const _require = createRequire(import.meta.url);
    const pkgMain = _require.resolve('@huggingface/transformers');
    // Walk up from the entry point to find the package root (dir with package.json)
    let dir = dirname(pkgMain);
    for (let depth = 0; depth < 5; depth++) {
      if (existsSync(join(dir, 'package.json'))) {
        dirs.push(join(dir, '.cache'));
        break;
      }
      dir = dirname(dir);
    }
  } catch {
    // @huggingface/transformers not installed or not resolvable — skip
  }

  return dirs;
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
  return getCandidateModelDirs().some((dir) => existsSync(join(dir, MODEL_FILENAME)));
}

/**
 * Return the cache directory where the model is currently stored,
 * or the default HuggingFace Hub path if not found anywhere.
 *
 * Used by CLI commands that need to display the model path to users.
 */
export function getModelCacheDir(): string {
  for (const dir of getCandidateModelDirs()) {
    if (existsSync(join(dir, MODEL_FILENAME))) {
      return dir;
    }
  }
  return DEFAULT_MODEL_DIR;
}
