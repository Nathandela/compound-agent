/**
 * Beads CLI availability checker.
 *
 * Informational only -- never blocks setup.
 * Synchronous: uses execSync internally.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
 * Non-blocking: never throws.
 */
export function checkBeadsAvailable(): BeadsCheckResult {
  try {
    execSync('command -v bd', { shell: '/bin/sh', stdio: 'pipe', encoding: 'utf-8' });
    return { available: true };
  } catch {
    return {
      available: false,
      message:
        'Beads CLI not found. Recommended for full workflow (issue tracking, deps, TDD pipeline). Install: https://github.com/Nathandela/beads',
    };
  }
}

/** Check whether the beads repository is initialized (.beads/ directory exists). */
export function checkBeadsInitialized(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.beads'));
}

/** Run `bd doctor` and check if beads is healthy. Non-blocking: never throws. */
export function checkBeadsHealthy(repoRoot: string): { healthy: boolean; message?: string } {
  try {
    execSync('bd doctor', { cwd: repoRoot, shell: '/bin/sh', stdio: 'pipe', encoding: 'utf-8' });
    return { healthy: true };
  } catch (e: unknown) {
    const msg = e instanceof Error && 'stderr' in e ? String((e as { stderr: unknown }).stderr).trim() : 'bd doctor failed';
    return { healthy: false, message: msg };
  }
}

/** Full beads health check combining CLI, init, and doctor. */
export interface BeadsFullCheck {
  cliAvailable: boolean;
  initialized: boolean;
  healthy: boolean;
  healthMessage?: string;
}

export function runFullBeadsCheck(repoRoot: string): BeadsFullCheck {
  const cli = checkBeadsAvailable();
  if (!cli.available) {
    return { cliAvailable: false, initialized: false, healthy: false, healthMessage: cli.message };
  }
  const initialized = checkBeadsInitialized(repoRoot);
  if (!initialized) {
    return { cliAvailable: true, initialized: false, healthy: false };
  }
  const health = checkBeadsHealthy(repoRoot);
  return { cliAvailable: true, initialized: true, healthy: health.healthy, healthMessage: health.message };
}
