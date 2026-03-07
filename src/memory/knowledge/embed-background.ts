/**
 * Background embedding: spawn a detached worker or run embedding in-process.
 *
 * spawnBackgroundEmbed(repoRoot) - spawns detached child process (sync, non-blocking)
 * runBackgroundEmbed(repoRoot)   - worker entry point that does the actual embedding
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isModelAvailable, withEmbedding } from '../embeddings/index.js';
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
 * Resolve the CLI entry point for spawning the embed-worker subprocess.
 *
 * Strategy: walk up from this module to find dist/cli.js (works in both
 * bundled output and dev). Falls back to npx ca if not found.
 */
function resolveCliInvocation(): { command: string; args: string[] } {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'dist', 'cli.js');
    if (existsSync(candidate)) {
      return { command: process.execPath, args: [candidate] };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { command: 'npx', args: ['ca'] };
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

  const cli = resolveCliInvocation();
  const child = spawn(cli.command, [...cli.args, 'embed-worker', repoRoot], {
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
    const result = await withEmbedding(async () => embedChunks(repoRoot, { onlyMissing: true }));
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
