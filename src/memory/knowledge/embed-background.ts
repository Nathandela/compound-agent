/**
 * Background embedding: spawn a detached worker or run embedding in-process.
 *
 * spawnBackgroundEmbed(repoRoot) - spawns detached child process (sync, non-blocking)
 * runBackgroundEmbed(repoRoot)   - worker entry point that does the actual embedding
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { isModelAvailable, unloadEmbedding } from '../embeddings/index.js';
import { closeKnowledgeDb } from '../storage/sqlite-knowledge/index.js';
import { acquireEmbedLock, isEmbedLocked } from './embed-lock.js';
import { writeEmbedStatus } from './embed-status.js';
import { embedChunks, getUnembeddedChunkCount } from './embed-chunks.js';

export interface SpawnEmbedResult {
  spawned: boolean;
  reason?: string;
  pid?: number;
}

/**
 * Spawn a detached background process to embed chunks.
 * Synchronous -- fires and forgets.
 *
 * Pre-flight checks (lock, model, count) are advisory only. The worker
 * acquires its own lock, so TOCTOU here cannot cause double-embedding --
 * at worst we spawn a worker that exits immediately.
 */
export function spawnBackgroundEmbed(repoRoot: string): SpawnEmbedResult {
  if (isEmbedLocked(repoRoot)) {
    return { spawned: false, reason: 'Embedding already in progress' };
  }
  if (!isModelAvailable()) {
    return { spawned: false, reason: 'Model not available' };
  }
  if (getUnembeddedChunkCount(repoRoot) === 0) {
    return { spawned: false, reason: 'All chunks already embedded' };
  }

  // Use npx to resolve the CLI -- works in dev, built, and installed contexts
  const child = spawn('npx', ['ca', 'embed-worker', repoRoot], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return { spawned: true, pid: child.pid };
}

/**
 * Worker entry point: acquire lock, embed chunks, write status, clean up.
 */
export async function runBackgroundEmbed(repoRoot: string): Promise<void> {
  const lock = acquireEmbedLock(repoRoot);
  if (!lock.acquired) return;

  // Open DB after lock to avoid leaking connection on contention
  const { openKnowledgeDb } = await import('../storage/sqlite-knowledge/index.js');
  openKnowledgeDb(repoRoot);

  const start = Date.now();
  writeEmbedStatus(repoRoot, { state: 'running', startedAt: new Date().toISOString() });

  try {
    const result = await embedChunks(repoRoot, { onlyMissing: true });
    writeEmbedStatus(repoRoot, {
      state: 'completed',
      chunksEmbedded: result.chunksEmbedded,
      completedAt: new Date().toISOString(),
      durationMs: result.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    writeEmbedStatus(repoRoot, {
      state: 'failed',
      error: msg,
      durationMs: Date.now() - start,
    });
  } finally {
    unloadEmbedding();
    closeKnowledgeDb();
    lock.release();
  }
}

/**
 * Index docs/ and spawn background embedding if docs/ exists.
 * Shared helper for init and setup commands.
 *
 * @returns SpawnEmbedResult or null if docs/ doesn't exist
 */
export async function indexAndSpawnEmbed(repoRoot: string): Promise<SpawnEmbedResult | null> {
  const docsPath = join(repoRoot, 'docs');
  if (!existsSync(docsPath)) return null;
  const { indexDocs } = await import('./indexing.js');
  await indexDocs(repoRoot);
  return spawnBackgroundEmbed(repoRoot);
}
