/**
 * Pre-warm lesson embedding cache.
 *
 * Embeds all lessons that are missing or have stale cached embeddings.
 * Called after `ca init` or index rebuild so the first `ca search` is fast.
 */

import { isModelAvailable } from '../embeddings/model-info.js';
import { embedText } from '../embeddings/index.js';
import {
  contentHash,
  getCachedEmbeddingsBulk,
  readAllFromSqlite,
  setCachedEmbedding,
  syncIfNeeded,
} from '../storage/index.js';

export interface PreWarmResult {
  embedded: number;
  skipped: number;
}

/**
 * Pre-warm lesson embeddings so the first search is fast.
 *
 * 1. Checks model availability (returns early if unavailable)
 * 2. Syncs SQLite from JSONL
 * 3. Reads all non-invalidated items
 * 4. Finds items with missing or stale cached embeddings
 * 5. Embeds and caches them
 *
 * @param repoRoot - Absolute path to repository root
 * @returns Counts of embedded and skipped items
 */
export async function preWarmLessonEmbeddings(repoRoot: string): Promise<PreWarmResult> {
  if (!isModelAvailable()) {
    return { embedded: 0, skipped: 0 };
  }

  await syncIfNeeded(repoRoot);
  const items = readAllFromSqlite(repoRoot);

  if (items.length === 0) {
    return { embedded: 0, skipped: 0 };
  }

  const cached = getCachedEmbeddingsBulk(repoRoot);

  const toEmbed: Array<{ id: string; text: string; hash: string }> = [];
  for (const item of items) {
    const hash = contentHash(item.trigger, item.insight);
    const entry = cached.get(item.id);
    if (!entry || entry.hash !== hash) {
      toEmbed.push({ id: item.id, text: `${item.trigger} ${item.insight}`, hash });
    }
  }

  if (toEmbed.length === 0) {
    return { embedded: 0, skipped: items.length };
  }

  let embedded = 0;
  for (const { id, text, hash } of toEmbed) {
    const vector = await embedText(text);
    setCachedEmbedding(repoRoot, id, vector, hash);
    embedded++;
  }

  return { embedded, skipped: items.length - embedded };
}
