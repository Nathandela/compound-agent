/**
 * SQLite database connection management.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { DbOptions } from './types.js';
import { getDatabaseConstructor, isSqliteAvailable } from './availability.js';
import { createSchema } from './schema.js';

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

/** Database singleton */
let db: DatabaseType | null = null;
let dbIsInMemory = false;

/**
 * Open the SQLite database connection.
 * Gracefully degrades: returns null if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param options - Database options (e.g., inMemory for testing)
 * @returns Database instance or null if SQLite unavailable
 */
export function openDb(repoRoot: string, options: DbOptions = {}): DatabaseType | null {
  if (!isSqliteAvailable()) {
    return null;
  }

  const { inMemory = false } = options;

  if (db) {
    if (inMemory !== dbIsInMemory) {
      closeDb();
    } else {
      return db;
    }
  }

  const Database = getDatabaseConstructor()!;

  if (inMemory) {
    db = new Database(':memory:');
    dbIsInMemory = true;
  } else {
    const dbPath = join(repoRoot, DB_PATH);
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    dbIsInMemory = false;
    db.pragma('journal_mode = WAL');
  }

  createSchema(db);
  return db;
}

/**
 * Close the SQLite database connection.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    dbIsInMemory = false;
  }
}

/**
 * Get the current database instance (for internal use).
 * @returns Current database instance or null
 */
export function getDb(): DatabaseType | null {
  return db;
}
