import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import {
  closeDb,
  contentHash,
  openDb,
  rebuildIndex,
  setCachedEmbedding,
} from '../storage/sqlite/index.js';
import { createQuickLesson } from '../../test-utils.js';

import { cosineSimilarity, searchVector } from './vector.js';

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

    it('throws error for vectors with different lengths', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => cosineSimilarity(v1, v2)).toThrow('Vectors must have same length');
    });
  });

  describe('searchVector', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-vector-'));
    });

    afterEach(async () => {
      closeDb();
      await rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it('returns empty array for empty database', async () => {
      const results = await searchVector(tempDir, 'test query', { limit: 10 });
      expect(results).toEqual([]);
    });

    it('returns lessons sorted by similarity', async () => {
      // Add lessons
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createQuickLesson('L002', 'prefer pandas sometimes'));
      await appendLesson(tempDir, createQuickLesson('L003', 'always test code'));
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

      const results = await searchVector(tempDir, 'data processing', { limit: 10 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects limit parameter', async () => {
      // Add many lessons
      for (let i = 0; i < 5; i++) {
        await appendLesson(tempDir, createQuickLesson(`L00${i}`, `lesson ${i}`));
      }
      await rebuildIndex(tempDir);

      // Mock embedText
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

      const results = await searchVector(tempDir, 'test', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    describe('embedding cache', () => {
      it('uses cached embedding instead of recomputing', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
        await rebuildIndex(tempDir);

        // Pre-cache the embedding
        const hash = contentHash('trigger for test lesson', 'test lesson');
        const cachedEmbedding = new Float32Array([0.9, 0.1, 0]);
        setCachedEmbedding(tempDir, 'L001', cachedEmbedding, hash);

        // Mock embedText to track calls
        const embedMock = vi.fn().mockResolvedValue([0.8, 0.2, 0]);
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        await searchVector(tempDir, 'test query', { limit: 10 });

        // embedText should only be called once for the query, not for the lesson
        expect(embedMock).toHaveBeenCalledTimes(1);
        expect(embedMock).toHaveBeenCalledWith('test query');
      });

      it('computes and caches embedding on cache miss', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
        await rebuildIndex(tempDir);

        // No cached embedding
        const embedMock = vi.fn().mockResolvedValue([0.8, 0.2, 0]);
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        await searchVector(tempDir, 'test query', { limit: 10 });

        // embedText should be called twice: once for query, once for lesson
        expect(embedMock).toHaveBeenCalledTimes(2);
        expect(embedMock).toHaveBeenCalledWith('test query');
        expect(embedMock).toHaveBeenCalledWith('trigger for test lesson test lesson');

        // Verify embedding was cached
        const db = openDb(tempDir);
        const row = db.prepare('SELECT embedding, content_hash FROM lessons WHERE id = ?').get('L001') as {
          embedding: Buffer | null;
          content_hash: string | null;
        };
        expect(row.embedding).not.toBeNull();
        expect(row.content_hash).toBe(contentHash('trigger for test lesson', 'test lesson'));
      });

      it('recomputes embedding when content hash mismatches', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
        await rebuildIndex(tempDir);

        // Cache embedding with wrong hash (simulates stale cache)
        const staleHash = 'stale_hash_value_that_does_not_match';
        const staleEmbedding = new Float32Array([0.1, 0.1, 0.1]);
        setCachedEmbedding(tempDir, 'L001', staleEmbedding, staleHash);

        const embedMock = vi.fn().mockResolvedValue([0.8, 0.2, 0]);
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        await searchVector(tempDir, 'test query', { limit: 10 });

        // embedText should be called twice: query + lesson (cache miss due to hash mismatch)
        expect(embedMock).toHaveBeenCalledTimes(2);
      });
    });

    it('uses default limit of 10 when no options provided', async () => {
      // Add 15 lessons
      for (let i = 0; i < 15; i++) {
        await appendLesson(tempDir, createQuickLesson(`L${String(i).padStart(3, '0')}`, `lesson ${i}`));
      }
      await rebuildIndex(tempDir);

      // Mock embedText
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

      // Call without options - should use default limit of 10
      const results = await searchVector(tempDir, 'test');
      expect(results.length).toBe(10);
    });

    describe('filters invalidated lessons', () => {
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

        // Mock embedText
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

        const results = await searchVector(tempDir, 'lesson', { limit: 10 });
        expect(results).toHaveLength(1);
        expect(results[0]!.lesson.id).toBe('L001');
      });

      it('returns empty when all lessons are invalidated', async () => {
        await appendLesson(tempDir, {
          ...createQuickLesson('L001', 'invalidated one'),
          invalidatedAt: '2026-01-15T10:30:00.000Z',
        });
        await appendLesson(tempDir, {
          ...createQuickLesson('L002', 'invalidated two'),
          invalidatedAt: '2026-01-16T10:30:00.000Z',
        });
        await rebuildIndex(tempDir);

        // Mock embedText
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue([1, 0, 0]);

        const results = await searchVector(tempDir, 'test query', { limit: 10 });
        expect(results).toEqual([]);
      });

      it('does not compute embeddings for invalidated lessons', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'valid lesson'));
        await appendLesson(tempDir, {
          ...createQuickLesson('L002', 'invalidated lesson'),
          invalidatedAt: '2026-01-15T10:30:00.000Z',
        });
        await rebuildIndex(tempDir);

        // Mock embedText to track calls
        const embedMock = vi.fn().mockResolvedValue([1, 0, 0]);
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        await searchVector(tempDir, 'test query', { limit: 10 });

        // Should only call embedText for query + valid lesson (not invalidated one)
        expect(embedMock).toHaveBeenCalledTimes(2);
        expect(embedMock).toHaveBeenCalledWith('test query');
        expect(embedMock).toHaveBeenCalledWith('trigger for valid lesson valid lesson');
      });
    });
  });
});
