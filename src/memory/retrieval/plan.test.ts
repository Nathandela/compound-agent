import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isModelAvailable } from '../embeddings/index.js';
import { appendLesson } from '../storage/jsonl.js';
import { closeDb, getRetrievalStats, rebuildIndex } from '../storage/sqlite/index.js';
import { createFullLesson, createQuickLesson, shouldSkipEmbeddingTests } from '../../test-utils.js';

import { formatLessonsCheck, retrieveForPlan } from './plan.js';

// SAFETY: Never call isModelUsable() at module top-level — causes ~400MB native memory leak.
const modelAvailable = isModelAvailable();
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);

describe('plan retrieval', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-plan-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('retrieveForPlan', { timeout: 10_000 }, () => {
    it.skipIf(skipEmbedding)('returns empty array for empty database', async () => {
      const result = await retrieveForPlan(tempDir, 'implement user authentication');
      expect(result.lessons).toEqual([]);
    });

    it.skipIf(skipEmbedding)('returns relevant lessons based on plan text', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'Use JWT tokens for authentication', { trigger: 'login feature' })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L002', 'Use Polars for data processing', { trigger: 'data pipeline' })
      );

      const result = await retrieveForPlan(tempDir, 'implement user authentication with JWT');
      expect(result.lessons.length).toBeGreaterThan(0);
      // The auth lesson should rank higher than the data one
      const authLesson = result.lessons.find((l) => l.lesson.insight.includes('JWT'));
      expect(authLesson).toBeDefined();
    });

    it.skipIf(skipEmbedding)('respects limit parameter', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Lesson 1', { trigger: 'trigger 1' }));
      await appendLesson(tempDir, createQuickLesson('L002', 'Lesson 2', { trigger: 'trigger 2' }));
      await appendLesson(tempDir, createQuickLesson('L003', 'Lesson 3', { trigger: 'trigger 3' }));
      await appendLesson(tempDir, createQuickLesson('L004', 'Lesson 4', { trigger: 'trigger 4' }));
      await appendLesson(tempDir, createQuickLesson('L005', 'Lesson 5', { trigger: 'trigger 5' }));

      const result = await retrieveForPlan(tempDir, 'some plan text', 3);
      expect(result.lessons.length).toBeLessThanOrEqual(3);
    });

    it.skipIf(skipEmbedding)('defaults to 5 lessons', async () => {
      // Create 7 lessons
      for (let i = 1; i <= 7; i++) {
        await appendLesson(tempDir, createQuickLesson(`L00${i}`, `Lesson ${i}`, { trigger: `trigger ${i}` }));
      }

      const result = await retrieveForPlan(tempDir, 'some plan text');
      expect(result.lessons.length).toBeLessThanOrEqual(5);
    });

    it.skipIf(skipEmbedding)('applies ranking boosts (high severity ranked higher)', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Important security lesson', 'high'));
      await appendLesson(tempDir, createFullLesson('L002', 'Low priority security lesson', 'low'));

      const result = await retrieveForPlan(tempDir, 'implement security features');
      // High severity should get boost and rank first
      if (result.lessons.length >= 2) {
        const first = result.lessons[0];
        expect(first.lesson.insight).toContain('Important');
      }
    });

    it.skipIf(skipEmbedding)('includes Lessons Check message', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'Use secure headers', { trigger: 'security implementation' })
      );

      const result = await retrieveForPlan(tempDir, 'implement security middleware');
      expect(result.message).toBeDefined();
      expect(result.message).toContain('Lessons Check');
    });
  });

  describe('formatLessonsCheck', () => {
    it('formats empty lessons array', () => {
      const message = formatLessonsCheck([]);
      expect(message).toContain('Lessons Check');
      expect(message).toContain('No relevant lessons');
    });

    it('formats lessons with insights', () => {
      const lessons = [
        { lesson: createQuickLesson('L001', 'Use JWT for auth', { trigger: 'auth trigger' }), score: 0.9 },
        { lesson: createQuickLesson('L002', 'Validate input always', { trigger: 'security' }), score: 0.8 },
      ];
      const message = formatLessonsCheck(lessons);
      expect(message).toContain('Lessons Check');
      expect(message).toContain('Use JWT for auth');
      expect(message).toContain('Validate input always');
    });
  });

  describe('error handling', () => {
    it.skipIf(skipEmbedding)('returns empty results when no lessons exist', async () => {
      const result = await retrieveForPlan(tempDir, 'some plan');
      expect(result.lessons).toEqual([]);
      expect(result.message).toContain('No relevant lessons');
    });

    it('increments retrieval counts for surfaced ranked lessons', async () => {
      const lesson1 = createFullLesson('L001', 'Authentication with JWT', 'high');
      const lesson2 = createQuickLesson('L002', 'Use Polars for large files');
      await appendLesson(tempDir, lesson1);
      await appendLesson(tempDir, lesson2);
      await rebuildIndex(tempDir);
      closeDb();

      const searchModule = await import('../search/index.js');
      vi.spyOn(searchModule, 'searchVector').mockResolvedValue([
        { lesson: lesson1, score: 0.8 },
        { lesson: lesson2, score: 0.7 },
      ]);

      const result = await retrieveForPlan(tempDir, 'implement auth middleware', 1);
      expect(result.lessons).toHaveLength(1);

      const stats = getRetrievalStats(tempDir);
      expect(stats.find((s) => s.id === result.lessons[0]!.lesson.id)?.count).toBe(1);
      expect(stats.find((s) => s.id !== result.lessons[0]!.lesson.id)?.count).toBe(0);
    });
  });

  describe('embedding fallback to keyword-only search', () => {
    it('falls back to keyword-only results when searchVector throws', async () => {
      const lesson = createQuickLesson('L001', 'Use JWT for authentication', { trigger: 'login auth' });
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);
      closeDb();

      const searchModule = await import('../search/index.js');
      vi.spyOn(searchModule, 'searchVector').mockRejectedValue(
        new Error('Embedding model not available')
      );

      // Should NOT throw - should fall back to keyword search
      const result = await retrieveForPlan(tempDir, 'authentication JWT login');
      expect(result).toBeDefined();
      expect(result.lessons).toBeDefined();
      expect(result.message).toContain('Lessons Check');
    });

    it('returns keyword results when embedding is unavailable', async () => {
      const lesson = createQuickLesson('L001', 'Always validate user input', { trigger: 'validation security' });
      await appendLesson(tempDir, lesson);
      await rebuildIndex(tempDir);
      closeDb();

      const searchModule = await import('../search/index.js');
      vi.spyOn(searchModule, 'searchVector').mockRejectedValue(
        new Error('Embedding model not available')
      );

      const result = await retrieveForPlan(tempDir, 'validate input');
      expect(result.lessons.length).toBeGreaterThan(0);
      expect(result.lessons[0]!.lesson.insight).toBe('Always validate user input');
    });

    it('ranks keyword-only fallback results with boost factors', async () => {
      const highLesson = createFullLesson('L001', 'Critical security validation rule', 'high', {
        trigger: 'security validation',
      });
      const lowLesson = createFullLesson('L002', 'Minor security validation tip', 'low', {
        trigger: 'security validation',
      });
      await appendLesson(tempDir, highLesson);
      await appendLesson(tempDir, lowLesson);
      await rebuildIndex(tempDir);
      closeDb();

      const searchModule = await import('../search/index.js');
      vi.spyOn(searchModule, 'searchVector').mockRejectedValue(
        new Error('Embedding model not available')
      );

      const result = await retrieveForPlan(tempDir, 'security validation');
      expect(result.lessons.length).toBe(2);
      // High severity should rank first due to boost
      expect(result.lessons[0]!.lesson.insight).toContain('Critical');
    });

    it('logs a warning when falling back to keyword-only search', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test insight', { trigger: 'test trigger' }));
      await rebuildIndex(tempDir);
      closeDb();

      const searchModule = await import('../search/index.js');
      vi.spyOn(searchModule, 'searchVector').mockRejectedValue(
        new Error('Embedding model not available')
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await retrieveForPlan(tempDir, 'test trigger');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[compound-agent]')
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('keyword-only')
      );
    });
  });
});
