import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { getModelPath } from '../embeddings/download.js';
import { retrieveForPlan, formatLessonsCheck } from './plan.js';
import { appendLesson } from '../storage/jsonl.js';
import type { QuickLesson, FullLesson } from '../types.js';

// Check model availability synchronously at module load time
const modelAvailable = existsSync(getModelPath());

describe('plan retrieval', () => {
  let tempDir: string;

  const createQuickLesson = (id: string, insight: string, trigger: string): QuickLesson => ({
    id,
    type: 'quick',
    trigger,
    insight,
    tags: [],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  });

  const createFullLesson = (
    id: string,
    insight: string,
    severity: 'high' | 'medium' | 'low'
  ): FullLesson => ({
    id,
    type: 'full',
    trigger: `trigger for ${insight}`,
    insight,
    tags: [],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
    evidence: 'Test evidence',
    severity,
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-plan-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('retrieveForPlan', () => {
    it.skipIf(!modelAvailable)('returns empty array for empty database', async () => {
      const result = await retrieveForPlan(tempDir, 'implement user authentication');
      expect(result.lessons).toEqual([]);
    });

    it.skipIf(!modelAvailable)('returns relevant lessons based on plan text', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'Use JWT tokens for authentication', 'login feature')
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L002', 'Use Polars for data processing', 'data pipeline')
      );

      const result = await retrieveForPlan(tempDir, 'implement user authentication with JWT');
      expect(result.lessons.length).toBeGreaterThan(0);
      // The auth lesson should rank higher than the data one
      const authLesson = result.lessons.find((l) => l.lesson.insight.includes('JWT'));
      expect(authLesson).toBeDefined();
    });

    it.skipIf(!modelAvailable)('respects limit parameter', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Lesson 1', 'trigger 1'));
      await appendLesson(tempDir, createQuickLesson('L002', 'Lesson 2', 'trigger 2'));
      await appendLesson(tempDir, createQuickLesson('L003', 'Lesson 3', 'trigger 3'));
      await appendLesson(tempDir, createQuickLesson('L004', 'Lesson 4', 'trigger 4'));
      await appendLesson(tempDir, createQuickLesson('L005', 'Lesson 5', 'trigger 5'));

      const result = await retrieveForPlan(tempDir, 'some plan text', 3);
      expect(result.lessons.length).toBeLessThanOrEqual(3);
    });

    it.skipIf(!modelAvailable)('defaults to 5 lessons', async () => {
      // Create 7 lessons
      for (let i = 1; i <= 7; i++) {
        await appendLesson(tempDir, createQuickLesson(`L00${i}`, `Lesson ${i}`, `trigger ${i}`));
      }

      const result = await retrieveForPlan(tempDir, 'some plan text');
      expect(result.lessons.length).toBeLessThanOrEqual(5);
    });

    it.skipIf(!modelAvailable)('applies ranking boosts (high severity ranked higher)', async () => {
      await appendLesson(tempDir, createFullLesson('L001', 'Important security lesson', 'high'));
      await appendLesson(tempDir, createFullLesson('L002', 'Low priority security lesson', 'low'));

      const result = await retrieveForPlan(tempDir, 'implement security features');
      // High severity should get boost and rank first
      if (result.lessons.length >= 2) {
        const first = result.lessons[0];
        expect(first.lesson.insight).toContain('Important');
      }
    });

    it.skipIf(!modelAvailable)('includes Lessons Check message', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'Use secure headers', 'security implementation')
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
        { lesson: createQuickLesson('L001', 'Use JWT for auth', 'auth trigger'), score: 0.9 },
        { lesson: createQuickLesson('L002', 'Validate input always', 'security'), score: 0.8 },
      ];
      const message = formatLessonsCheck(lessons);
      expect(message).toContain('Lessons Check');
      expect(message).toContain('Use JWT for auth');
      expect(message).toContain('Validate input always');
    });
  });

  describe('error handling', () => {
    it.skipIf(modelAvailable)('throws if embeddings unavailable', async () => {
      await expect(retrieveForPlan(tempDir, 'some plan')).rejects.toThrow();
    });
  });
});
