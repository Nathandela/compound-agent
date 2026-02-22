/**
 * SQLite schema definition for knowledge database.
 *
 * The knowledge database stores documentation chunks with FTS5 search.
 * When KNOWLEDGE_SCHEMA_VERSION changes, the DB file is deleted and recreated.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Schema version for the knowledge SQLite cache.
 * Bump this when making incompatible schema changes.
 */
export const KNOWLEDGE_SCHEMA_VERSION = 1;

/** SQL schema for knowledge database with FTS5 full-text search */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB,
    model TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    id, text,
    content='chunks', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, id, text)
    VALUES (new.rowid, new.id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, id, text)
    VALUES ('delete', old.rowid, old.id, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, id, text)
    VALUES ('delete', old.rowid, old.id, old.text);
    INSERT INTO chunks_fts(rowid, id, text)
    VALUES (new.rowid, new.id, new.text);
  END;

  CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
  CREATE INDEX IF NOT EXISTS idx_chunks_updated_at ON chunks(updated_at);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Create the knowledge database schema and set the version pragma.
 * @param database - SQLite database instance
 */
export function createKnowledgeSchema(database: DatabaseType): void {
  database.exec(SCHEMA_SQL);
  database.pragma(`user_version = ${KNOWLEDGE_SCHEMA_VERSION}`);
}
