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

/** Database singleton */
let db: DatabaseType | null = null;
let dbIsInMemory = false;

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

  if (db) {
    if (inMemory !== dbIsInMemory) {
      closeDb();
    } else {
      return db;
    }
  }

  const Database = getDatabaseConstructor();

  if (inMemory) {
    db = new Database(':memory:');
    dbIsInMemory = true;
  } else {
    const dbPath = join(repoRoot, DB_PATH);
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    dbIsInMemory = false;

    if (!hasExpectedVersion(db)) {
      db.close();
      db = null;
      unlinkSync(dbPath);
      db = new Database(dbPath);
    }

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
