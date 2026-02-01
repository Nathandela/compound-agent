/**
 * SQLite storage layer with FTS5 for full-text search
 *
 * Rebuildable index - not the source of truth.
 * Stored in .claude/.cache (gitignored).
 */

import { createHash } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { Lesson } from '../types.js';

import { LESSONS_PATH, readLessons } from './jsonl.js';

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

/** Options for database initialization */
export interface DbOptions {
  /** Use in-memory database instead of file-based (useful for testing) */
  inMemory?: boolean;
}

/** SQL schema for lessons database */
const SCHEMA_SQL = `
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
    last_retrieved TEXT,
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

  -- Metadata table for sync tracking
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Create database schema for lessons storage.
 */
function createSchema(database: DatabaseType): void {
  database.exec(SCHEMA_SQL);
}

let db: DatabaseType | null = null;
let dbIsInMemory = false;

/**
 * Compute deterministic content hash for embedding cache validation.
 * Format: SHA-256 hex of "trigger insight"
 */
export function contentHash(trigger: string, insight: string): string {
  return createHash('sha256').update(`${trigger} ${insight}`).digest('hex');
}

/**
 * Open or create the SQLite database.
 *
 * Creates directory structure and schema if needed.
 * Returns a singleton instance - subsequent calls return the same connection.
 *
 * **Resource lifecycle:**
 * - First call creates the database file (if needed) and opens a connection
 * - Connection uses WAL mode for better concurrent access (file-based only)
 * - Connection remains open until `closeDb()` is called
 *
 * **Note:** Most code should not call this directly. Higher-level functions
 * like `searchKeyword` and `rebuildIndex` call it internally.
 *
 * @param repoRoot - Path to repository root (database stored at `.claude/.cache/lessons.sqlite`)
 * @param options - Optional settings for database initialization
 * @returns The singleton database connection
 *
 * @see {@link closeDb} for releasing resources
 */
export function openDb(repoRoot: string, options: DbOptions = {}): DatabaseType {
  const { inMemory = false } = options;

  // If we have an existing connection, check if it matches the requested mode
  if (db) {
    // If modes don't match, close the existing connection first
    if (inMemory !== dbIsInMemory) {
      closeDb();
    } else {
      return db;
    }
  }

  if (inMemory) {
    db = new Database(':memory:');
    dbIsInMemory = true;
  } else {
    const dbPath = join(repoRoot, DB_PATH);
    // Create directory synchronously (better-sqlite3 is sync)
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    dbIsInMemory = false;
    // Enable WAL mode for better concurrent access (file-based only)
    db.pragma('journal_mode = WAL');
  }

  createSchema(db);

  return db;
}

/**
 * Close the database connection and release resources.
 *
 * **Resource lifecycle:**
 * - The database is opened lazily on first call to `openDb()` or any function that uses it
 *   (e.g., `searchKeyword`, `rebuildIndex`, `syncIfNeeded`, `getCachedEmbedding`)
 * - Once opened, the connection remains active until `closeDb()` is called
 * - After closing, subsequent database operations will reopen the connection
 *
 * **When to call:**
 * - At the end of CLI commands to ensure clean process exit
 * - When transitioning between repositories in long-running processes
 * - Before process exit in graceful shutdown handlers
 *
 * **Best practices for long-running processes:**
 * - In single-operation scripts: call before exit
 * - In daemon/server processes: call in shutdown handler
 * - Not necessary to call between operations in the same repository
 *
 * @example
 * ```typescript
 * // CLI command pattern
 * try {
 *   await searchKeyword(repoRoot, 'typescript', 10);
 *   // ... process results
 * } finally {
 *   closeDb();
 * }
 *
 * // Graceful shutdown pattern
 * process.on('SIGTERM', () => {
 *   closeDb();
 *   process.exit(0);
 * });
 * ```
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    dbIsInMemory = false;
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
  last_retrieved: string | null;
  embedding: Buffer | null;
}

/**
 * Convert a database row to a typed Lesson object.
 * Maps NULL to undefined for optional fields (lossless roundtrip).
 */
function rowToLesson(row: LessonRow): Lesson {
  const lesson: Lesson = {
    id: row.id,
    type: row.type as 'quick' | 'full',
    trigger: row.trigger,
    insight: row.insight,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    source: row.source as Lesson['source'],
    context: JSON.parse(row.context) as Lesson['context'],
    supersedes: JSON.parse(row.supersedes) as string[],
    related: JSON.parse(row.related) as string[],
    created: row.created,
    confirmed: row.confirmed === 1,
  };

  // Optional fields: map NULL -> undefined (lossless roundtrip)
  if (row.evidence !== null) {
    lesson.evidence = row.evidence;
  }
  if (row.severity !== null) {
    lesson.severity = row.severity as 'high' | 'medium' | 'low';
  }
  if (row.deleted === 1) {
    lesson.deleted = true;
  }
  if (row.retrieval_count > 0) {
    lesson.retrievalCount = row.retrieval_count;
  }

  return lesson;
}

/** Cached embedding with its content hash */
interface CachedEmbeddingData {
  embedding: Buffer;
  contentHash: string;
}

/**
 * Collect cached embeddings from existing lessons for preservation.
 */
function collectCachedEmbeddings(database: DatabaseType): Map<string, CachedEmbeddingData> {
  const cache = new Map<string, CachedEmbeddingData>();
  const rows = database
    .prepare('SELECT id, embedding, content_hash FROM lessons WHERE embedding IS NOT NULL')
    .all() as Array<{ id: string; embedding: Buffer; content_hash: string | null }>;

  for (const row of rows) {
    if (row.embedding && row.content_hash) {
      cache.set(row.id, { embedding: row.embedding, contentHash: row.content_hash });
    }
  }
  return cache;
}

/** SQL for inserting a lesson row */
const INSERT_LESSON_SQL = `
  INSERT INTO lessons (id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count, last_retrieved, embedding, content_hash)
  VALUES (@id, @type, @trigger, @insight, @evidence, @severity, @tags, @source, @context, @supersedes, @related, @created, @confirmed, @deleted, @retrieval_count, @last_retrieved, @embedding, @content_hash)
`;

/**
 * Get the mtime of the JSONL file, or null if it doesn't exist.
 */
function getJsonlMtime(repoRoot: string): number | null {
  const jsonlPath = join(repoRoot, LESSONS_PATH);
  try {
    const stat = statSync(jsonlPath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Get the last synced mtime from metadata table.
 */
function getLastSyncMtime(database: DatabaseType): number | null {
  const row = database
    .prepare('SELECT value FROM metadata WHERE key = ?')
    .get('last_sync_mtime') as { value: string } | undefined;
  return row ? parseFloat(row.value) : null;
}

/**
 * Store the last synced mtime in metadata table.
 */
function setLastSyncMtime(database: DatabaseType, mtime: number): void {
  database
    .prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
    .run('last_sync_mtime', mtime.toString());
}

/**
 * Rebuild the SQLite index from the JSONL source of truth.
 * Preserves embeddings where content hash is unchanged.
 * Updates the last sync mtime after successful rebuild.
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);
  const { lessons } = await readLessons(repoRoot);

  const cachedEmbeddings = collectCachedEmbeddings(database);
  database.exec('DELETE FROM lessons');

  if (lessons.length === 0) {
    // Still update mtime even for empty file
    const mtime = getJsonlMtime(repoRoot);
    if (mtime !== null) {
      setLastSyncMtime(database, mtime);
    }
    return;
  }

  const insert = database.prepare(INSERT_LESSON_SQL);
  const insertMany = database.transaction((items: Lesson[]) => {
    for (const lesson of items) {
      const newHash = contentHash(lesson.trigger, lesson.insight);
      const cached = cachedEmbeddings.get(lesson.id);
      const hasValidCache = cached && cached.contentHash === newHash;

      insert.run({
        id: lesson.id,
        type: lesson.type,
        trigger: lesson.trigger,
        insight: lesson.insight,
        evidence: lesson.evidence ?? null,
        severity: lesson.severity ?? null,
        tags: lesson.tags.join(','),
        source: lesson.source,
        context: JSON.stringify(lesson.context),
        supersedes: JSON.stringify(lesson.supersedes),
        related: JSON.stringify(lesson.related),
        created: lesson.created,
        confirmed: lesson.confirmed ? 1 : 0,
        deleted: lesson.deleted ? 1 : 0,
        retrieval_count: lesson.retrievalCount ?? 0,
        last_retrieved: null, // Reset on rebuild since we're rebuilding from source
        embedding: hasValidCache ? cached.embedding : null,
        content_hash: hasValidCache ? cached.contentHash : null,
      });
    }
  });

  insertMany(lessons);

  // Update last sync mtime
  const mtime = getJsonlMtime(repoRoot);
  if (mtime !== null) {
    setLastSyncMtime(database, mtime);
  }
}

/** Options for syncIfNeeded */
export interface SyncOptions {
  /** Force rebuild even if JSONL unchanged */
  force?: boolean;
}

/**
 * Sync the index if JSONL has changed since last sync.
 * Returns true if a rebuild was performed, false if skipped.
 */
export async function syncIfNeeded(
  repoRoot: string,
  options: SyncOptions = {}
): Promise<boolean> {
  const { force = false } = options;

  // Check JSONL mtime
  const jsonlMtime = getJsonlMtime(repoRoot);
  if (jsonlMtime === null && !force) {
    // No JSONL file exists
    return false;
  }

  const database = openDb(repoRoot);
  const lastSyncMtime = getLastSyncMtime(database);

  // Rebuild if forced, no previous sync, or JSONL is newer
  const needsRebuild = force || lastSyncMtime === null || (jsonlMtime !== null && jsonlMtime > lastSyncMtime);

  if (needsRebuild) {
    await rebuildIndex(repoRoot);
    return true;
  }

  return false;
}

/**
 * Search lessons using FTS5 keyword search.
 * Returns matching lessons up to the specified limit.
 * Increments retrieval count for all returned lessons.
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

  // Increment retrieval count for matched lessons
  if (rows.length > 0) {
    incrementRetrievalCount(repoRoot, rows.map((r) => r.id));
  }

  return rows.map(rowToLesson);
}

/** Retrieval statistics for a lesson */
export interface RetrievalStat {
  id: string;
  count: number;
  lastRetrieved: string | null;
}

/**
 * Increment retrieval count for a list of lesson IDs.
 * Updates both count and last_retrieved timestamp.
 * Non-existent IDs are silently ignored.
 */
export function incrementRetrievalCount(repoRoot: string, lessonIds: string[]): void {
  if (lessonIds.length === 0) return;

  const database = openDb(repoRoot);
  const now = new Date().toISOString();

  const update = database.prepare(`
    UPDATE lessons
    SET retrieval_count = retrieval_count + 1,
        last_retrieved = ?
    WHERE id = ?
  `);

  const updateMany = database.transaction((ids: string[]) => {
    for (const id of ids) {
      update.run(now, id);
    }
  });

  updateMany(lessonIds);
}

/**
 * Get retrieval statistics for all lessons.
 * Returns id, retrieval count, and last retrieved timestamp for each lesson.
 */
export function getRetrievalStats(repoRoot: string): RetrievalStat[] {
  const database = openDb(repoRoot);

  const rows = database
    .prepare('SELECT id, retrieval_count, last_retrieved FROM lessons')
    .all() as Array<{ id: string; retrieval_count: number; last_retrieved: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    count: row.retrieval_count,
    lastRetrieved: row.last_retrieved,
  }));
}
