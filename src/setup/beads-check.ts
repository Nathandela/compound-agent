/**
 * Beads CLI availability checker.
 *
 * Informational only -- never blocks setup.
 */

import { execSync } from 'node:child_process';

/** Result of Beads CLI availability check. */
export interface BeadsCheckResult {
  /** Whether the `bd` CLI is available on PATH. */
  available: boolean;
  /** Informational message when not available. */
  message?: string;
}

/**
 * Check whether the Beads CLI (`bd`) is available.
 *
 * Non-blocking: always resolves, never throws.
 */
export async function checkBeadsAvailable(): Promise<BeadsCheckResult> {
  try {
    execSync('which bd', { stdio: 'pipe', encoding: 'utf-8' });
    return { available: true };
  } catch {
    return {
      available: false,
      message:
        'Beads CLI not found. Recommended for full workflow (issue tracking, deps, TDD pipeline). Install: https://github.com/Nathandela/beads',
    };
  }
}
