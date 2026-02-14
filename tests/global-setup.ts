import { execSync } from 'node:child_process';

/**
 * Ensures `dist/cli.js` exists before CLI integration tests run.
 * This runs once before the entire test suite starts.
 */
export function setup(): void {
  execSync('pnpm build', { stdio: 'pipe' });
}
