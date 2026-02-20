/**
 * User-scope detection - warns when installing at home directory level.
 */

import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

/** Result of scope detection. */
export interface ScopeCheckResult {
  /** Whether the repo root is at user scope (homedir or direct child). */
  isUserScope: boolean;
  /** Warning message when user-scope is detected. */
  message?: string;
}

/**
 * Detect whether repoRoot is at user scope (homedir or direct child of homedir).
 *
 * User-scope reduces compounding value because lessons are shared across projects.
 */
export function checkUserScope(repoRoot: string): ScopeCheckResult {
  const home = homedir();
  const resolved = resolve(repoRoot);

  const isHome = resolved === home;
  const isDirectChild = dirname(resolved) === home;

  if (isHome || isDirectChild) {
    return {
      isUserScope: true,
      message:
        'Warning: Installing at user scope. compound-agent works best at repository scope where lessons are codebase-specific. User-scope means lessons shared across all projects, reducing compounding value. Consider running inside a specific repository.',
    };
  }

  return { isUserScope: false };
}
