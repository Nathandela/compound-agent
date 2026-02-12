/**
 * SQLite index synchronization with JSONL source of truth.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';

import type { MemoryItem } from '../../types.js';
import { LESSONS_PATH, readMemoryItems } from '../jsonl.js';

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
 * Preserves cached embeddings when item content hasn't changed.
 * @param repoRoot - Absolute path to repository root
 */
export async function rebuildIndex(repoRoot: string): Promise<void> {
  const database = openDb(repoRoot);

  const { items } = await readMemoryItems(repoRoot);
  const cachedEmbeddings = collectCachedEmbeddings(database);
  database.exec('DELETE FROM lessons');

  if (items.length === 0) {
    const mtime = getJsonlMtime(repoRoot);
    if (mtime !== null) {
      setLastSyncMtime(database, mtime);
    }
    return;
  }

  const insert = database.prepare(INSERT_LESSON_SQL);
  const insertMany = database.transaction((memoryItems: MemoryItem[]) => {
    for (const item of memoryItems) {
      const newHash = contentHash(item.trigger, item.insight);
      const cached = cachedEmbeddings.get(item.id);
      const hasValidCache = cached && cached.contentHash === newHash;

      insert.run({
        id: item.id,
        type: item.type,
        trigger: item.trigger,
        insight: item.insight,
        evidence: item.evidence ?? null,
        severity: item.severity ?? null,
        tags: item.tags.join(','),
        source: item.source,
        context: JSON.stringify(item.context),
        supersedes: JSON.stringify(item.supersedes),
        related: JSON.stringify(item.related),
        created: item.created,
        confirmed: item.confirmed ? 1 : 0,
        deleted: item.deleted ? 1 : 0,
        retrieval_count: item.retrievalCount ?? 0,
        last_retrieved: item.lastRetrieved ?? null,
        embedding: hasValidCache ? cached.embedding : null,
        content_hash: hasValidCache ? cached.contentHash : null,
        invalidated_at: item.invalidatedAt ?? null,
        invalidation_reason: item.invalidationReason ?? null,
        citation_file: item.citation?.file ?? null,
        citation_line: item.citation?.line ?? null,
        citation_commit: item.citation?.commit ?? null,
        compaction_level: item.compactionLevel ?? 0,
        compacted_at: item.compactedAt ?? null,
      });
    }
  });

  insertMany(items);

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
