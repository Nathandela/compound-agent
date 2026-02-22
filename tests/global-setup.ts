import { existsSync } from 'node:fs';

/**
 * Validates `dist/cli.js` exists before CLI integration tests run.
 *
 * Build must happen BEFORE vitest starts — the `pnpm test` and
 * `pnpm test:integration` scripts handle this automatically.
 * Running `pnpm build` inside vitest's globalSetup caused EPERM
 * errors from tsx/IPC conflicts.
 */
export function setup(): void {
  if (!existsSync('dist/cli.js')) {
    throw new Error(
      'dist/cli.js not found. Run `pnpm build` before running integration tests.\n' +
        'Tip: `pnpm test` and `pnpm test:integration` build automatically.'
    );
  }
}
