import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDb, closeDb, rebuildIndex, searchKeyword, DB_PATH } from './sqlite.js';
import { appendLesson } from './jsonl.js';
import type { QuickLesson, FullLesson } from '../types.js';

describe('SQLite schema', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-sqlite-'));
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

  const createQuickLesson = (id: string, insight: string): QuickLesson => ({
    id,
    type: 'quick',
    trigger: `trigger for ${insight}`,
    insight,
    tags: ['test'],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  });

  const createFullLesson = (id: string, insight: string): FullLesson => ({
    id,
    type: 'full',
    trigger: `trigger for ${insight}`,
    insight,
    evidence: 'test evidence',
    severity: 'high',
    tags: ['important'],
    source: 'user_correction',
    context: { tool: 'edit', intent: 'fix code' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
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

    it('preserves lesson types', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'quick'));
      await appendLesson(tempDir, createFullLesson('L002', 'full'));
      await rebuildIndex(tempDir);

      const db = openDb(tempDir);
      const rows = db.prepare('SELECT id, type FROM lessons ORDER BY id').all() as Array<{
        id: string;
        type: string;
      }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]!.type).toBe('quick');
      expect(rows[1]!.type).toBe('full');
    });
  });

  describe('searchKeyword', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createQuickLesson('L002', 'prefer pandas sometimes'));
      await appendLesson(tempDir, createFullLesson('L003', 'always test code'));
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
      expect(lesson.type).toBe('full');
      if (lesson.type === 'full') {
        expect(lesson.severity).toBe('high');
        expect(lesson.evidence).toBe('test evidence');
      }
    });

    it('handles empty index', async () => {
      closeDb();
      const emptyDir = await mkdtemp(join(tmpdir(), 'learning-agent-empty-'));
      try {
        const results = await searchKeyword(emptyDir, 'test', 10);
        expect(results).toEqual([]);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
