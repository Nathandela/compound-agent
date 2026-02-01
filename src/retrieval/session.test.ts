import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import { createFullLesson, createQuickLesson } from '../test-utils.js';

import { loadSessionLessons } from './session.js';

describe('session retrieval', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-session-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadSessionLessons', () => {
    it('returns empty array for empty database', async () => {
      const lessons = await loadSessionLessons(tempDir);
      expect(lessons).toEqual([]);
    });

    it('returns only high-severity lessons', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'High severity', 'high'));
      await appendLesson(tempDir, createFullLesson('L002', 'Medium severity', 'medium'));
      await appendLesson(tempDir, createFullLesson('L003', 'Low severity', 'low'));

      const lessons = await loadSessionLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0].insight).toBe('High severity');
    });

    it('returns only confirmed lessons', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Confirmed high', 'high'));
      await appendLesson(tempDir, createFullLesson('L002', 'Unconfirmed high', 'high', { confirmed: false }));

      const lessons = await loadSessionLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0].insight).toBe('Confirmed high');
    });

    it('excludes quick lessons', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Full high', 'high'));
      await appendLesson(tempDir, createQuickLesson('L002', 'Quick lesson'));

      const lessons = await loadSessionLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0].insight).toBe('Full high');
    });

    it('sorts by recency (most recent first)', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Old lesson', 'high', { created: 10 }));
      await appendLesson(tempDir, createFullLesson('L002', 'Recent lesson', 'high', { created: 1 }));
      await appendLesson(tempDir, createFullLesson('L003', 'Middle lesson', 'high', { created: 5 }));

      const lessons = await loadSessionLessons(tempDir);
      expect(lessons.map((l) => l.insight)).toEqual([
        'Recent lesson',
        'Middle lesson',
        'Old lesson',
      ]);
    });

    it('respects limit parameter', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Lesson 1', 'high', { created: 1 }));
      await appendLesson(tempDir, createFullLesson('L002', 'Lesson 2', 'high', { created: 2 }));
      await appendLesson(tempDir, createFullLesson('L003', 'Lesson 3', 'high', { created: 3 }));
      await appendLesson(tempDir, createFullLesson('L004', 'Lesson 4', 'high', { created: 4 }));
      await appendLesson(tempDir, createFullLesson('L005', 'Lesson 5', 'high', { created: 5 }));

      const lessons = await loadSessionLessons(tempDir, 3);
      expect(lessons).toHaveLength(3);
    });

    it('defaults to 5 lessons', async () => {
      // Create 7 lessons
      for (let i = 1; i <= 7; i++) {
        await appendLesson(tempDir, createFullLesson(`L00${i}`, `Lesson ${i}`, 'high', { created: i }));
      }

      const lessons = await loadSessionLessons(tempDir);
      expect(lessons).toHaveLength(5);
    });

    it('returns lessons for token budget estimation', async () => {
      const longInsight = 'This is a longer insight that takes more tokens '.repeat(10);
      await appendLesson(tempDir, createFullLesson('L001', longInsight, 'high'));

      const lessons = await loadSessionLessons(tempDir);
      // Should return the lesson - actual token filtering is done by caller
      expect(lessons).toHaveLength(1);
    });

    describe('filters invalidated lessons', () => {
      it('excludes lessons with invalidatedAt set', async () => {
        // Create a valid high-severity lesson
        await appendLesson(tempDir, createFullLesson('L001', 'valid lesson', 'high'));
        // Create an invalidated high-severity lesson
        await appendLesson(tempDir, {
          ...createFullLesson('L002', 'invalidated lesson', 'high'),
          invalidatedAt: '2026-01-15T10:30:00.000Z',
          invalidationReason: 'This approach was wrong',
        });

        const lessons = await loadSessionLessons(tempDir);
        expect(lessons).toHaveLength(1);
        expect(lessons[0]!.id).toBe('L001');
      });

      it('returns empty when all high-severity lessons are invalidated', async () => {
        await appendLesson(tempDir, {
          ...createFullLesson('L001', 'invalidated one', 'high'),
          invalidatedAt: '2026-01-15T10:30:00.000Z',
        });
        await appendLesson(tempDir, {
          ...createFullLesson('L002', 'invalidated two', 'high'),
          invalidatedAt: '2026-01-16T10:30:00.000Z',
        });

        const lessons = await loadSessionLessons(tempDir);
        expect(lessons).toEqual([]);
      });

      it('filters invalidated from sorted results', async () => {
        // Create lessons with different dates
        await appendLesson(tempDir, createFullLesson('L001', 'oldest valid', 'high', { created: 10 }));
        await appendLesson(tempDir, {
          ...createFullLesson('L002', 'invalidated recent', 'high', { created: 1 }),
          invalidatedAt: '2026-01-15T10:30:00.000Z',
        });
        await appendLesson(tempDir, createFullLesson('L003', 'newest valid', 'high', { created: 5 }));

        const lessons = await loadSessionLessons(tempDir);
        expect(lessons).toHaveLength(2);
        // Should be sorted by recency, without the invalidated lesson
        expect(lessons.map((l) => l.insight)).toEqual(['newest valid', 'oldest valid']);
      });
    });
  });
});
