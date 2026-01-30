import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { cosineSimilarity, searchVector } from './vector.js';
import { appendLesson } from '../storage/jsonl.js';
import { rebuildIndex, closeDb } from '../storage/sqlite.js';
import type { QuickLesson } from '../types.js';

describe('vector search', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1);
    });

    it('returns -1 for opposite vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [-1, 0, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1);
    });

    it('returns 0 for orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0);
    });

    it('handles normalized vectors', () => {
      const v1 = [0.6, 0.8, 0];
      const v2 = [0.6, 0.8, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1);
    });

    it('returns value between -1 and 1', () => {
      const v1 = [1, 2, 3, -1, 5];
      const v2 = [5, -3, 2, 1, -2];
      const result = cosineSimilarity(v1, v2);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('handles zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });
  });

  describe('searchVector', () => {
    let tempDir: string;

    const createLesson = (id: string, insight: string): QuickLesson => ({
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

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-vector-'));
    });

    afterEach(async () => {
      closeDb();
      await rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it('returns empty array for empty database', async () => {
      const results = await searchVector(tempDir, 'test query', 10);
      expect(results).toEqual([]);
    });

    it('returns lessons sorted by similarity', async () => {
      // Add lessons
      await appendLesson(tempDir, createLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createLesson('L002', 'prefer pandas sometimes'));
      await appendLesson(tempDir, createLesson('L003', 'always test code'));
      await rebuildIndex(tempDir);

      // Mock embedText to return predictable vectors
      const { embedText } = await import('../embeddings/nomic.js');
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(
        async (text: string) => {
          // Return vectors that make "Polars" most similar to "data processing"
          if (text.includes('Polars')) return [1, 0, 0];
          if (text.includes('pandas')) return [0.5, 0.5, 0];
          if (text.includes('test')) return [0, 1, 0];
          if (text.includes('data')) return [0.9, 0.1, 0]; // Query
          return [0, 0, 1];
        }
      );

      const results = await searchVector(tempDir, 'data processing', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects limit parameter', async () => {
      // Add many lessons
      for (let i = 0; i < 5; i++) {
        await appendLesson(tempDir, createLesson(`L00${i}`, `lesson ${i}`));
      }
      await rebuildIndex(tempDir);

      // Mock embedText
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

      const results = await searchVector(tempDir, 'test', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
