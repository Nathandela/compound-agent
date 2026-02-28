/**
 * Embedding status file: tracks state of background embedding process.
 *
 * Status file lives at {repoRoot}/.claude/.cache/embed-status.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface EmbedStatus {
  state: 'idle' | 'running' | 'completed' | 'failed';
  chunksTotal?: number;
  chunksEmbedded?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  durationMs?: number;
}

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

/** Read embedding status from disk. Returns null on missing file or parse error. */
export function readEmbedStatus(repoRoot: string): EmbedStatus | null {
  try {
    const raw = readFileSync(statusPath(repoRoot), 'utf-8');
    return JSON.parse(raw) as EmbedStatus;
  } catch {
    return null;
  }
}
