import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';

import { CCT_PATTERNS_PATH } from '../../compound/types.js';
import { appendLesson } from '../storage/jsonl.js';
import {
  closeDb,
  contentHash,
  openDb,
  rebuildIndex,
  setCachedEmbedding,
} from '../storage/sqlite/index.js';
import { createQuickLesson } from '../../test-utils.js';

import {
  clearCctEmbeddingCache,
  cosineSimilarity,
  findSimilarLessons,
  searchVector,
} from './vector.js';

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

    describe('property-based tests', () => {
      const DIM = 10;
      const vectorArb = (len: number) =>
        fc.array(fc.float({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
          minLength: len,
          maxLength: len,
        });
      const nonZeroVectorArb = (len: number) => vectorArb(len).filter((v) => v.some((x) => x !== 0));

      fcTest.prop([nonZeroVectorArb(DIM), nonZeroVectorArb(DIM)])(
        'result is always in [-1, 1]',
        (a, b) => {
          const result = cosineSimilarity(a, b);
          expect(result).toBeGreaterThanOrEqual(-1);
          expect(result).toBeLessThanOrEqual(1);
        }
      );

      fcTest.prop([nonZeroVectorArb(DIM), nonZeroVectorArb(DIM)])(
        'symmetric: similarity(a, b) === similarity(b, a)',
        (a, b) => {
          expect(cosineSimilarity(a, b)).toBe(cosineSimilarity(b, a));
        }
      );

      fcTest.prop([nonZeroVectorArb(DIM)])(
        'self-similarity is 1.0',
        (v) => {
          expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
        }
      );

      fcTest.prop([vectorArb(DIM)])(
        'zero vector against any vector returns 0',
        (v) => {
          const zero = new Array(DIM).fill(0) as number[];
          expect(cosineSimilarity(zero, v)).toBe(0);
          expect(cosineSimilarity(v, zero)).toBe(0);
        }
      );
    });
  });

  describe('searchVector', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-vector-'));
    });

    afterEach(async () => {
      closeDb();
      clearCctEmbeddingCache();
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
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

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
        const embedMock = vi.fn().mockResolvedValue(new Float32Array([0.8, 0.2, 0]));
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
        const embedMock = vi.fn().mockResolvedValue(new Float32Array([0.8, 0.2, 0]));
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

        const embedMock = vi.fn().mockResolvedValue(new Float32Array([0.8, 0.2, 0]));
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
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

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
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

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
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

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
        const embedMock = vi.fn().mockResolvedValue(new Float32Array([1, 0, 0]));
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        await searchVector(tempDir, 'test query', { limit: 10 });

        // Should only call embedText for query + valid lesson (not invalidated one)
        expect(embedMock).toHaveBeenCalledTimes(2);
        expect(embedMock).toHaveBeenCalledWith('test query');
        expect(embedMock).toHaveBeenCalledWith('trigger for valid lesson valid lesson');
      });
    });

    describe('per-item error handling', () => {
      it('returns partial results when embedText fails for some items', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'good lesson'));
        await appendLesson(tempDir, createQuickLesson('L002', 'bad lesson'));
        await appendLesson(tempDir, createQuickLesson('L003', 'another good lesson'));
        await rebuildIndex(tempDir);

        // Mock embedText to throw for the "bad" item
        const embedMock = vi.fn().mockImplementation(async (text: string) => {
          if (text.includes('bad')) throw new Error('embedding failed');
          return [1, 0, 0];
        });
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        const results = await searchVector(tempDir, 'test query', { limit: 10 });

        // Should return 2 results (L001 and L003), skipping L002
        expect(results).toHaveLength(2);
        const ids = results.map((r) => r.lesson.id);
        expect(ids).toContain('L001');
        expect(ids).toContain('L003');
        expect(ids).not.toContain('L002');
      });

      it('returns empty results when all items fail embedding', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
        await appendLesson(tempDir, createQuickLesson('L002', 'lesson two'));
        await rebuildIndex(tempDir);

        let callCount = 0;
        const embedMock = vi.fn().mockImplementation(async (_text: string) => {
          callCount++;
          // First call is the query - let it succeed
          if (callCount === 1) return [1, 0, 0];
          // All item embeddings fail
          throw new Error('embedding failed');
        });
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

        const results = await searchVector(tempDir, 'test query', { limit: 10 });

        expect(results).toEqual([]);
      });
    });

    describe('CCT pattern inclusion', () => {
      it('includes CCT patterns in search results when file exists', async () => {
        // Add a regular lesson
        await appendLesson(tempDir, createQuickLesson('L001', 'use const over let'));
        await rebuildIndex(tempDir);

        // Write a CCT pattern file
        const cctPath = join(tempDir, CCT_PATTERNS_PATH);
        await mkdir(dirname(cctPath), { recursive: true });
        const pattern = {
          id: 'CCT-abcd1234',
          name: 'typescript, style',
          description: 'Always prefer const over let',
          frequency: 3,
          testable: false,
          sourceIds: ['L001', 'L002', 'L003'],
          created: '2026-01-01T00:00:00Z',
        };
        await writeFile(cctPath, JSON.stringify(pattern) + '\n', 'utf-8');

        // Mock embedText
        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

        const results = await searchVector(tempDir, 'const vs let', { limit: 10 });
        // Should include both the lesson and the CCT pattern
        const ids = results.map((r) => r.lesson.id);
        expect(ids).toContain('L001');
        expect(ids).toContain('CCT-abcd1234');
      });

      it('works when cct-patterns.jsonl does not exist', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
        await rebuildIndex(tempDir);

        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

        const results = await searchVector(tempDir, 'test', { limit: 10 });
        expect(results).toHaveLength(1);
        expect(results[0]!.lesson.id).toBe('L001');
      });

      it('caches CCT pattern embeddings across searches', async () => {
        // Write a CCT pattern file
        const cctPath = join(tempDir, CCT_PATTERNS_PATH);
        await mkdir(dirname(cctPath), { recursive: true });
        const pattern = {
          id: 'CCT-ca0e0001',
          name: 'caching test',
          description: 'verify CCT embedding cache works',
          frequency: 2,
          testable: false,
          sourceIds: ['L001'],
          created: '2026-01-01T00:00:00Z',
        };
        await writeFile(cctPath, JSON.stringify(pattern) + '\n', 'utf-8');

        const spy = vi.spyOn(await import('../embeddings/nomic.js'), 'embedText')
          .mockResolvedValue(new Float32Array([1, 0, 0]));

        // First search: query embed + CCT pattern embed = 2 calls
        await searchVector(tempDir, 'cache test', { limit: 10 });
        expect(spy).toHaveBeenCalledTimes(2);

        spy.mockClear();

        // Second search: query embed only, CCT pattern should be cached = 1 call
        await searchVector(tempDir, 'cache test again', { limit: 10 });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith('cache test again');
      });

      it('CCT patterns respect limit', async () => {
        // Write many CCT patterns
        const cctPath = join(tempDir, CCT_PATTERNS_PATH);
        await mkdir(dirname(cctPath), { recursive: true });
        const lines: string[] = [];
        for (let i = 0; i < 5; i++) {
          lines.push(JSON.stringify({
            id: `CCT-0000000${i}`,
            name: `pattern ${i}`,
            description: `pattern description ${i}`,
            frequency: 2,
            testable: false,
            sourceIds: [`L00${i}`],
            created: '2026-01-01T00:00:00Z',
          }));
        }
        await writeFile(cctPath, lines.join('\n') + '\n', 'utf-8');

        vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

        const results = await searchVector(tempDir, 'pattern', { limit: 3 });
        expect(results.length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('findSimilarLessons', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-similar-'));
    });

    afterEach(async () => {
      closeDb();
      clearCctEmbeddingCache();
      await rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it('returns empty when no items exist', async () => {
      const results = await findSimilarLessons(tempDir, 'some text');
      expect(results).toEqual([]);
    });

    it('returns empty when model unavailable', async () => {
      // Add a lesson so items exist
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);

      // Mock isModelAvailable to return false
      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(false);

      const results = await findSimilarLessons(tempDir, 'test query');
      expect(results).toEqual([]);
    });

    it('excludes specified excludeId', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'lesson alpha'));
      await appendLesson(tempDir, createQuickLesson('L002', 'lesson beta'));
      await rebuildIndex(tempDir);

      // Mock isModelAvailable and embedText
      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(true);
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

      const results = await findSimilarLessons(tempDir, 'lesson text', { excludeId: 'L001' });
      const ids = results.map((r) => r.item.id);
      expect(ids).not.toContain('L001');
      expect(ids).toContain('L002');
    });

    it('skips invalidated items', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'valid lesson'));
      await appendLesson(tempDir, {
        ...createQuickLesson('L002', 'invalidated lesson'),
        invalidatedAt: '2026-01-15T10:30:00.000Z',
        invalidationReason: 'outdated',
      });
      await rebuildIndex(tempDir);

      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(true);
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

      const results = await findSimilarLessons(tempDir, 'test query', { threshold: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]!.item.id).toBe('L001');
    });

    it('respects custom threshold', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'close match'));
      await appendLesson(tempDir, createQuickLesson('L002', 'distant match'));
      await rebuildIndex(tempDir);

      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(true);

      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(async (text: string) => {
        if (text === 'close match') return [0.99, 0.1, 0];
        if (text === 'distant match') return [0.5, 0.5, 0.5];
        // query
        return [1, 0, 0];
      });

      // High threshold: only very similar items
      const highResults = await findSimilarLessons(tempDir, 'test', { threshold: 0.95 });
      expect(highResults).toHaveLength(1);
      expect(highResults[0]!.item.id).toBe('L001');
    });

    it('results sorted by score descending', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'close match'));
      await appendLesson(tempDir, createQuickLesson('L002', 'exact match'));
      await appendLesson(tempDir, createQuickLesson('L003', 'distant match'));
      await rebuildIndex(tempDir);

      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(true);
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(
        async (text: string) => {
          if (text === 'exact match') return [1, 0, 0];
          if (text === 'close match') return [0.9, 0.1, 0];
          if (text === 'distant match') return [0.7, 0.3, 0];
          return [1, 0, 0]; // query
        }
      );

      const results = await findSimilarLessons(tempDir, 'query', { threshold: 0.5 });
      expect(results.length).toBeGreaterThan(1);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it('does NOT match lessons with same trigger but different insights', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'use Polars for data frames', { trigger: 'data processing' })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L002', 'never commit secrets to git', { trigger: 'data processing' })
      );
      await rebuildIndex(tempDir);

      vi.spyOn(await import('../embeddings/model.js'), 'isModelAvailable').mockReturnValue(true);
      vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(
        async (text: string) => {
          if (text.includes('Polars')) return [1, 0, 0];
          if (text.includes('secrets')) return [0, 1, 0]; // orthogonal
          return [1, 0, 0]; // query about data frames
        }
      );

      const results = await findSimilarLessons(tempDir, 'data frame processing', {
        threshold: 0.80,
      });

      const ids = results.map((r) => r.item.id);
      expect(ids).toContain('L001');
      expect(ids).not.toContain('L002');
    });

    // NOTE: Real-embedding tests for findSimilarLessons are omitted here because
    // this file runs in the unit (threads) pool. Loading the native ~400MB embedding
    // model in thread workers causes SIGABRT on cleanup. The mocked tests above
    // cover all logic paths. Real-model integration tests belong in
    // src/memory/embeddings/ where they run in the safe singleFork pool.
  });
});
