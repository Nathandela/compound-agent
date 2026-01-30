/**
 * SQLite storage layer with FTS5 for full-text search
 *
 * Rebuildable index - not the source of truth.
 * Stored in .claude/.cache (gitignored).
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

let db: DatabaseType | null = null;

/**
 * Open or create the SQLite database.
 * Creates directory structure and schema if needed.
 * Returns singleton instance.
 */
export function openDb(repoRoot: string): DatabaseType {
  if (db) return db;

  const dbPath = join(repoRoot, DB_PATH);

  // Create directory synchronously (better-sqlite3 is sync)
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create schema
  db.exec(`
    -- Main lessons table
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
      embedding BLOB
    );

    -- FTS5 virtual table for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
      id,
      trigger,
      insight,
      tags,
      content='lessons',
      content_rowid='rowid'
    );

    -- Trigger to sync FTS on INSERT
    CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
      INSERT INTO lessons_fts(rowid, id, trigger, insight, tags)
      VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags);
    END;

    -- Trigger to sync FTS on DELETE
    CREATE TRIGGER IF NOT EXISTS lessons_ad AFTER DELETE ON lessons BEGIN
      INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags)
      VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags);
    END;

    -- Trigger to sync FTS on UPDATE
    CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE ON lessons BEGIN
      INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags)
      VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags);
      INSERT INTO lessons_fts(rowid, id, trigger, insight, tags)
      VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags);
    END;

    -- Index for common queries
    CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created);
    CREATE INDEX IF NOT EXISTS idx_lessons_confirmed ON lessons(confirmed);
    CREATE INDEX IF NOT EXISTS idx_lessons_severity ON lessons(severity);
  `);

  return db;
}

/**
 * Close the database connection.
 * Resets singleton for reopening.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Import for rebuildIndex
import { readLessons } from './jsonl.js';
import type { Lesson } from '../types.js';

/** DB row type for lessons table */
interface LessonRow {
  id: string;
  type: string;
  trigger: string;
  insight: string;
  evidence: string | null;
  severity: string | null;
  tags: string;
  source: string;
  context: string;
  supersedes: string;
  related: string;
  created: string;
  confirmed: number;
  deleted: number;
  retrieval_count: number;
  embedding: Buffer | null;
}

/**
 * Convert a database row to a typed Lesson object.
 */
function rowToLesson(row: LessonRow): Lesson {
  const base = {
    id: row.id,
    trigger: row.trigger,
    insight: row.insight,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    source: row.source as Lesson['source'],
    context: JSON.parse(row.context) as Lesson['context'],
    supersedes: JSON.parse(row.supersedes) as string[],
    related: JSON.parse(row.related) as string[],
    created: row.created,
    confirmed: row.confirmed === 1,
    deleted: row.deleted === 1 ? true : undefined,
    retrievalCount: row.retrieval_count > 0 ? row.retrieval_count : undefined,
  };

  if (row.type === 'full') {
    return {
      ...base,
      type: 'full',
      evidence: row.evidence ?? '',
      severity: (row.severity ?? 'medium') as 'high' | 'medium' | 'low',
    };
  }

  return {
    ...base,
    type: 'quick',
  };
}

/**
 * Rebuild the SQLite index from the JSONL source of truth.
 * Clears existing data and repopulates.
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);
  const lessons = await readLessons(repoRoot);

  // Clear existing data (triggers will clear FTS)
  database.exec('DELETE FROM lessons');

  if (lessons.length === 0) return;

  // Prepare insert statement
  const insert = database.prepare(`
    INSERT INTO lessons (id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count)
    VALUES (@id, @type, @trigger, @insight, @evidence, @severity, @tags, @source, @context, @supersedes, @related, @created, @confirmed, @deleted, @retrieval_count)
  `);

  // Insert all lessons in a transaction
  const insertMany = database.transaction((items: Lesson[]) => {
    for (const lesson of items) {
      insert.run({
        id: lesson.id,
        type: lesson.type,
        trigger: lesson.trigger,
        insight: lesson.insight,
        evidence: lesson.type === 'full' ? lesson.evidence : null,
        severity: lesson.type === 'full' ? lesson.severity : null,
        tags: lesson.tags.join(','),
        source: lesson.source,
        context: JSON.stringify(lesson.context),
        supersedes: JSON.stringify(lesson.supersedes),
        related: JSON.stringify(lesson.related),
        created: lesson.created,
        confirmed: lesson.confirmed ? 1 : 0,
        deleted: lesson.deleted ? 1 : 0,
        retrieval_count: lesson.retrievalCount ?? 0,
      });
    }
  });

  insertMany(lessons);
}

/**
 * Search lessons using FTS5 keyword search.
 * Returns matching lessons up to the specified limit.
 */
export async function searchKeyword(
  repoRoot: string,
  query: string,
  limit: number
): Promise<Lesson[]> {
  const database = openDb(repoRoot);

  // Check if there are any lessons
  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  // Use FTS5 MATCH for search
  const rows = database
    .prepare(
      `
      SELECT l.*
      FROM lessons l
      JOIN lessons_fts fts ON l.rowid = fts.rowid
      WHERE lessons_fts MATCH ?
      LIMIT ?
    `
    )
    .all(query, limit) as LessonRow[];

  return rows.map(rowToLesson);
}
