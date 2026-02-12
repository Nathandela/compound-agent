/**
 * Tests for unified memory types in SQLite.
 *
 * Validates that all 4 memory item types (lesson, solution, pattern, preference)
 * are correctly stored, indexed, and searchable via the SQLite cache layer.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { MemoryItem, MemoryItemType } from '../../types.js';
import { appendMemoryItem } from '../jsonl.js';

import { closeDb, openDb } from './connection.js';
import { rebuildIndex } from './sync.js';
import { searchKeyword } from './search.js';
import { SCHEMA_VERSION } from './schema.js';

// ---------------------------------------------------------------------------
// Test fixtures: one item per type
// ---------------------------------------------------------------------------

function createMemoryItem(
  id: string,
  type: MemoryItemType,
  insight: string,
  extra: Partial<MemoryItem> = {}
): MemoryItem {
  const base = {
    id,
    trigger: `trigger for ${insight}`,
    insight,
    tags: ['test'],
    source: 'manual' as const,
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [] as string[],
    related: [] as string[],
  };

  if (type === 'pattern') {
    return {
      ...base,
      type: 'pattern',
      pattern: { bad: 'bad code', good: 'good code' },
      ...extra,
    } as MemoryItem;
  }
  return { ...base, type, ...extra } as MemoryItem;
}

const LESSON_ITEM = createMemoryItem('L00000001', 'lesson', 'always write tests first');
const SOLUTION_ITEM = createMemoryItem('S00000001', 'solution', 'fix timeout by increasing limit');
const PATTERN_ITEM = createMemoryItem('P00000001', 'pattern', 'use map instead of forEach');
const PREFERENCE_ITEM = createMemoryItem('R00000001', 'preference', 'prefer pnpm over npm');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unified memory types in SQLite', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-unified-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  // -- Schema ----------------------------------------------------------------

  describe('schema', () => {
    it('creates type index on lessons table', () => {
      const db = openDb(tempDir);
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_lessons_type'")
        .get() as { name: string } | undefined;
      expect(indexes?.name).toBe('idx_lessons_type');
    });

    it('sets user_version to expected schema version', () => {
      const db = openDb(tempDir);
      const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(row.user_version).toBe(SCHEMA_VERSION);
    });

    it('exports SCHEMA_VERSION constant', () => {
      expect(typeof SCHEMA_VERSION).toBe('number');
      expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    });
  });

  // -- Insert + query for each type ------------------------------------------

  describe('insert and retrieve each type', () => {
    it('inserts and retrieves a lesson type', async () => {
      await appendMemoryItem(tempDir, LESSON_ITEM);
      await rebuildIndex(tempDir);
      const results = await searchKeyword(tempDir, 'tests first', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('L00000001');
      expect(results[0]!.type).toBe('lesson');
    });

    it('inserts and retrieves a solution type', async () => {
      await appendMemoryItem(tempDir, SOLUTION_ITEM);
      await rebuildIndex(tempDir);
      const results = await searchKeyword(tempDir, 'timeout', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('S00000001');
      expect(results[0]!.type).toBe('solution');
    });

    it('inserts and retrieves a pattern type', async () => {
      await appendMemoryItem(tempDir, PATTERN_ITEM);
      await rebuildIndex(tempDir);
      const results = await searchKeyword(tempDir, 'forEach', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('P00000001');
      expect(results[0]!.type).toBe('pattern');
    });

    it('inserts and retrieves a preference type', async () => {
      await appendMemoryItem(tempDir, PREFERENCE_ITEM);
      await rebuildIndex(tempDir);
      const results = await searchKeyword(tempDir, 'pnpm', 10);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('R00000001');
      expect(results[0]!.type).toBe('preference');
    });
  });

  // -- Type filtering --------------------------------------------------------

  describe('type filtering', () => {
    beforeEach(async () => {
      await appendMemoryItem(tempDir, LESSON_ITEM);
      await appendMemoryItem(tempDir, SOLUTION_ITEM);
      await appendMemoryItem(tempDir, PATTERN_ITEM);
      await appendMemoryItem(tempDir, PREFERENCE_ITEM);
      await rebuildIndex(tempDir);
    });

    it('searchKeyword with type filter returns only matching type', async () => {
      const results = await searchKeyword(tempDir, 'trigger', 10, 'solution');
      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe('solution');
    });

    it('searchKeyword without type filter returns all types', async () => {
      const results = await searchKeyword(tempDir, 'trigger', 10);
      expect(results).toHaveLength(4);
      const types = results.map((r) => r.type).sort();
      expect(types).toEqual(['lesson', 'pattern', 'preference', 'solution']);
    });

    it('type filter with no matches returns empty', async () => {
      const results = await searchKeyword(tempDir, 'pnpm', 10, 'lesson');
      expect(results).toEqual([]);
    });
  });

  // -- FTS5 across types -----------------------------------------------------

  describe('FTS5 across types', () => {
    it('keyword search finds items across all types', async () => {
      await appendMemoryItem(tempDir, LESSON_ITEM);
      await appendMemoryItem(tempDir, SOLUTION_ITEM);
      await appendMemoryItem(tempDir, PATTERN_ITEM);
      await appendMemoryItem(tempDir, PREFERENCE_ITEM);
      await rebuildIndex(tempDir);

      // 'trigger' appears in all items' trigger field
      const results = await searchKeyword(tempDir, 'trigger', 10);
      expect(results).toHaveLength(4);
    });
  });

  // -- Schema version auto-rebuild -------------------------------------------

  describe('schema version', () => {
    it('auto-rebuilds when user_version < SCHEMA_VERSION', () => {
      // Open DB with current schema
      const db1 = openDb(tempDir);
      db1.prepare(`
        INSERT INTO lessons (id, type, trigger, insight, tags, source, context, supersedes, related, created, confirmed)
        VALUES ('L001', 'lesson', 'test', 'test', '', 'manual', '{}', '[]', '[]', '2026-01-30', 1)
      `).run();
      // Simulate old version
      db1.pragma('user_version = 1');
      closeDb();

      // Re-open should detect old version and recreate
      const db2 = openDb(tempDir);
      const row = db2.prepare('PRAGMA user_version').get() as { user_version: number };
      expect(row.user_version).toBe(SCHEMA_VERSION);

      // Old data should be gone (DB was recreated)
      const count = db2.prepare('SELECT COUNT(*) as cnt FROM lessons').get() as { cnt: number };
      expect(count.cnt).toBe(0);
    });
  });

  // -- Rebuild from JSONL with all types -------------------------------------

  describe('rebuildIndex with all types', () => {
    it('handles all 4 memory types from JSONL', async () => {
      await appendMemoryItem(tempDir, LESSON_ITEM);
      await appendMemoryItem(tempDir, SOLUTION_ITEM);
      await appendMemoryItem(tempDir, PATTERN_ITEM);
      await appendMemoryItem(tempDir, PREFERENCE_ITEM);
      await rebuildIndex(tempDir);

      const db = openDb(tempDir);
      const rows = db
        .prepare('SELECT id, type FROM lessons ORDER BY id')
        .all() as Array<{ id: string; type: string }>;

      expect(rows).toHaveLength(4);
      const typeMap = Object.fromEntries(rows.map((r) => [r.id, r.type]));
      expect(typeMap['L00000001']).toBe('lesson');
      expect(typeMap['P00000001']).toBe('pattern');
      expect(typeMap['R00000001']).toBe('preference');
      expect(typeMap['S00000001']).toBe('solution');
    });
  });
});
