/**
 * Knowledge SQLite database connection management.
 *
 * Separate singleton map from the lessons DB -- completely independent.
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { KnowledgeDbOptions } from './types.js';
import { getDatabaseConstructor } from '../sqlite/availability.js';
import { createKnowledgeSchema, KNOWLEDGE_SCHEMA_VERSION } from './schema.js';

/** Relative path to knowledge database file from repo root */
export const KNOWLEDGE_DB_PATH = '.claude/.cache/knowledge.sqlite';

/** Knowledge database connections keyed by resolved DB path */
const knowledgeDbMap = new Map<string, DatabaseType>();

/**
 * Open the knowledge SQLite database connection.
 * If the database has an older schema version, it is deleted and recreated.
 * @param repoRoot - Absolute path to repository root
 * @param options - Database options (e.g., inMemory for testing)
 * @returns Database instance
 */
export function openKnowledgeDb(
  repoRoot: string,
  options: KnowledgeDbOptions = {}
): DatabaseType {
  const { inMemory = false } = options;

  const key = inMemory ? `:memory:${repoRoot}` : join(repoRoot, KNOWLEDGE_DB_PATH);

  const cached = knowledgeDbMap.get(key);
  if (cached) {
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

    const version = database.pragma('user_version', { simple: true }) as number;
    if (version !== 0 && version !== KNOWLEDGE_SCHEMA_VERSION) {
      database.close();
      try { unlinkSync(key); } catch { /* ENOENT is fine */ }
      database = new Database(key);
    }

    database.pragma('journal_mode = WAL');
  }

  createKnowledgeSchema(database);
  knowledgeDbMap.set(key, database);
  return database;
}

/**
 * Close all knowledge SQLite database connections.
 */
export function closeKnowledgeDb(): void {
  for (const database of knowledgeDbMap.values()) {
    database.close();
  }
  knowledgeDbMap.clear();
}
