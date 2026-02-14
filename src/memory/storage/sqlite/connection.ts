/**
 * SQLite database connection management.
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { DbOptions } from './types.js';
import { getDatabaseConstructor } from './availability.js';
import { createSchema, SCHEMA_VERSION } from './schema.js';

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

/** Database connections keyed by resolved DB path */
const dbMap = new Map<string, DatabaseType>();
/** Last opened DB path for backward-compat getDb() */
let lastDbPath: string | null = null;

/**
 * Check if the database has the expected schema version.
 * @param database - SQLite database instance
 * @returns true if the version matches SCHEMA_VERSION
 */
function hasExpectedVersion(database: DatabaseType): boolean {
  const row = database.pragma('user_version', { simple: true }) as number;
  return row === SCHEMA_VERSION;
}

/**
 * Open the SQLite database connection.
 * If the database has an older schema version, it is deleted and recreated.
 * Throws if better-sqlite3 cannot be loaded.
 * @param repoRoot - Absolute path to repository root
 * @param options - Database options (e.g., inMemory for testing)
 * @returns Database instance
 */
export function openDb(repoRoot: string, options: DbOptions = {}): DatabaseType {
  const { inMemory = false } = options;

  const key = inMemory ? ':memory:' : join(repoRoot, DB_PATH);

  const cached = dbMap.get(key);
  if (cached) {
    lastDbPath = key;
    return cached;
  }

  const Database = getDatabaseConstructor();
  let database: DatabaseType;

  if (inMemory) {
    database = new Database(':memory:');
  } else {
    const dir = dirname(key);
    mkdirSync(dir, { recursive: true });
    database = new Database(key);

    if (!hasExpectedVersion(database)) {
      database.close();
      unlinkSync(key);
      database = new Database(key);
    }

    database.pragma('journal_mode = WAL');
  }

  createSchema(database);
  dbMap.set(key, database);
  lastDbPath = key;
  return database;
}

/**
 * Close the SQLite database connection.
 */
export function closeDb(): void {
  for (const database of dbMap.values()) {
    database.close();
  }
  dbMap.clear();
  lastDbPath = null;
}

/**
 * Get the current database instance (for internal use).
 * @returns Current database instance or null
 */
export function getDb(): DatabaseType | null {
  if (!lastDbPath) return null;
  return dbMap.get(lastDbPath) ?? null;
}
