/**
 * Tests for unified memory search across all item types.
 *
 * Validates that vector search, ranking, and type aliases work
 * correctly with all 4 memory item types.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { appendMemoryItem } from '../storage/jsonl.js';
import { closeDb, rebuildIndex } from '../storage/sqlite/index.js';
import { createLesson } from '../../test-utils.js';
import type { MemoryItem, MemoryItemType } from '../types.js';

import { cosineSimilarity, searchVector } from './vector.js';
import type { ScoredLesson } from './vector.js';
import {
  calculateScore,
  rankLessons,
  severityBoost,
  recencyBoost,
  confirmationBoost,
} from './ranking.js';
import type { RankedLesson } from './ranking.js';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unified search across all memory types', () => {
  describe('vector search with mixed types', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-unified-search-'));
    });

    afterEach(async () => {
      closeDb();
      await rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it('searchVector returns items of all types', async () => {
      await appendMemoryItem(tempDir, createMemoryItem('L001', 'lesson', 'always write tests'));
      await appendMemoryItem(tempDir, createMemoryItem('S001', 'solution', 'fix timeout by retrying'));
      await appendMemoryItem(tempDir, createMemoryItem('P001', 'pattern', 'use map not forEach'));
      await appendMemoryItem(tempDir, createMemoryItem('R001', 'preference', 'prefer pnpm'));
      await rebuildIndex(tempDir);

      // Mock embedText to return predictable vectors
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

      const results = await searchVector(tempDir, 'testing', { limit: 10 });
      expect(results.length).toBe(4);
      const types = results.map((r) => r.lesson.type).sort();
      expect(types).toEqual(['lesson', 'pattern', 'preference', 'solution']);
    });

    it('searchVector skips invalidated items of any type', async () => {
      await appendMemoryItem(tempDir, createMemoryItem('S001', 'solution', 'valid solution'));
      await appendMemoryItem(tempDir, {
        ...createMemoryItem('S002', 'solution', 'invalidated solution'),
        invalidatedAt: '2026-01-15T00:00:00.000Z',
      } as MemoryItem);
      await rebuildIndex(tempDir);

      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

      const results = await searchVector(tempDir, 'solution', { limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0]!.lesson.id).toBe('S001');
    });
  });

  describe('ranking works with all memory types', () => {
    it('severityBoost works on solution type', () => {
      const solution = createMemoryItem('S001', 'solution', 'fix timeout', { severity: 'high' });
      expect(severityBoost(solution as any)).toBe(1.5);
    });

    it('recencyBoost works on pattern type', () => {
      const pattern = createMemoryItem('P001', 'pattern', 'use map');
      // Created just now, so should get recency boost
      expect(recencyBoost(pattern as any)).toBe(1.2);
    });

    it('confirmationBoost works on preference type', () => {
      const preference = createMemoryItem('R001', 'preference', 'prefer pnpm', { confirmed: true });
      expect(confirmationBoost(preference as any)).toBe(1.3);
    });

    it('calculateScore works on all types', () => {
      const solution = createMemoryItem('S001', 'solution', 'fix timeout', {
        severity: 'high',
        confirmed: true,
      });
      const score = calculateScore(solution as any, 0.8);
      expect(score).toBeGreaterThan(0.8); // Should get some boost
    });

    it('rankLessons handles mixed-type scored items', () => {
      const items: ScoredLesson[] = [
        {
          lesson: createMemoryItem('L001', 'lesson', 'test lesson', { severity: 'low' }) as any,
          score: 0.9,
        },
        {
          lesson: createMemoryItem('S001', 'solution', 'fix timeout', { severity: 'high' }) as any,
          score: 0.7,
        },
        {
          lesson: createMemoryItem('P001', 'pattern', 'use map', { severity: 'medium' }) as any,
          score: 0.8,
        },
      ];

      const ranked = rankLessons(items);
      expect(ranked).toHaveLength(3);
      // High severity solution should rank first despite lower vector score
      expect(ranked[0]!.lesson.id).toBe('S001');
      // All items should have finalScore
      for (const item of ranked) {
        expect(item.finalScore).toBeDefined();
      }
    });
  });

  describe('backward compatibility', () => {
    it('ScoredLesson type accepts MemoryItem in lesson field', () => {
      const item = createMemoryItem('S001', 'solution', 'fix timeout');
      // This should compile and work - ScoredLesson.lesson is typed as Lesson
      // but MemoryItem shares the same base structure
      const scored: ScoredLesson = { lesson: item as any, score: 0.8 };
      expect(scored.lesson.type).toBe('solution');
    });

    it('RankedLesson type works with mixed types', () => {
      const ranked: RankedLesson = {
        lesson: createMemoryItem('P001', 'pattern', 'use map') as any,
        score: 0.8,
        finalScore: 1.0,
      };
      expect(ranked.lesson.type).toBe('pattern');
    });
  });
});
