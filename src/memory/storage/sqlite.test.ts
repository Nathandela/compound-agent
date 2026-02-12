import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createFullLesson, createQuickLesson } from '../../test-utils.js';

import { appendLesson, LESSONS_PATH } from './jsonl.js';
import {
  closeDb,
  contentHash,
  DB_PATH,
  getCachedEmbedding,
  getRetrievalStats,
  incrementRetrievalCount,
  openDb,
  rebuildIndex,
  searchKeyword,
  setCachedEmbedding,
  syncIfNeeded,
} from './sqlite/index.js';

/** Helper to open in-memory database for fast tests */
function openInMemoryDb() {
  return openDb('', { inMemory: true });
}

describe('SQLite in-memory mode', () => {
  afterEach(() => {
    closeDb();
  });

  it('creates schema in memory without file I/O', () => {
    const db = openInMemoryDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons'")
      .get() as { name: string } | undefined;
    expect(tables?.name).toBe('lessons');
  });

  it('creates FTS5 in memory', () => {
    const db = openInMemoryDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons_fts'")
      .get() as { name: string } | undefined;
    expect(tables?.name).toBe('lessons_fts');
  });

  it('returns singleton for same mode', () => {
    const db1 = openInMemoryDb();
    const db2 = openInMemoryDb();
    expect(db1).toBe(db2);
  });

  it('switches between in-memory and file-based modes', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-mode-switch-'));
    try {
      // Start with in-memory
      const memDb = openInMemoryDb();
      memDb.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, created, confirmed)
        VALUES ('MEM001', 'quick', 'memory test', 'memory insight', '', 'manual', '{}', '2026-01-30', 1)
      `).run();

      // Switch to file-based (should close in-memory and open file)
      const fileDb = openDb(tempDir);
      // The in-memory data should be gone
      const row = fileDb.prepare('SELECT id FROM lessons WHERE id = ?').get('MEM001');
      expect(row).toBeUndefined();
    } finally {
      closeDb();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('FTS triggers work in memory', () => {
    const db = openInMemoryDb();

    db.prepare(`
      INSERT INTO lessons (id, type, trigger, insight, tags, source, context, created, confirmed)
      VALUES ('L001', 'quick', 'test trigger', 'test insight', 'tag1', 'manual', '{}', '2026-01-30', 1)
    `).run();

    const results = db
      .prepare("SELECT id FROM lessons_fts WHERE lessons_fts MATCH 'test'")
      .all() as Array<{ id: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('L001');
  });
});

describe('SQLite schema', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-sqlite-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('openDb', () => {
    it('creates database file in .claude/.cache', async () => {
      openDb(tempDir);
      const dbPath = join(tempDir, DB_PATH);
      await access(dbPath); // throws if not exists
    });

    it('creates lessons table', () => {
      const db = openDb(tempDir);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons'")
        .get() as { name: string } | undefined;
      expect(tables?.name).toBe('lessons');
    });

    it('creates FTS5 virtual table', () => {
      const db = openDb(tempDir);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lessons_fts'")
        .get() as { name: string } | undefined;
      expect(tables?.name).toBe('lessons_fts');
    });

    it('lessons table has required columns', () => {
      const db = openDb(tempDir);
      const columns = db
        .prepare("PRAGMA table_info('lessons')")
        .all() as Array<{ name: string; type: string }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('trigger');
      expect(columnNames).toContain('insight');
      expect(columnNames).toContain('tags');
      expect(columnNames).toContain('severity');
      expect(columnNames).toContain('source');
      expect(columnNames).toContain('context');
      expect(columnNames).toContain('created');
      expect(columnNames).toContain('confirmed');
      expect(columnNames).toContain('deleted');
      expect(columnNames).toContain('embedding');
    });

    it('FTS5 indexes trigger, insight, and tags', () => {
      const db = openDb(tempDir);

      // Insert a test row
      db.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, created, confirmed)
        VALUES ('L001', 'quick', 'test trigger', 'test insight', 'tag1,tag2', 'manual', '{}', '2026-01-30', 1)
      `).run();

      // Search FTS should find it
      const results = db
        .prepare("SELECT * FROM lessons_fts WHERE lessons_fts MATCH 'test'")
        .all() as Array<{ trigger: string }>;
      expect(results).toHaveLength(1);
      expect(results[0]!.trigger).toBe('test trigger');
    });

    it('trigger auto-populates FTS on INSERT', () => {
      const db = openDb(tempDir);

      // Insert via lessons table
      db.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, created, confirmed)
        VALUES ('L002', 'quick', 'auto trigger', 'auto insight', 'auto,test', 'manual', '{}', '2026-01-30', 1)
      `).run();

      // FTS should have the row
      const results = db
        .prepare("SELECT id FROM lessons_fts WHERE lessons_fts MATCH 'auto'")
        .all() as Array<{ id: string }>;
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('L002');
    });

    it('returns same db instance on multiple calls', () => {
      const db1 = openDb(tempDir);
      const db2 = openDb(tempDir);
      expect(db1).toBe(db2);
    });
  });

  describe('closeDb', () => {
    it('allows reopening after close', () => {
      const db1 = openDb(tempDir);
      db1.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, created, confirmed)
        VALUES ('L003', 'quick', 'test', 'test', '', 'manual', '{}', '2026-01-30', 1)
      `).run();
      closeDb();

      const db2 = openDb(tempDir);
      const row = db2.prepare('SELECT id FROM lessons WHERE id = ?').get('L003') as
        | { id: string }
        | undefined;
      expect(row?.id).toBe('L003');
    });
  });

  describe('rebuildIndex', () => {
    it('populates index from JSONL', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars'));
      await appendLesson(tempDir, createQuickLesson('L002', 'prefer uv'));

      await rebuildIndex(tempDir);

      const db = openDb(tempDir);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
      expect(count.cnt).toBe(2);
    });

    it('clears existing data before rebuilding', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first'));
      await rebuildIndex(tempDir);

      // Add more to JSONL but not index
      await appendLesson(tempDir, createQuickLesson('L002', 'second'));

      // Rebuild should have both
      await rebuildIndex(tempDir);
      const db = openDb(tempDir);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
      expect(count.cnt).toBe(2);
    });

    it('handles empty JSONL file', async () => {
      await rebuildIndex(tempDir);
      const db = openDb(tempDir);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
      expect(count.cnt).toBe(0);
    });

    it('updates sync mtime even when JSONL is empty but file exists', async () => {
      // Create empty JSONL file (exists but has no lessons)
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      await rebuildIndex(tempDir);

      // Should have stored mtime in metadata
      const db = openDb(tempDir);
      const row = db.prepare("SELECT value FROM metadata WHERE key = 'last_sync_mtime'").get() as
        | { value: string }
        | undefined;
      expect(row).toBeDefined();
      expect(parseFloat(row!.value)).toBeGreaterThan(0);
    });

    it('preserves lesson types', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'quick'));
      await appendLesson(tempDir, createFullLesson('L002', 'full', 'high'));
      await rebuildIndex(tempDir);

      const db = openDb(tempDir);
      const rows = db.prepare('SELECT id, type FROM lessons ORDER BY id').all() as Array<{
        id: string;
        type: string;
      }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]!.type).toBe('lesson');
      expect(rows[1]!.type).toBe('lesson');
    });
  });

  describe('contentHash', () => {
    it('returns deterministic hash for same input', () => {
      const hash1 = contentHash('trigger text', 'insight text');
      const hash2 = contentHash('trigger text', 'insight text');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different trigger', () => {
      const hash1 = contentHash('trigger A', 'insight');
      const hash2 = contentHash('trigger B', 'insight');
      expect(hash1).not.toBe(hash2);
    });

    it('returns different hash for different insight', () => {
      const hash1 = contentHash('trigger', 'insight A');
      const hash2 = contentHash('trigger', 'insight B');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character hex string (SHA-256)', () => {
      const hash = contentHash('trigger', 'insight');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('embedding cache', () => {
    it('returns null for non-existent lesson', () => {
      openDb(tempDir);
      const result = getCachedEmbedding(tempDir, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when content_hash does not match', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'original insight'));
      await rebuildIndex(tempDir);

      // Set embedding with current hash
      const embedding = new Float32Array([1, 2, 3]);
      setCachedEmbedding(tempDir, 'L001', embedding, contentHash('trigger for original insight', 'original insight'));

      // Get with different hash (simulating content change)
      const result = getCachedEmbedding(tempDir, 'L001', 'different_hash');
      expect(result).toBeNull();
    });

    it('returns cached embedding when content_hash matches', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test insight'));
      await rebuildIndex(tempDir);

      const hash = contentHash('trigger for test insight', 'test insight');
      const embedding = new Float32Array([1.5, 2.5, 3.5]);
      setCachedEmbedding(tempDir, 'L001', embedding, hash);

      const result = getCachedEmbedding(tempDir, 'L001', hash);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(1.5);
      expect(result![1]).toBeCloseTo(2.5);
      expect(result![2]).toBeCloseTo(3.5);
    });

    it('setCachedEmbedding updates content_hash in database', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test insight'));
      await rebuildIndex(tempDir);

      const hash = contentHash('trigger for test insight', 'test insight');
      const embedding = new Float32Array([1, 2, 3]);
      setCachedEmbedding(tempDir, 'L001', embedding, hash);

      // Verify hash was stored
      const db = openDb(tempDir);
      const row = db.prepare('SELECT content_hash FROM lessons WHERE id = ?').get('L001') as { content_hash: string };
      expect(row.content_hash).toBe(hash);
    });
  });

  describe('rebuildIndex with embedding preservation', () => {
    it('preserves embeddings when content_hash unchanged', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test insight'));
      await rebuildIndex(tempDir);

      // Set embedding with correct hash
      const hash = contentHash('trigger for test insight', 'test insight');
      const embedding = new Float32Array([1, 2, 3]);
      setCachedEmbedding(tempDir, 'L001', embedding, hash);

      // Rebuild index
      await rebuildIndex(tempDir);

      // Embedding should still be there
      const result = getCachedEmbedding(tempDir, 'L001', hash);
      expect(result).not.toBeNull();
      expect(result![0]).toBeCloseTo(1);
    });

    it('clears embeddings when content changes', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'original insight'));
      await rebuildIndex(tempDir);

      // Set embedding with original hash
      const oldHash = contentHash('trigger for original insight', 'original insight');
      const embedding = new Float32Array([1, 2, 3]);
      setCachedEmbedding(tempDir, 'L001', embedding, oldHash);

      // Simulate content change by manually updating the lesson text
      // (In practice this would be a new lesson in JSONL)
      const db = openDb(tempDir);
      db.prepare('UPDATE lessons SET insight = ? WHERE id = ?').run('modified insight', 'L001');

      // Now getCachedEmbedding with new hash should return null
      const newHash = contentHash('trigger for original insight', 'modified insight');
      const result = getCachedEmbedding(tempDir, 'L001', newHash);
      expect(result).toBeNull();
    });
  });

  describe('searchKeyword', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createQuickLesson('L002', 'prefer pandas sometimes'));
      await appendLesson(tempDir, createFullLesson('L003', 'always test code', 'high'));
      await rebuildIndex(tempDir);
    });

    it('returns matching lessons', async () => {
      const results = await searchKeyword(tempDir, 'Polars', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('L001');
    });

    it('searches across trigger and insight', async () => {
      // 'trigger for' is in all trigger fields
      const results = await searchKeyword(tempDir, 'trigger', 10);
      expect(results).toHaveLength(3);
    });

    it('respects limit parameter', async () => {
      const results = await searchKeyword(tempDir, 'trigger', 2);
      expect(results).toHaveLength(2);
    });

    it('returns empty for no matches', async () => {
      const results = await searchKeyword(tempDir, 'nonexistent', 10);
      expect(results).toEqual([]);
    });

    it('returns typed Lesson objects', async () => {
      const results = await searchKeyword(tempDir, 'always test', 10);
      expect(results).toHaveLength(1);
      const lesson = results[0]!;
      expect(lesson.type).toBe('lesson');
      expect(lesson.severity).toBe('high');
      expect(lesson.evidence).toBe('Test evidence');
    });

    it('handles empty index', async () => {
      closeDb();
      const emptyDir = await mkdtemp(join(tmpdir(), 'compound-agent-empty-'));
      try {
        const results = await searchKeyword(emptyDir, 'test', 10);
        expect(results).toEqual([]);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('lossless roundtrip for optional fields', () => {
    it('preserves evidence/severity on quick lesson', async () => {
      // Quick lesson with optional fields set
      const lesson = {
        ...createQuickLesson('L001', 'quick with evidence'),
        evidence: 'Some evidence',
        severity: 'high' as const,
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'evidence', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.evidence).toBe('Some evidence');
      expect(results[0]!.severity).toBe('high');
    });

    it('returns undefined for missing evidence/severity on full lesson', async () => {
      // Full lesson WITHOUT evidence/severity
      const lesson = createFullLesson('L001', 'full without extras', 'medium');
      // Remove evidence and severity to test undefined handling
      delete (lesson as Record<string, unknown>).evidence;
      delete (lesson as Record<string, unknown>).severity;
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'full', 10);
      expect(results).toHaveLength(1);
      // Should be undefined, NOT defaulted to '' or 'medium'
      expect(results[0]!.evidence).toBeUndefined();
      expect(results[0]!.severity).toBeUndefined();
    });

    it('preserves evidence/severity exactly on full lesson', async () => {
      const lesson = createFullLesson('L001', 'full with high severity', 'high');
      (lesson as Record<string, unknown>).evidence = 'Critical bug';
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'severity', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.evidence).toBe('Critical bug');
      expect(results[0]!.severity).toBe('high');
    });

    it('does not mutate low severity to medium', async () => {
      const lesson = createFullLesson('L001', 'low severity lesson', 'low');
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'low', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.severity).toBe('low');
    });

    it('preserves deleted flag when present in database row', async () => {
      // Manually insert a deleted lesson to test rowToLesson handling
      const db = openDb(tempDir);
      db.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed, deleted)
        VALUES ('L001', 'quick', 'test trigger', 'test insight', 'tag1', 'manual', '{}', '[]', '[]', '2026-01-30', 1, 1)
      `).run();

      // Query directly to get the deleted lesson through rowToLesson
      const results = await searchKeyword(tempDir, 'test', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.deleted).toBe(true);
    });
  });

  describe('syncIfNeeded', () => {
    it('rebuilds index when JSONL is newer than last sync', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first lesson'));
      await rebuildIndex(tempDir);

      // Add new lesson without rebuilding
      await appendLesson(tempDir, createQuickLesson('L002', 'second lesson'));

      // syncIfNeeded should detect change and rebuild
      const rebuilt = await syncIfNeeded(tempDir);
      expect(rebuilt).toBe(true);

      // Verify both lessons are in index
      const db = openDb(tempDir);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
      expect(count.cnt).toBe(2);
    });

    it('skips rebuild when JSONL unchanged since last sync', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'lesson'));
      await rebuildIndex(tempDir);

      // syncIfNeeded twice - second should skip
      const first = await syncIfNeeded(tempDir);
      const second = await syncIfNeeded(tempDir);

      expect(first).toBe(false); // Already synced by rebuildIndex
      expect(second).toBe(false);
    });

    it('forces rebuild when force=true', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'lesson'));
      await rebuildIndex(tempDir);

      // Force should always rebuild
      const rebuilt = await syncIfNeeded(tempDir, { force: true });
      expect(rebuilt).toBe(true);
    });

    it('handles missing JSONL file gracefully', async () => {
      // No JSONL file exists yet
      const rebuilt = await syncIfNeeded(tempDir);
      expect(rebuilt).toBe(false);
    });

    it('detects mtime changes at second precision', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'lesson'));
      await rebuildIndex(tempDir);

      // Touch the file to update mtime
      const jsonlPath = join(tempDir, LESSONS_PATH);
      const futureTime = new Date(Date.now() + 2000);
      await utimes(jsonlPath, futureTime, futureTime);

      const rebuilt = await syncIfNeeded(tempDir);
      expect(rebuilt).toBe(true);
    });
  });

  describe('retrieval count tracking', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars'));
      await appendLesson(tempDir, createQuickLesson('L002', 'prefer uv'));
      await appendLesson(tempDir, createQuickLesson('L003', 'test first'));
      await rebuildIndex(tempDir);
    });

    describe('incrementRetrievalCount', () => {
      it('increments count for single lesson', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        incrementRetrievalCount(tempDir, ['L001']);

        const stats = getRetrievalStats(tempDir);
        const l001 = stats.find((s) => s.id === 'L001');
        expect(l001?.count).toBe(1);
      });

      it('increments count for multiple lessons', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        incrementRetrievalCount(tempDir, ['L001', 'L002']);

        const stats = getRetrievalStats(tempDir);
        expect(stats.find((s) => s.id === 'L001')?.count).toBe(1);
        expect(stats.find((s) => s.id === 'L002')?.count).toBe(1);
        expect(stats.find((s) => s.id === 'L003')?.count).toBe(0);
      });

      it('accumulates counts across multiple calls', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        incrementRetrievalCount(tempDir, ['L001']);
        incrementRetrievalCount(tempDir, ['L001']);
        incrementRetrievalCount(tempDir, ['L001']);

        const stats = getRetrievalStats(tempDir);
        expect(stats.find((s) => s.id === 'L001')?.count).toBe(3);
      });

      it('updates last_retrieved timestamp', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        const before = new Date();
        incrementRetrievalCount(tempDir, ['L001']);
        const after = new Date();

        const stats = getRetrievalStats(tempDir);
        const l001 = stats.find((s) => s.id === 'L001');
        expect(l001?.lastRetrieved).not.toBeNull();
        const timestamp = new Date(l001!.lastRetrieved!);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      });

      it('ignores non-existent lesson IDs', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        // Should not throw
        incrementRetrievalCount(tempDir, ['nonexistent', 'L001']);

        const stats = getRetrievalStats(tempDir);
        expect(stats.find((s) => s.id === 'L001')?.count).toBe(1);
        expect(stats.find((s) => s.id === 'nonexistent')).toBeUndefined();
      });

      it('handles empty array without error', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        // Should not throw
        incrementRetrievalCount(tempDir, []);

        const stats = getRetrievalStats(tempDir);
        expect(stats.every((s) => s.count === 0)).toBe(true);
      });
    });

    describe('getRetrievalStats', () => {
      it('returns stats for all lessons', async () => {
        const { getRetrievalStats } = await import('./sqlite/index.js');

        const stats = getRetrievalStats(tempDir);
        expect(stats).toHaveLength(3);
      });

      it('returns zero count and null lastRetrieved for never-retrieved lessons', async () => {
        const { getRetrievalStats } = await import('./sqlite/index.js');

        const stats = getRetrievalStats(tempDir);
        for (const stat of stats) {
          expect(stat.count).toBe(0);
          expect(stat.lastRetrieved).toBeNull();
        }
      });

      it('returns correct structure', async () => {
        const { incrementRetrievalCount, getRetrievalStats } = await import('./sqlite/index.js');

        incrementRetrievalCount(tempDir, ['L001']);

        const stats = getRetrievalStats(tempDir);
        const l001 = stats.find((s) => s.id === 'L001');
        expect(l001).toMatchObject({
          id: 'L001',
          count: 1,
        });
        expect(typeof l001?.lastRetrieved).toBe('string');
      });
    });

    describe('searchKeyword has no retrieval-count side effects', () => {
      it('does not increment count for returned lessons', async () => {
        const { getRetrievalStats } = await import('./sqlite/index.js');

        await searchKeyword(tempDir, 'Polars', 10);

        const stats = getRetrievalStats(tempDir);
        expect(stats.find((s) => s.id === 'L001')?.count).toBe(0);
        expect(stats.find((s) => s.id === 'L002')?.count).toBe(0);
        expect(stats.find((s) => s.id === 'L003')?.count).toBe(0);
      });

      it('does not increment count across multiple searches', async () => {
        const { getRetrievalStats } = await import('./sqlite/index.js');

        await searchKeyword(tempDir, 'trigger', 10);
        await searchKeyword(tempDir, 'Polars', 10);

        const stats = getRetrievalStats(tempDir);
        expect(stats.every((s) => s.count === 0)).toBe(true);
      });

      it('does not increment count when no matches', async () => {
        const { getRetrievalStats } = await import('./sqlite/index.js');

        await searchKeyword(tempDir, 'nonexistent', 10);

        const stats = getRetrievalStats(tempDir);
        expect(stats.every((s) => s.count === 0)).toBe(true);
      });
    });
  });

  describe('v0.2.2 fields roundtrip', () => {
    it('stores and retrieves invalidatedAt and invalidationReason', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'invalidated lesson'),
        invalidatedAt: '2026-01-15T10:30:00.000Z',
        invalidationReason: 'Superseded by newer approach',
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      // Query directly since searchKeyword filters out invalidated lessons
      const db = openDb(tempDir);
      const row = db.prepare('SELECT invalidated_at, invalidation_reason FROM lessons WHERE id = ?').get('L001') as {
        invalidated_at: string | null;
        invalidation_reason: string | null;
      };
      expect(row.invalidated_at).toBe('2026-01-15T10:30:00.000Z');
      expect(row.invalidation_reason).toBe('Superseded by newer approach');
    });

    it('stores and retrieves citation with all fields', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'lesson with citation'),
        citation: {
          file: 'src/storage/sqlite.ts',
          line: 42,
          commit: 'abc123def',
        },
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'citation', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.citation).toEqual({
        file: 'src/storage/sqlite.ts',
        line: 42,
        commit: 'abc123def',
      });
    });

    it('stores and retrieves citation with only file', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'lesson with file only'),
        citation: {
          file: 'README.md',
        },
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'file only', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.citation).toEqual({ file: 'README.md' });
    });

    it('stores and retrieves compactionLevel and compactedAt', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'compacted lesson'),
        compactionLevel: 1 as const,
        compactedAt: '2026-01-20T12:00:00.000Z',
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'compacted', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.compactionLevel).toBe(1);
      expect(results[0]!.compactedAt).toBe('2026-01-20T12:00:00.000Z');
    });

    it('stores and retrieves lastRetrieved', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'recently retrieved'),
        lastRetrieved: '2026-01-25T08:00:00.000Z',
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'retrieved', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.lastRetrieved).toBe('2026-01-25T08:00:00.000Z');
    });

    it('omits undefined v0.2.2 fields from returned lesson', async () => {
      const lesson = createQuickLesson('L001', 'basic lesson');
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'basic', 10);
      expect(results).toHaveLength(1);
      // Fields should be undefined, not null or empty
      expect(results[0]!.invalidatedAt).toBeUndefined();
      expect(results[0]!.invalidationReason).toBeUndefined();
      expect(results[0]!.citation).toBeUndefined();
      expect(results[0]!.compactionLevel).toBeUndefined();
      expect(results[0]!.compactedAt).toBeUndefined();
      expect(results[0]!.lastRetrieved).toBeUndefined();
    });

    it('preserves compactionLevel 0 as undefined (default)', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'active lesson'),
        compactionLevel: 0 as const,
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'active', 10);
      expect(results).toHaveLength(1);
      // compactionLevel 0 is the default, so it should be undefined
      expect(results[0]!.compactionLevel).toBeUndefined();
    });

    it('preserves compactionLevel 2 (archived)', async () => {
      const lesson = {
        ...createQuickLesson('L001', 'archived lesson'),
        compactionLevel: 2 as const,
        compactedAt: '2026-01-01T00:00:00.000Z',
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'archived', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.compactionLevel).toBe(2);
    });

    it('roundtrips lesson with all v0.2.2 fields set', async () => {
      const lesson = {
        ...createFullLesson('L001', 'complete v0.2.2 lesson', 'high'),
        invalidatedAt: '2026-01-10T00:00:00.000Z',
        invalidationReason: 'Deprecated',
        citation: { file: 'test.ts', line: 100, commit: 'deadbeef' },
        compactionLevel: 1 as const,
        compactedAt: '2026-01-15T00:00:00.000Z',
        lastRetrieved: '2026-01-20T00:00:00.000Z',
      };
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);

      // Query directly since searchKeyword filters out invalidated lessons
      const db = openDb(tempDir);
      const row = db
        .prepare(
          `SELECT invalidated_at, invalidation_reason, citation_file, citation_line,
                  citation_commit, compaction_level, compacted_at, last_retrieved
           FROM lessons WHERE id = ?`
        )
        .get('L001') as {
        invalidated_at: string | null;
        invalidation_reason: string | null;
        citation_file: string | null;
        citation_line: number | null;
        citation_commit: string | null;
        compaction_level: number | null;
        compacted_at: string | null;
        last_retrieved: string | null;
      };
      expect(row.invalidated_at).toBe('2026-01-10T00:00:00.000Z');
      expect(row.invalidation_reason).toBe('Deprecated');
      expect(row.citation_file).toBe('test.ts');
      expect(row.citation_line).toBe(100);
      expect(row.citation_commit).toBe('deadbeef');
      expect(row.compaction_level).toBe(1);
      expect(row.compacted_at).toBe('2026-01-15T00:00:00.000Z');
      expect(row.last_retrieved).toBe('2026-01-20T00:00:00.000Z');
    });
  });

  describe('v0.2.2 schema columns', () => {
    it('lessons table has v0.2.2 columns', () => {
      const db = openDb(tempDir);
      const columns = db
        .prepare("PRAGMA table_info('lessons')")
        .all() as Array<{ name: string; type: string }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('invalidated_at');
      expect(columnNames).toContain('invalidation_reason');
      expect(columnNames).toContain('citation_file');
      expect(columnNames).toContain('citation_line');
      expect(columnNames).toContain('citation_commit');
      expect(columnNames).toContain('compaction_level');
      expect(columnNames).toContain('compacted_at');
    });
  });

  describe('searchKeyword filters invalidated lessons', () => {
    it('excludes lessons with invalidatedAt set', async () => {
      // Create a valid lesson
      await appendLesson(tempDir, createQuickLesson('L001', 'valid lesson'));
      // Create an invalidated lesson
      await appendLesson(tempDir, {
        ...createQuickLesson('L002', 'invalidated lesson'),
        invalidatedAt: '2026-01-15T10:30:00.000Z',
        invalidationReason: 'This approach was wrong',
      });
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'lesson', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('L001');
    });

    it('returns empty when all matching lessons are invalidated', async () => {
      await appendLesson(tempDir, {
        ...createQuickLesson('L001', 'invalidated one'),
        invalidatedAt: '2026-01-15T10:30:00.000Z',
      });
      await appendLesson(tempDir, {
        ...createQuickLesson('L002', 'invalidated two'),
        invalidatedAt: '2026-01-16T10:30:00.000Z',
      });
      await rebuildIndex(tempDir);

      const results = await searchKeyword(tempDir, 'invalidated', 10);
      expect(results).toEqual([]);
    });

    it('does not increment retrieval count when filtering invalidated lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'valid lesson'));
      await appendLesson(tempDir, {
        ...createQuickLesson('L002', 'invalid lesson'),
        invalidatedAt: '2026-01-15T10:30:00.000Z',
      });
      await rebuildIndex(tempDir);

      await searchKeyword(tempDir, 'lesson', 10);

      const stats = getRetrievalStats(tempDir);
      expect(stats.find((s) => s.id === 'L001')?.count).toBe(0);
      expect(stats.find((s) => s.id === 'L002')?.count).toBe(0);
    });
  });
});
