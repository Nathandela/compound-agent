import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendLesson, readLessons, LESSONS_PATH } from './jsonl.js';
import type { QuickLesson, FullLesson, Lesson } from '../types.js';

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
    it('returns empty array for missing file', async () => {
      const lessons = await readLessons(tempDir);
      expect(lessons).toEqual([]);
    });

    it('reads single lesson', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test'));
      const lessons = await readLessons(tempDir);

      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.id).toBe('L001');
    });

    it('reads multiple lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second'));

      const lessons = await readLessons(tempDir);
      expect(lessons).toHaveLength(2);
    });

    it('filters out deleted lessons (tombstones)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const lessons = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.id).toBe('L001');
    });

    it('deduplicates by ID (last-write-wins)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'original'));
      await appendLesson(tempDir, createQuickLesson('L001', 'updated'));

      const lessons = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.insight).toBe('updated');
    });

    it('handles mixed quick and full lessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'quick'));
      await appendLesson(tempDir, createFullLesson('L002', 'full'));

      const lessons = await readLessons(tempDir);
      expect(lessons).toHaveLength(2);
      expect(lessons.find((l) => l.id === 'L001')?.type).toBe('quick');
      expect(lessons.find((l) => l.id === 'L002')?.type).toBe('full');
    });

    it('handles empty lines gracefully', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
      await writeFile(
        filePath,
        JSON.stringify(createQuickLesson('L001', 'test')) + '\n\n\n',
        'utf-8'
      );

      const lessons = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
    });
  });
});
