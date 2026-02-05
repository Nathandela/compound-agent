/**
 * SQLite availability check.
 *
 * Verifies that better-sqlite3 can be loaded. If it cannot, an error
 * is thrown -- there is no silent fallback to JSONL-only mode.
 */

import { createRequire } from 'node:module';
import type { Database as DatabaseType } from 'better-sqlite3';

// Create require function for ESM compatibility
const require = createRequire(import.meta.url);

/** Cached availability state */
let checked = false;
let DatabaseConstructor: (new (path: string) => DatabaseType) | null = null;

/**
 * Ensure SQLite (better-sqlite3) is loadable.
 * Throws a clear error if the native module cannot be loaded.
 */
export function ensureSqliteAvailable(): void {
  if (checked) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('better-sqlite3');
    const Constructor = module.default || module;
    const testDb = new Constructor(':memory:');
    testDb.close();
    DatabaseConstructor = Constructor;
    checked = true;
  } catch (cause) {
    throw new Error(
      'better-sqlite3 failed to load. Install native build tools ' +
        '(e.g. `npm install better-sqlite3`) or check your platform compatibility.',
      { cause }
    );
  }
}

/**
 * Get the SQLite Database constructor.
 * @returns Database constructor (never null -- throws if unavailable)
 */
export function getDatabaseConstructor(): new (path: string) => DatabaseType {
  ensureSqliteAvailable();
  return DatabaseConstructor!;
}
