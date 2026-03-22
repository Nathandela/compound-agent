/**
 * Cross-process counting semaphore for embedding model loads.
 *
 * Prevents 30+ concurrent subagents from each loading a ~370MB
 * embedding model. Uses directory-based slot files with PID-based
 * liveness checks and stale detection.
 *
 * Slot directory: {repoRoot}/.claude/.cache/embed-slots/
 * Slot files: slot-0.lock, slot-1.lock, ... slot-(N-1).lock
 * Content: { pid: number, startedAt: string } (ISO timestamp)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SlotAcquired { acquired: true; release: () => void; }
export interface SlotBusy { acquired: false; activeCount: number; }
export type SearchSlotResult = SlotAcquired | SlotBusy;

export const DEFAULT_MAX_CONCURRENT = 2;

/** Max slot age before considered expired (1 hour). */
const SLOT_MAX_AGE_MS = 60 * 60 * 1000;

interface SlotContent {
  pid: number;
  startedAt: string;
}

function slotDir(repoRoot: string): string {
  return join(repoRoot, '.claude', '.cache', 'embed-slots');
}

function slotPath(repoRoot: string, index: number): string {
  return join(slotDir(repoRoot), `slot-${index}.lock`);
}

/** Read CA_MAX_EMBED_SLOTS env var, falling back to DEFAULT_MAX_CONCURRENT. */
export function getMaxConcurrent(): number {
  const raw = process.env.CA_MAX_EMBED_SLOTS;
  if (!raw) return DEFAULT_MAX_CONCURRENT;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_CONCURRENT;
  return parsed;
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

/** Read and parse a slot file. Returns null on any error or invalid shape. */
function readSlot(filePath: string): SlotContent | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Record<string, unknown>).pid === 'number' &&
      typeof (parsed as Record<string, unknown>).startedAt === 'string'
    ) {
      return parsed as SlotContent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a slot file is stale (dead PID or expired). */
function isSlotStale(content: SlotContent): boolean {
  if (!isProcessAlive(content.pid)) return true;
  const age = Date.now() - new Date(content.startedAt).getTime();
  return age >= SLOT_MAX_AGE_MS;
}

/**
 * Try to claim a single slot file. Returns true if acquired.
 * Uses 'wx' flag for atomic exclusive creation.
 */
function tryClaimSlot(filePath: string): boolean {
  const content: SlotContent = { pid: process.pid, startedAt: new Date().toISOString() };
  try {
    writeFileSync(filePath, JSON.stringify(content), { flag: 'wx' });
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

    // Slot file exists -- check for staleness
    const existing = readSlot(filePath);
    if (!existing || isSlotStale(existing)) {
      // Stale -- delete then re-create atomically
      try { unlinkSync(filePath); } catch { /* already gone */ }
      try {
        writeFileSync(filePath, JSON.stringify(content), { flag: 'wx' });
        // Verify we still own it (another process may have stolen it via TOCTOU)
        const verify = readSlot(filePath);
        if (!verify || verify.pid !== process.pid) return false;
        return true;
      } catch {
        // Another process won the race
        return false;
      }
    }

    return false;
  }
}

function releaseSlot(filePath: string): void {
  try {
    // Verify ownership before deleting (prevents releasing another process's slot)
    const content = readSlot(filePath);
    if (content && content.pid !== process.pid) return;
    unlinkSync(filePath);
  } catch {
    // Silently ignore -- slot may already be removed
  }
}

/**
 * Acquire a search slot for embedding model load.
 *
 * Tries each slot index 0..max-1. On success returns a release callback.
 * On failure returns the active slot count.
 */
export function acquireSearchSlot(repoRoot: string): SearchSlotResult {
  const dir = slotDir(repoRoot);
  mkdirSync(dir, { recursive: true });

  const max = getMaxConcurrent();

  for (let i = 0; i < max; i++) {
    const file = slotPath(repoRoot, i);
    if (tryClaimSlot(file)) {
      return { acquired: true, release: () => releaseSlot(file) };
    }
  }

  return { acquired: false, activeCount: countActiveSlots(repoRoot) };
}

/**
 * Count active (non-stale) slots.
 * Does not clean up stale slots -- just counts live ones.
 */
export function countActiveSlots(repoRoot: string): number {
  const dir = slotDir(repoRoot);
  if (!existsSync(dir)) return 0;

  let count = 0;
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.startsWith('slot-') || !file.endsWith('.lock')) continue;
      const content = readSlot(join(dir, file));
      if (content && !isSlotStale(content)) {
        count++;
      }
    }
  } catch {
    // Directory gone or unreadable
  }
  return count;
}
