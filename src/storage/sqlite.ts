/**
 * SQLite storage layer with FTS5 for full-text search
 *
 * Rebuildable index - not the source of truth.
 * Stored in .claude/.cache (gitignored).
 *
 * **Graceful degradation**: If better-sqlite3 fails to load (e.g., native
 * binding compilation issues), the module operates in JSONL-only mode.
 * JSONL remains the source of truth; SQLite is just a cache/index.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { Lesson } from '../types.js';

import { LESSONS_PATH, readLessons } from './jsonl.js';

// Create require function for ESM compatibility
const require = createRequire(import.meta.url);

/** Relative path to database file from repo root */
export const DB_PATH = '.claude/.cache/lessons.sqlite';

/**
 * SQLite availability state.
 */
let sqliteAvailable: boolean | null = null;
let sqliteWarningLogged = false;
let DatabaseConstructor: (new (path: string) => DatabaseType) | null = null;

/** Test-only flag to simulate SQLite unavailability */
let _forceUnavailable = false;

function isSqliteAvailable(): boolean {
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

function logDegradationWarning(): void {
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

export interface DbOptions {
  inMemory?: boolean;
}

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
    invalidated_at TEXT,
    invalidation_reason TEXT,
    citation_file TEXT,
    citation_line INTEGER,
    citation_commit TEXT,
    compaction_level INTEGER DEFAULT 0,
    compacted_at TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
    id, trigger, insight, tags,
    content='lessons', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS lessons_ai AFTER INSERT ON lessons BEGIN
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_ad AFTER DELETE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS lessons_au AFTER UPDATE ON lessons BEGIN
    INSERT INTO lessons_fts(lessons_fts, rowid, id, trigger, insight, tags)
    VALUES ('delete', old.rowid, old.id, old.trigger, old.insight, old.tags);
    INSERT INTO lessons_fts(rowid, id, trigger, insight, tags)
    VALUES (new.rowid, new.id, new.trigger, new.insight, new.tags);
  END;

  CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created);
  CREATE INDEX IF NOT EXISTS idx_lessons_confirmed ON lessons(confirmed);
  CREATE INDEX IF NOT EXISTS idx_lessons_severity ON lessons(severity);

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function createSchema(database: DatabaseType): void {
  database.exec(SCHEMA_SQL);
}

let db: DatabaseType | null = null;
let dbIsInMemory = false;

/**
 * Compute content hash for a lesson's trigger and insight.
 * Used to detect content changes for embedding cache invalidation.
 * @param trigger - The lesson trigger text
 * @param insight - The lesson insight text
 * @returns SHA-256 hash of the combined content
 */
export function contentHash(trigger: string, insight: string): string {
  return createHash('sha256').update(`${trigger} ${insight}`).digest('hex');
}

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

  const Database = DatabaseConstructor!;

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
 * Get cached embedding for a lesson.
 * Gracefully degrades: returns null if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param lessonId - ID of the lesson
 * @param expectedHash - Optional content hash to validate cache freshness
 * @returns Embedding array or null if not cached/unavailable
 */
export function getCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  expectedHash?: string
): number[] | null {
  const database = openDb(repoRoot);
  if (!database) {
    logDegradationWarning();
    return null;
  }

  const row = database
    .prepare('SELECT embedding, content_hash FROM lessons WHERE id = ?')
    .get(lessonId) as { embedding: Buffer | null; content_hash: string | null } | undefined;

  if (!row || !row.embedding || !row.content_hash) {
    return null;
  }

  if (expectedHash && row.content_hash !== expectedHash) {
    return null;
  }

  const float32 = new Float32Array(
    row.embedding.buffer,
    row.embedding.byteOffset,
    row.embedding.byteLength / 4
  );
  return Array.from(float32);
}

/**
 * Cache embedding for a lesson in SQLite.
 * Gracefully degrades: no-op if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param lessonId - ID of the lesson
 * @param embedding - Embedding vector (Float32Array or number array)
 * @param hash - Content hash for cache validation
 */
export function setCachedEmbedding(
  repoRoot: string,
  lessonId: string,
  embedding: Float32Array | number[],
  hash: string
): void {
  const database = openDb(repoRoot);
  if (!database) {
    logDegradationWarning();
    return;
  }

  const float32 = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

  database
    .prepare('UPDATE lessons SET embedding = ?, content_hash = ? WHERE id = ?')
    .run(buffer, hash, lessonId);
}

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
  invalidated_at: string | null;
  invalidation_reason: string | null;
  citation_file: string | null;
  citation_line: number | null;
  citation_commit: string | null;
  compaction_level: number | null;
  compacted_at: string | null;
}

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

  if (row.evidence !== null) lesson.evidence = row.evidence;
  if (row.severity !== null) lesson.severity = row.severity as 'high' | 'medium' | 'low';
  if (row.deleted === 1) lesson.deleted = true;
  if (row.retrieval_count > 0) lesson.retrievalCount = row.retrieval_count;
  if (row.invalidated_at !== null) lesson.invalidatedAt = row.invalidated_at;
  if (row.invalidation_reason !== null) lesson.invalidationReason = row.invalidation_reason;
  if (row.citation_file !== null) {
    lesson.citation = {
      file: row.citation_file,
      ...(row.citation_line !== null && { line: row.citation_line }),
      ...(row.citation_commit !== null && { commit: row.citation_commit }),
    };
  }
  if (row.compaction_level !== null && row.compaction_level !== 0) {
    lesson.compactionLevel = row.compaction_level as 0 | 1 | 2;
  }
  if (row.compacted_at !== null) lesson.compactedAt = row.compacted_at;
  if (row.last_retrieved !== null) lesson.lastRetrieved = row.last_retrieved;

  return lesson;
}

interface CachedEmbeddingData {
  embedding: Buffer;
  contentHash: string;
}

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

const INSERT_LESSON_SQL = `
  INSERT INTO lessons (id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count, last_retrieved, embedding, content_hash, invalidated_at, invalidation_reason, citation_file, citation_line, citation_commit, compaction_level, compacted_at)
  VALUES (@id, @type, @trigger, @insight, @evidence, @severity, @tags, @source, @context, @supersedes, @related, @created, @confirmed, @deleted, @retrieval_count, @last_retrieved, @embedding, @content_hash, @invalidated_at, @invalidation_reason, @citation_file, @citation_line, @citation_commit, @compaction_level, @compacted_at)
`;

function getJsonlMtime(repoRoot: string): number | null {
  const jsonlPath = join(repoRoot, LESSONS_PATH);
  try {
    const stat = statSync(jsonlPath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function getLastSyncMtime(database: DatabaseType): number | null {
  const row = database
    .prepare('SELECT value FROM metadata WHERE key = ?')
    .get('last_sync_mtime') as { value: string } | undefined;
  return row ? parseFloat(row.value) : null;
}

function setLastSyncMtime(database: DatabaseType, mtime: number): void {
  database
    .prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
    .run('last_sync_mtime', mtime.toString());
}

/**
 * Rebuild the SQLite index from JSONL source of truth.
 * Gracefully degrades: no-op with warning if SQLite unavailable.
 * Preserves cached embeddings when lesson content hasn't changed.
 * @param repoRoot - Absolute path to repository root
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);
  if (!database) {
    logDegradationWarning();
    return;
  }

  const { lessons } = await readLessons(repoRoot);
  const cachedEmbeddings = collectCachedEmbeddings(database);
  database.exec('DELETE FROM lessons');

  if (lessons.length === 0) {
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
        last_retrieved: lesson.lastRetrieved ?? null,
        embedding: hasValidCache ? cached.embedding : null,
        content_hash: hasValidCache ? cached.contentHash : null,
        invalidated_at: lesson.invalidatedAt ?? null,
        invalidation_reason: lesson.invalidationReason ?? null,
        citation_file: lesson.citation?.file ?? null,
        citation_line: lesson.citation?.line ?? null,
        citation_commit: lesson.citation?.commit ?? null,
        compaction_level: lesson.compactionLevel ?? 0,
        compacted_at: lesson.compactedAt ?? null,
      });
    }
  });

  insertMany(lessons);

  const mtime = getJsonlMtime(repoRoot);
  if (mtime !== null) {
    setLastSyncMtime(database, mtime);
  }
}

/** Options for sync operation */
export interface SyncOptions {
  /** Force rebuild even if mtimes match */
  force?: boolean;
}

/**
 * Sync SQLite index if JSONL has changed.
 * Gracefully degrades: returns false immediately if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param options - Sync options
 * @returns true if sync was performed, false otherwise
 */
export async function syncIfNeeded(
  repoRoot: string,
  options: SyncOptions = {}
): Promise<boolean> {
  if (!isSqliteAvailable()) {
    logDegradationWarning();
    return false;
  }

  const { force = false } = options;
  const jsonlMtime = getJsonlMtime(repoRoot);
  if (jsonlMtime === null && !force) {
    return false;
  }

  const database = openDb(repoRoot);
  if (!database) return false;

  const lastSyncMtime = getLastSyncMtime(database);
  const needsRebuild = force || lastSyncMtime === null || (jsonlMtime !== null && jsonlMtime > lastSyncMtime);

  if (needsRebuild) {
    await rebuildIndex(repoRoot);
    return true;
  }

  return false;
}

/**
 * Search lessons using FTS5 full-text search.
 * Does NOT degrade gracefully: throws error if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param query - FTS5 query string
 * @param limit - Maximum number of results
 * @returns Matching lessons
 * @throws Error if SQLite unavailable (FTS5 required)
 */
export async function searchKeyword(
  repoRoot: string,
  query: string,
  limit: number
): Promise<Lesson[]> {
  const database = openDb(repoRoot);
  if (!database) {
    throw new Error(
      'Keyword search requires SQLite (FTS5 required). ' +
        'Install native build tools or use vector search instead.'
    );
  }

  const countResult = database.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as {
    cnt: number;
  };
  if (countResult.cnt === 0) return [];

  const rows = database
    .prepare(
      `
      SELECT l.*
      FROM lessons l
      JOIN lessons_fts fts ON l.rowid = fts.rowid
      WHERE lessons_fts MATCH ?
        AND l.invalidated_at IS NULL
      LIMIT ?
    `
    )
    .all(query, limit) as LessonRow[];

  if (rows.length > 0) {
    incrementRetrievalCount(repoRoot, rows.map((r) => r.id));
  }

  return rows.map(rowToLesson);
}

/** Retrieval statistics for a lesson */
export interface RetrievalStat {
  /** Lesson ID */
  id: string;
  /** Number of times retrieved */
  count: number;
  /** ISO timestamp of last retrieval */
  lastRetrieved: string | null;
}

/**
 * Increment retrieval count for lessons.
 * Gracefully degrades: no-op if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @param lessonIds - IDs of retrieved lessons
 */
export function incrementRetrievalCount(repoRoot: string, lessonIds: string[]): void {
  if (lessonIds.length === 0) return;

  const database = openDb(repoRoot);
  if (!database) {
    logDegradationWarning();
    return;
  }

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
 * Gracefully degrades: returns empty array if SQLite unavailable.
 * @param repoRoot - Absolute path to repository root
 * @returns Array of retrieval statistics
 */
export function getRetrievalStats(repoRoot: string): RetrievalStat[] {
  const database = openDb(repoRoot);
  if (!database) {
    logDegradationWarning();
    return [];
  }

  const rows = database
    .prepare('SELECT id, retrieval_count, last_retrieved FROM lessons')
    .all() as Array<{ id: string; retrieval_count: number; last_retrieved: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    count: row.retrieval_count,
    lastRetrieved: row.last_retrieved,
  }));
}
