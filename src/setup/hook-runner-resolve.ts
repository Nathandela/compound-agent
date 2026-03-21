/**
 * Resolve the hook-runner entrypoint path for setup templates.
 *
 * At setup time, resolves the absolute path to dist/hook-runner.js
 * so that Claude Code hooks can invoke it directly via `node` instead
 * of going through `npx ca`.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walk up from this module to find dist/hook-runner.js.
 * Returns the absolute path if found, undefined if not.
 */
export function resolveHookRunnerPath(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'dist', 'hook-runner.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Build the shell command for a hook invocation.
 * Uses direct node path if available, falls back to npx.
 */
export function makeHookCommand(hookRunnerPath: string | undefined, hookName: string): string {
  if (hookRunnerPath) {
    return `node "${hookRunnerPath}" ${hookName} 2>/dev/null || true`;
  }
  return `npx ca hooks run ${hookName} 2>/dev/null || true`;
}
