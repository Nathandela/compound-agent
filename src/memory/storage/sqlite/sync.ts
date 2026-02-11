/**
 * SQLite index synchronization with JSONL source of truth.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { Lesson } from '../../types.js';
import { LESSONS_PATH, readLessons } from '../jsonl.js';

import type { SyncOptions } from './types.js';
import { openDb } from './connection.js';
import { collectCachedEmbeddings, contentHash } from './cache.js';

/** SQL for inserting a lesson record */
const INSERT_LESSON_SQL = `
  INSERT INTO lessons (id, type, trigger, insight, evidence, severity, tags, source, context, supersedes, related, created, confirmed, deleted, retrieval_count, last_retrieved, embedding, content_hash, invalidated_at, invalidation_reason, citation_file, citation_line, citation_commit, compaction_level, compacted_at)
  VALUES (@id, @type, @trigger, @insight, @evidence, @severity, @tags, @source, @context, @supersedes, @related, @created, @confirmed, @deleted, @retrieval_count, @last_retrieved, @embedding, @content_hash, @invalidated_at, @invalidation_reason, @citation_file, @citation_line, @citation_commit, @compaction_level, @compacted_at)
`;

/**
 * Get the modification time of the JSONL file.
 * @param repoRoot - Absolute path to repository root
 * @returns Modification time in milliseconds or null if file doesn't exist
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
 * Get the last sync modification time from metadata.
 * @param database - SQLite database instance
 * @returns Last sync mtime or null if not set
 */
function getLastSyncMtime(database: DatabaseType): number | null {
  const row = database
    .prepare('SELECT value FROM metadata WHERE key = ?')
    .get('last_sync_mtime') as { value: string } | undefined;
  return row ? parseFloat(row.value) : null;
}

/**
 * Set the last sync modification time in metadata.
 * @param database - SQLite database instance
 * @param mtime - Modification time to store
 */
function setLastSyncMtime(database: DatabaseType, mtime: number): void {
  database
    .prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
    .run('last_sync_mtime', mtime.toString());
}

/**
 * Rebuild the SQLite index from JSONL source of truth.
 * Preserves cached embeddings when lesson content hasn't changed.
 * @param repoRoot - Absolute path to repository root
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);

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

/**
 * Sync SQLite index if JSONL has changed.
 * @param repoRoot - Absolute path to repository root
 * @param options - Sync options
 * @returns true if sync was performed, false otherwise
 */
export async function syncIfNeeded(
  repoRoot: string,
  options: SyncOptions = {}
): Promise<boolean> {
  const { force = false } = options;
  const jsonlMtime = getJsonlMtime(repoRoot);
  if (jsonlMtime === null && !force) {
    return false;
  }

  const database = openDb(repoRoot);

  const lastSyncMtime = getLastSyncMtime(database);
  const needsRebuild = force || lastSyncMtime === null || (jsonlMtime !== null && jsonlMtime > lastSyncMtime);

  if (needsRebuild) {
    await rebuildIndex(repoRoot);
    return true;
  }

  return false;
}
