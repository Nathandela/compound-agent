import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { FullLesson, Lesson, QuickLesson } from '../types.js';

import { appendLesson, LESSONS_PATH, readLessons } from './jsonl.js';
import type { ReadLessonsResult } from './jsonl.js';

describe('JSONL storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const createQuickLesson = (id: string, insight: string): QuickLesson => ({
    id,
    type: 'quick',
    trigger: 'test trigger',
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
    trigger: 'test trigger',
    insight,
    evidence: 'test evidence',
    severity: 'medium',
    tags: ['test'],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  });

  describe('appendLesson', () => {
    it('creates directory structure if missing', async () => {
      const lesson = createQuickLesson('L001', 'test insight');
      await appendLesson(tempDir, lesson);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('L001');
    });

    it('appends lesson as single JSON line', async () => {
      const lesson = createQuickLesson('L001', 'test insight');
      await appendLesson(tempDir, lesson);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!);
      expect(parsed.id).toBe('L001');
      expect(parsed.type).toBe('quick');
    });

    it('appends multiple lessons on separate lines', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second'));
      await appendLesson(tempDir, createFullLesson('L003', 'third'));

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('appends tombstone records', async () => {
      const lesson = createQuickLesson('L001', 'to delete');
      await appendLesson(tempDir, lesson);
      await appendLesson(tempDir, { ...lesson, deleted: true });

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const tombstone = JSON.parse(lines[1]!);
      expect(tombstone.deleted).toBe(true);
    });
  });

  describe('readLessons', () => {
    it('returns empty result for missing file', async () => {
      const result = await readLessons(tempDir);
      expect(result.lessons).toEqual([]);
      expect(result.skippedCount).toBe(0);
    });

    it('reads single lesson', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test'));
      const result = await readLessons(tempDir);

      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
    });

    it('reads multiple lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second'));

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(2);
    });

    it('filters out deleted lessons (tombstones)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
    });

    it('deduplicates by ID (last-write-wins)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'original'));
      await appendLesson(tempDir, createQuickLesson('L001', 'updated'));

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.insight).toBe('updated');
    });

    it('handles mixed quick and full lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'quick'));
      await appendLesson(tempDir, createFullLesson('L002', 'full'));

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(2);
      expect(result.lessons.find((l) => l.id === 'L001')?.type).toBe('quick');
      expect(result.lessons.find((l) => l.id === 'L002')?.type).toBe('full');
    });

    it('handles empty lines gracefully', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
      await writeFile(
        filePath,
        JSON.stringify(createQuickLesson('L001', 'test')) + '\n\n\n',
        'utf-8'
      );

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
    });

    describe('error handling', () => {
      it('returns result object with lessons and skippedCount', async () => {
        await appendLesson(tempDir, createQuickLesson('L001', 'test'));
        const result = await readLessons(tempDir);

        // Result should be an object with lessons array and skippedCount
        expect(result).toHaveProperty('lessons');
        expect(result).toHaveProperty('skippedCount');
        expect((result as ReadLessonsResult).lessons).toHaveLength(1);
        expect((result as ReadLessonsResult).skippedCount).toBe(0);
      });

      it('skips invalid JSON and continues in non-strict mode', async () => {
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const validLesson = JSON.stringify(createQuickLesson('L001', 'valid'));
        const invalidJson = '{not valid json';
        const anotherValid = JSON.stringify(createQuickLesson('L002', 'also valid'));

        await writeFile(filePath, `${validLesson}\n${invalidJson}\n${anotherValid}\n`, 'utf-8');

        const result = await readLessons(tempDir) as ReadLessonsResult;

        expect(result.lessons).toHaveLength(2);
        expect(result.skippedCount).toBe(1);
      });

      it('skips schema validation failures in non-strict mode', async () => {
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const validLesson = JSON.stringify(createQuickLesson('L001', 'valid'));
        // Valid JSON but missing required fields
        const invalidSchema = JSON.stringify({ id: 'L002', type: 'unknown' });
        const anotherValid = JSON.stringify(createQuickLesson('L003', 'also valid'));

        await writeFile(filePath, `${validLesson}\n${invalidSchema}\n${anotherValid}\n`, 'utf-8');

        const result = await readLessons(tempDir) as ReadLessonsResult;

        expect(result.lessons).toHaveLength(2);
        expect(result.skippedCount).toBe(1);
      });

      it('calls logger for each skipped line in non-strict mode', async () => {
        const mockLogger = vi.fn();
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const validLesson = JSON.stringify(createQuickLesson('L001', 'valid'));
        const invalidJson = '{bad json';
        const invalidSchema = JSON.stringify({ id: 'L002' });

        await writeFile(filePath, `${validLesson}\n${invalidJson}\n${invalidSchema}\n`, 'utf-8');

        await readLessons(tempDir, { onParseError: mockLogger });

        expect(mockLogger).toHaveBeenCalledTimes(2);
        // Verify line numbers are included
        expect(mockLogger).toHaveBeenCalledWith(expect.objectContaining({ line: 2 }));
        expect(mockLogger).toHaveBeenCalledWith(expect.objectContaining({ line: 3 }));
      });

      it('throws on invalid JSON in strict mode', async () => {
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const validLesson = JSON.stringify(createQuickLesson('L001', 'valid'));
        const invalidJson = '{not valid json';

        await writeFile(filePath, `${validLesson}\n${invalidJson}\n`, 'utf-8');

        await expect(readLessons(tempDir, { strict: true })).rejects.toThrow(/line 2/i);
      });

      it('throws on schema validation failure in strict mode', async () => {
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const validLesson = JSON.stringify(createQuickLesson('L001', 'valid'));
        const invalidSchema = JSON.stringify({ id: 'L002', type: 'invalid' });

        await writeFile(filePath, `${validLesson}\n${invalidSchema}\n`, 'utf-8');

        await expect(readLessons(tempDir, { strict: true })).rejects.toThrow(/line 2/i);
      });

      it('includes correct line numbers in error messages', async () => {
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

        const line1 = JSON.stringify(createQuickLesson('L001', 'valid'));
        const line2 = JSON.stringify(createQuickLesson('L002', 'valid'));
        const line3 = '{bad json'; // Error on line 3

        await writeFile(filePath, `${line1}\n${line2}\n${line3}\n`, 'utf-8');

        await expect(readLessons(tempDir, { strict: true })).rejects.toThrow(/line 3/i);
      });
    });
  });
});
