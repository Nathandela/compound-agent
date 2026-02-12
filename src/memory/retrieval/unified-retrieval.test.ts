/**
 * Tests for unified memory retrieval across all item types.
 *
 * Validates that session retrieval and plan formatting work
 * correctly with all 4 memory item types.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appendMemoryItem } from '../storage/jsonl.js';
import { closeDb } from '../storage/sqlite/index.js';
import type { MemoryItem, MemoryItemType } from '../types.js';

import { loadSessionLessons } from './session.js';
import { formatLessonsCheck } from './plan.js';

// ---------------------------------------------------------------------------
// Test fixtures
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unified memory retrieval', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-unified-retrieval-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadSessionLessons with mixed types', () => {
    it('includes high-severity items of all types', async () => {
      await appendMemoryItem(tempDir, createMemoryItem('L001', 'lesson', 'critical lesson', { severity: 'high' }));
      await appendMemoryItem(tempDir, createMemoryItem('S001', 'solution', 'critical solution', { severity: 'high' }));
      await appendMemoryItem(tempDir, createMemoryItem('P001', 'pattern', 'critical pattern', { severity: 'high' }));
      await appendMemoryItem(tempDir, createMemoryItem('R001', 'preference', 'critical preference', { severity: 'high' }));

      const results = await loadSessionLessons(tempDir);
      expect(results).toHaveLength(4);
      const types = results.map((r) => r.type).sort();
      expect(types).toEqual(['lesson', 'pattern', 'preference', 'solution']);
    });

    it('still filters by severity across all types', async () => {
      await appendMemoryItem(tempDir, createMemoryItem('L001', 'lesson', 'high lesson', { severity: 'high' }));
      await appendMemoryItem(tempDir, createMemoryItem('S001', 'solution', 'low solution', { severity: 'low' }));
      await appendMemoryItem(tempDir, createMemoryItem('P001', 'pattern', 'medium pattern', { severity: 'medium' }));

      const results = await loadSessionLessons(tempDir);
      expect(results).toHaveLength(1);
      expect(results[0]!.insight).toBe('high lesson');
    });

    it('excludes invalidated items of all types', async () => {
      await appendMemoryItem(tempDir, createMemoryItem('L001', 'lesson', 'valid lesson', { severity: 'high' }));
      await appendMemoryItem(tempDir, {
        ...createMemoryItem('S001', 'solution', 'invalidated solution', { severity: 'high' }),
        invalidatedAt: '2026-01-15T00:00:00.000Z',
      } as MemoryItem);

      const results = await loadSessionLessons(tempDir);
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('L001');
    });
  });

  describe('formatLessonsCheck with mixed types', () => {
    it('formats items of all types', () => {
      const items = [
        { lesson: createMemoryItem('L001', 'lesson', 'always write tests') as any, score: 0.9 },
        { lesson: createMemoryItem('S001', 'solution', 'fix timeout by retrying') as any, score: 0.8 },
        { lesson: createMemoryItem('P001', 'pattern', 'use map not forEach') as any, score: 0.7 },
        { lesson: createMemoryItem('R001', 'preference', 'prefer pnpm over npm') as any, score: 0.6 },
      ];

      const message = formatLessonsCheck(items);
      expect(message).toContain('Lessons Check');
      expect(message).toContain('always write tests');
      expect(message).toContain('fix timeout by retrying');
      expect(message).toContain('use map not forEach');
      expect(message).toContain('prefer pnpm over npm');
    });
  });
});
