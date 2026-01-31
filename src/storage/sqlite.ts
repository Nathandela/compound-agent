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
import { createHash } from 'crypto';

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

let db: DatabaseType | null = null;

/**
 * Compute deterministic content hash for embedding cache validation.
 * Format: SHA-256 hex of "trigger insight"
 */
export function contentHash(trigger: string, insight: string): string {
  return createHash('sha256').update(`${trigger} ${insight}`).digest('hex');
}

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
      embedding BLOB,
      content_hash TEXT
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

/**
 * Get cached embedding for a lesson if content hash matches.
 * Returns null if no cache exists or hash mismatches.
 */
export function getCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  expectedHash?: string
): number[] | null {
  const database = openDb(repoRoot);
  const row = database
    .prepare('SELECT embedding, content_hash FROM lessons WHERE id = ?')
    .get(lessonId) as { embedding: Buffer | null; content_hash: string | null } | undefined;

  if (!row || !row.embedding || !row.content_hash) {
    return null;
  }

  // If expected hash provided, validate it matches
  if (expectedHash && row.content_hash !== expectedHash) {
    return null;
  }

  // Convert Buffer to Float32Array then to number[]
  const float32 = new Float32Array(
    row.embedding.buffer,
    row.embedding.byteOffset,
    row.embedding.byteLength / 4
  );
  return Array.from(float32);
}

/**
 * Cache an embedding for a lesson with content hash.
 */
export function setCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  embedding: Float32Array | number[],
  hash: string
): void {
  const database = openDb(repoRoot);

  // Convert to Buffer for storage
  const float32 = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  database
    .prepare('UPDATE lessons SET embedding = ?, content_hash = ? WHERE id = ?')
    .run(buffer, hash, lessonId);
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

/** Cached embedding with its content hash */
interface CachedEmbeddingData {
  embedding: Buffer;
  contentHash: string;
}

/**
 * Rebuild the SQLite index from the JSONL source of truth.
 * Preserves embeddings where content hash is unchanged.
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);
  const { lessons } = await readLessons(repoRoot);

  // Save existing embeddings before clearing
  const cachedEmbeddings = new Map<string, CachedEmbeddingData>();
  const existingRows = database
    .prepare('SELECT id, embedding, content_hash FROM lessons WHERE embedding IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer; content_hash: string | null }>;

  for (const row of existingRows) {
    if (row.embedding && row.content_hash) {
      cachedEmbeddings.set(row.id, {
        embedding: row.embedding,
        contentHash: row.content_hash,
      });
    }
  }

  // Clear existing data (triggers will clear FTS)
  database.exec('DELETE FROM lessons');

  if (lessons.length === 0) return;

  // Prepare insert statement
  const insert = database.prepare(`
    INSERT INTO lessons (id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count, embedding, content_hash)
    VALUES (@id, @type, @trigger, @insight, @evidence, @severity, @tags, @source, @context, @supersedes, @related, @created, @confirmed, @deleted, @retrieval_count, @embedding, @content_hash)
  `);

  // Insert all lessons in a transaction
  const insertMany = database.transaction((items: Lesson[]) => {
    for (const lesson of items) {
      // Check if we have a valid cached embedding
      const newHash = contentHash(lesson.trigger, lesson.insight);
      const cached = cachedEmbeddings.get(lesson.id);
      const hasValidCache = cached && cached.contentHash === newHash;

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
        embedding: hasValidCache ? cached.embedding : null,
        content_hash: hasValidCache ? cached.contentHash : null,
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
