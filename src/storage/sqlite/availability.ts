/**
 * SQLite availability detection and graceful degradation.
 *
 * If better-sqlite3 fails to load (e.g., native binding compilation issues),
 * the module operates in JSONL-only mode. JSONL remains the source of truth;
 * SQLite is just a cache/index.
 */

import { createRequire } from 'node:module';
import type { Database as DatabaseType } from 'better-sqlite3';

// Create require function for ESM compatibility
const require = createRequire(import.meta.url);

/** SQLite availability state */
let sqliteAvailable: boolean | null = null;
let sqliteWarningLogged = false;
let DatabaseConstructor: (new (path: string) => DatabaseType) | null = null;

/** Test-only flag to simulate SQLite unavailability */
let _forceUnavailable = false;

/**
 * Check if SQLite is available and can be loaded.
 * @returns true if SQLite is available, false otherwise
 */
export function isSqliteAvailable(): boolean {
  // Test hook: force unavailability for degradation tests
  if (_forceUnavailable) {
    if (!sqliteWarningLogged) {
      console.warn('SQLite unavailable, running in JSONL-only mode');
      sqliteWarningLogged = true;
    }
    return false;
  }

  if (sqliteAvailable !== null) {
    return sqliteAvailable;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('better-sqlite3');
    const Constructor = module.default || module;
    const testDb = new Constructor(':memory:');
    testDb.close();
    DatabaseConstructor = Constructor;
    sqliteAvailable = true;
  } catch {
    sqliteAvailable = false;
    if (!sqliteWarningLogged) {
      console.warn('SQLite unavailable, running in JSONL-only mode');
      sqliteWarningLogged = true;
    }
  }

  return sqliteAvailable;
}

/**
 * Log degradation warning if not already logged.
 */
export function logDegradationWarning(): void {
  if (!sqliteAvailable && !sqliteWarningLogged) {
    console.warn('SQLite unavailable, running in JSONL-only mode');
    sqliteWarningLogged = true;
  }
}

/**
 * Check if SQLite is available and the module is operating in SQLite mode.
 * @returns true if SQLite loaded successfully, false if degraded to JSONL-only mode
 */
export function isSqliteMode(): boolean {
  return isSqliteAvailable();
}

/**
 * Get the SQLite Database constructor.
 * @returns Database constructor or null if unavailable
 */
export function getDatabaseConstructor(): (new (path: string) => DatabaseType) | null {
  if (!isSqliteAvailable()) {
    return null;
  }
  return DatabaseConstructor;
}

/**
 * Reset SQLite state. Used in tests to reset detection state.
 */
export function _resetSqliteState(): void {
  sqliteAvailable = null;
  sqliteWarningLogged = false;
  DatabaseConstructor = null;
  _forceUnavailable = false;
}

/**
 * Force SQLite to be unavailable. Used in tests to simulate degradation.
 * @internal Test-only API
 */
export function _setForceUnavailable(value: boolean): void {
  _forceUnavailable = value;
  if (value) {
    sqliteAvailable = null;
    DatabaseConstructor = null;
  }
}
