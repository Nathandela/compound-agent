/**
 * Embedding status file: tracks state of background embedding process.
 *
 * Status file lives at {repoRoot}/.claude/.cache/embed-status.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type EmbedStatus =
  | { state: 'idle' }
  | { state: 'running'; startedAt: string }
  | { state: 'completed'; chunksEmbedded: number; completedAt: string; durationMs: number }
  | { state: 'failed'; error: string; durationMs: number };

const STATUS_FILE = '.claude/.cache/embed-status.json';

function statusPath(repoRoot: string): string {
  return join(repoRoot, STATUS_FILE);
}

/** Write embedding status to disk. Creates parent directories if needed. */
export function writeEmbedStatus(repoRoot: string, status: EmbedStatus): void {
  const filePath = statusPath(repoRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf-8');
}

const VALID_STATES = new Set(['idle', 'running', 'completed', 'failed']);

/** Read embedding status from disk. Returns null on missing file, parse error, or invalid shape. */
export function readEmbedStatus(repoRoot: string): EmbedStatus | null {
  try {
    const raw = readFileSync(statusPath(repoRoot), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !VALID_STATES.has(parsed.state as string)) {
      return null;
    }
    return parsed as EmbedStatus;
  } catch {
    return null;
  }
}
