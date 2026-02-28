/**
 * Background embedding: spawn a detached worker or run embedding in-process.
 *
 * spawnBackgroundEmbed(repoRoot) - spawns detached child process (sync, non-blocking)
 * runBackgroundEmbed(repoRoot)   - worker entry point that does the actual embedding
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  // Resolve CLI path relative to this module
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const cliPath = join(thisDir, '..', '..', 'cli.js');

  const child = spawn('node', [cliPath, 'embed-worker', repoRoot], {
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
  // Open DB first so lock/status/embed all work
  const { openKnowledgeDb } = await import('../storage/sqlite-knowledge/index.js');
  openKnowledgeDb(repoRoot);

  const lock = acquireEmbedLock(repoRoot);
  if (!lock.acquired) return;

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
