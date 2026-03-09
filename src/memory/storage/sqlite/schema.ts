/**
 * SQLite schema definition for lessons database.
 *
 * The SQLite database is a rebuildable cache (JSONL is source of truth).
 * When SCHEMA_VERSION changes, the DB file is deleted and recreated.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Schema version for the SQLite cache.
 * Bump this when making incompatible schema changes.
 * The connection module auto-rebuilds when the DB version is older.
 */
export const SCHEMA_VERSION = 5;

/** SQL schema for lessons database with FTS5 full-text search */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    trigger TEXT NOT NULL,
    insight TEXT NOT NULL,
    evidence TEXT,
    severity TEXT,
    tags TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    supersedes TEXT NOT NULL DEFAULT '[]',
    related TEXT NOT NULL DEFAULT '[]',
    created TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    retrieval_count INTEGER NOT NULL DEFAULT 0,
    last_retrieved TEXT,
    embedding BLOB,
    content_hash TEXT,
    embedding_insight BLOB,
    content_hash_insight TEXT,
    invalidated_at TEXT,
    invalidation_reason TEXT,
    citation_file TEXT,
    citation_line INTEGER,
    citation_commit TEXT,
    compaction_level INTEGER DEFAULT 0,
    compacted_at TEXT,
    pattern_bad TEXT,
    pattern_good TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    id, trigger, insight, tags, pattern_bad, pattern_good,
    content='lessons', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags, new.pattern_bad, new.pattern_good);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_ad AFTER DELETE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags, old.pattern_bad, old.pattern_good);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE OF id, trigger, insight, tags, pattern_bad, pattern_good ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags, old.pattern_bad, old.pattern_good);
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags, pattern_bad, pattern_good)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags, new.pattern_bad, new.pattern_good);
  END;

  CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created);
  CREATE INDEX IF NOT EXISTS idx_lessons_confirmed ON lessons(confirmed);
  CREATE INDEX IF NOT EXISTS idx_lessons_severity ON lessons(severity);
  CREATE INDEX IF NOT EXISTS idx_lessons_type ON lessons(type);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Create the database schema and set the version pragma.
 * @param database - SQLite database instance
 */
export function createSchema(database: DatabaseType): void {
  database.exec(SCHEMA_SQL);
  const current = database.pragma('user_version', { simple: true }) as number;
  if (current !== SCHEMA_VERSION) {
    database.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}
