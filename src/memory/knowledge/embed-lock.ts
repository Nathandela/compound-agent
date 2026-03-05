/**
 * PID-based lock file for embedding processes.
 *
 * Prevents concurrent embedding when background embed (ca init/setup)
 * and post-commit hook run simultaneously.
 *
 * Lock file: {repoRoot}/.claude/.cache/embed.lock
 * Content: { pid: number, startedAt: string } (ISO timestamp)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

interface LockAcquired {
  acquired: true;
  release: () => void;
}

interface LockBusy {
  acquired: false;
  holder: number;
}

export type LockResult = LockAcquired | LockBusy;

/** Max lock age before considered expired (1 hour). */
const LOCK_MAX_AGE_MS = 60 * 60 * 1000;

interface LockContent {
  pid: number;
  startedAt: string;
}

function lockPath(repoRoot: string): string {
  return join(repoRoot, '.claude', '.cache', 'embed.lock');
}

function lockDir(repoRoot: string): string {
  return join(repoRoot, '.claude', '.cache');
}

/** Check if a process is alive via kill(pid, 0). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse lock file. Returns null on any error or invalid shape. */
function readLock(filePath: string): LockContent | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Record<string, unknown>).pid === 'number' &&
      typeof (parsed as Record<string, unknown>).startedAt === 'string'
    ) {
      return parsed as LockContent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Acquire the embed lock for this process.
 *
 * Uses writeFileSync with 'wx' flag for atomic exclusive creation.
 * On EEXIST: reads holder PID and checks staleness via process.kill(pid, 0).
 * If stale (holder dead): overwrites lock. If alive: returns acquired: false.
 */
export function acquireEmbedLock(repoRoot: string): LockResult {
  const dir = lockDir(repoRoot);
  const file = lockPath(repoRoot);
  const content: LockContent = { pid: process.pid, startedAt: new Date().toISOString() };

  mkdirSync(dir, { recursive: true });

  try {
    writeFileSync(file, JSON.stringify(content), { flag: 'wx' });
    return { acquired: true, release: () => releaseLock(file) };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

    // Lock file exists -- check if holder is alive and lock is not expired
    const existing = readLock(file);
    if (existing && isProcessAlive(existing.pid)) {
      const lockAge = Date.now() - new Date(existing.startedAt).getTime();
      if (lockAge < LOCK_MAX_AGE_MS) {
        return { acquired: false, holder: existing.pid };
      }
      // Lock expired -- fall through to overwrite
    }

    // Stale lock -- delete then re-create atomically with 'wx'
    try { unlinkSync(file); } catch { /* already gone */ }
    try {
      writeFileSync(file, JSON.stringify(content), { flag: 'wx' });
      return { acquired: true, release: () => releaseLock(file) };
    } catch {
      // Another process won the race
      const winner = readLock(file);
      return { acquired: false, holder: winner?.pid ?? -1 };
    }
  }
}

/** Check if an embed lock is currently held by a live process. */
export function isEmbedLocked(repoRoot: string): boolean {
  const file = lockPath(repoRoot);
  if (!existsSync(file)) return false;

  const content = readLock(file);
  if (!content) return false;

  return isProcessAlive(content.pid);
}

function releaseLock(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // Silently ignore -- lock may already be removed
  }
}
