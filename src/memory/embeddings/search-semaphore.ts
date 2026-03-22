/**
 * Cross-process counting semaphore for embedding model loads.
 *
 * Prevents 30+ concurrent subagents from each loading a ~370MB
 * embedding model. Uses unique claim files per process with
 * PID-based liveness checks and stale detection.
 *
 * Design: Each process writes its own `claim-{pid}.lock` file.
 * Slot admission is determined by sorting active claims by
 * startedAt timestamp (PID tiebreak) and checking whether
 * the process's position is within the allowed concurrency.
 *
 * This eliminates the TOCTOU race of the prior fixed-slot design,
 * where two processes could both delete+reclaim the same stale slot.
 * With unique files, no process ever deletes another live process's file.
 *
 * Slot directory: {repoRoot}/.claude/.cache/embed-slots/
 * Claim files: claim-{pid}.lock
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

function claimFilePath(repoRoot: string, pid: number): string {
  return join(slotDir(repoRoot), `claim-${pid}.lock`);
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

/** Read and parse a claim file. Returns null on any error or invalid shape. */
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
 * Remove stale claim files and legacy slot-*.lock files.
 * Only deletes files for dead processes or expired claims.
 */
function cleanStaleClaims(dir: string): void {
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.lock')) continue;
      const filePath = join(dir, file);

      // Clean up legacy slot-*.lock files from prior implementation
      if (file.startsWith('slot-')) {
        const content = readSlot(filePath);
        if (!content || isSlotStale(content)) {
          try { unlinkSync(filePath); } catch { /* already gone */ }
        }
        continue;
      }

      if (!file.startsWith('claim-')) continue;
      const content = readSlot(filePath);
      if (!content || isSlotStale(content)) {
        try { unlinkSync(filePath); } catch { /* already gone */ }
      }
    }
  } catch {
    // Directory gone or unreadable
  }
}

/**
 * Read all active (non-stale) claims, sorted by startedAt then PID.
 * Deterministic ordering ensures all processes agree on slot assignment.
 */
function readActiveClaims(dir: string): SlotContent[] {
  const active: SlotContent[] = [];
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.startsWith('claim-') || !file.endsWith('.lock')) continue;
      const content = readSlot(join(dir, file));
      if (content && !isSlotStale(content)) {
        active.push(content);
      }
    }
  } catch {
    // Directory gone or unreadable
  }
  active.sort((a, b) => {
    const tA = new Date(a.startedAt).getTime();
    const tB = new Date(b.startedAt).getTime();
    if (tA !== tB) return tA - tB;
    return a.pid - b.pid;
  });
  return active;
}

/**
 * Acquire a search slot for embedding model load.
 *
 * Writes a unique claim file, then checks position among all active claims.
 * If within the allowed concurrency, returns a release callback.
 * Otherwise removes the claim and returns the active count.
 */
export function acquireSearchSlot(repoRoot: string): SearchSlotResult {
  const dir = slotDir(repoRoot);
  mkdirSync(dir, { recursive: true });

  const max = getMaxConcurrent();

  // Phase 1: Clean up stale claims
  cleanStaleClaims(dir);

  // Phase 2: Write our unique claim file
  const ourPath = claimFilePath(repoRoot, process.pid);
  const content: SlotContent = { pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(ourPath, JSON.stringify(content));

  // Phase 3: Read all active claims and determine our position
  const active = readActiveClaims(dir);
  const ourIndex = active.findIndex((c) => c.pid === process.pid);

  if (ourIndex >= 0 && ourIndex < max) {
    return {
      acquired: true,
      release: () => {
        try { unlinkSync(ourPath); } catch { /* already gone */ }
      },
    };
  }

  // Not acquired -- remove our claim and report busy
  try { unlinkSync(ourPath); } catch { /* already gone */ }
  const activeCount = ourIndex >= 0 ? active.length - 1 : active.length;
  return { acquired: false, activeCount: Math.max(0, activeCount) };
}

/**
 * Count active (non-stale) claims.
 * Does not clean up stale claims -- just counts live ones.
 */
export function countActiveSlots(repoRoot: string): number {
  const dir = slotDir(repoRoot);
  if (!existsSync(dir)) return 0;

  let count = 0;
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.startsWith('claim-') || !file.endsWith('.lock')) continue;
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
