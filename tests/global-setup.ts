import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Ensures `dist/cli.js` exists before CLI integration tests run.
 * This runs once before the entire test suite starts.
 */
export function setup(): void {
  if (existsSync('dist/cli.js')) return;
  execSync('pnpm build', { stdio: 'pipe', timeout: 60_000 });
}
