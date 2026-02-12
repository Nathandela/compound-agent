import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createFullLesson, createPattern, createPreference, createQuickLesson, createSolution } from '../../test-utils.js';

import { appendLesson, appendMemoryItem, LESSONS_PATH, readLessons, readMemoryItems } from './jsonl.js';
import type { ReadLessonsResult, ReadMemoryItemsResult } from './jsonl.js';

describe('JSONL storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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
      expect(parsed.type).toBe('lesson');
    });

    it('appends multiple lessons on separate lines', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second'));
      await appendLesson(tempDir, createFullLesson('L003', 'third', 'medium'));

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('appends legacy tombstone records (full lesson + deleted:true)', async () => {
      const lesson = createQuickLesson('L001', 'to delete');
      await appendLesson(tempDir, lesson);
      await appendLesson(tempDir, { ...lesson, deleted: true });

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);

      const tombstone = JSON.parse(lines[1]!);
      expect(tombstone.deleted).toBe(true);
      // Legacy format includes all lesson fields
      expect(tombstone.insight).toBe('to delete');
    });
  });

  describe('delete via appendLesson with deleted flag', () => {
    it('appends lesson with deleted:true and deletedAt', async () => {
      const lesson = createQuickLesson('L001', 'to delete');
      await appendLesson(tempDir, { ...lesson, deleted: true, deletedAt: '2026-01-30T12:00:00Z' });

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!);
      expect(parsed.id).toBe('L001');
      expect(parsed.deleted).toBe(true);
      expect(parsed.deletedAt).toBe('2026-01-30T12:00:00Z');
      // Full record includes all lesson fields
      expect(parsed.insight).toBe('to delete');
    });

    it('deleted lesson is excluded from readLessons', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep me'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));

      const lessonToDelete = createQuickLesson('L002', 'delete me');
      await appendLesson(tempDir, { ...lessonToDelete, deleted: true, deletedAt: new Date().toISOString() });

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
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

    it('filters out deleted lessons (legacy tombstones)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
    });

    it('filters out deleted lessons (full record with deleted flag)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      // Full record deletion
      const toDelete = createQuickLesson('L002', 'delete me');
      await appendLesson(tempDir, { ...toDelete, deleted: true, deletedAt: new Date().toISOString() });

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
    });

    it('handles mixed old and new deletion formats', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'old delete'));
      await appendLesson(tempDir, createQuickLesson('L003', 'new delete'));

      // Old format: lesson with deleted:true (no deletedAt)
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'old delete'), deleted: true });
      // New format: full record with deleted + deletedAt
      const toDelete = createQuickLesson('L003', 'new delete');
      await appendLesson(tempDir, { ...toDelete, deleted: true, deletedAt: new Date().toISOString() });

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
      await appendLesson(tempDir, createFullLesson('L002', 'full', 'medium'));

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(2);
      expect(result.lessons.find((l) => l.id === 'L001')?.type).toBe('lesson');
      expect(result.lessons.find((l) => l.id === 'L002')?.type).toBe('lesson');
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

      it('rethrows non-ENOENT errors from readFile', async () => {
        // Create a directory where the file should be - reading a directory throws EISDIR
        const filePath = join(tempDir, LESSONS_PATH);
        await mkdir(filePath, { recursive: true }); // Create lessons path as directory

        await expect(readLessons(tempDir)).rejects.toThrow();
      });
    });
  });

  // =========================================================================
  // Unified Memory Item API (readMemoryItems / appendMemoryItem)
  // =========================================================================

  describe('appendMemoryItem', () => {
    it('appends a solution item as a single JSON line', async () => {
      const solution = createSolution('S001', 'use pnpm');
      await appendMemoryItem(tempDir, solution);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!);
      expect(parsed.id).toBe('S001');
      expect(parsed.type).toBe('solution');
    });

    it('appends a pattern item with required pattern field', async () => {
      const pattern = createPattern('P001', 'use const', 'let x = 1', 'const x = 1');
      await appendMemoryItem(tempDir, pattern);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('pattern');
      expect(parsed.pattern).toEqual({ bad: 'let x = 1', good: 'const x = 1' });
    });

    it('appends a preference item', async () => {
      const pref = createPreference('R001', 'always use dark mode');
      await appendMemoryItem(tempDir, pref);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('preference');
      expect(parsed.insight).toBe('always use dark mode');
    });

    it('appends a lesson item (backward compat)', async () => {
      const lesson = createQuickLesson('L001', 'test insight');
      await appendMemoryItem(tempDir, lesson);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.type).toBe('lesson');
      expect(parsed.id).toBe('L001');
    });

    it('creates directory structure if missing', async () => {
      const solution = createSolution('S001', 'test');
      await appendMemoryItem(tempDir, solution);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('S001');
    });

    it('appends multiple items of different types on separate lines', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'lesson'));
      await appendMemoryItem(tempDir, createSolution('S001', 'solution'));
      await appendMemoryItem(tempDir, createPattern('P001', 'pattern', 'bad', 'good'));
      await appendMemoryItem(tempDir, createPreference('R001', 'preference'));

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(4);
    });

    it('appends deleted memory item with deleted flag', async () => {
      const solution = createSolution('S001', 'to delete');
      await appendMemoryItem(tempDir, { ...solution, deleted: true, deletedAt: '2026-01-30T12:00:00Z' });

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content.trim());
      expect(parsed.deleted).toBe(true);
      expect(parsed.deletedAt).toBe('2026-01-30T12:00:00Z');
    });
  });

  describe('readMemoryItems', () => {
    it('returns empty result for missing file', async () => {
      const result = await readMemoryItems(tempDir);
      expect(result.items).toEqual([]);
      expect(result.skippedCount).toBe(0);
    });

    it('reads a single lesson item', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'test'));
      const result = await readMemoryItems(tempDir);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('L001');
      expect(result.items[0]!.type).toBe('lesson');
    });

    it('reads a single solution item', async () => {
      await appendMemoryItem(tempDir, createSolution('S001', 'use pnpm'));
      const result = await readMemoryItems(tempDir);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('S001');
      expect(result.items[0]!.type).toBe('solution');
    });

    it('reads a single pattern item', async () => {
      await appendMemoryItem(tempDir, createPattern('P001', 'use const', 'let x', 'const x'));
      const result = await readMemoryItems(tempDir);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('P001');
      expect(result.items[0]!.type).toBe('pattern');
    });

    it('reads a single preference item', async () => {
      await appendMemoryItem(tempDir, createPreference('R001', 'dark mode'));
      const result = await readMemoryItems(tempDir);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('R001');
      expect(result.items[0]!.type).toBe('preference');
    });

    it('reads mixed memory item types', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'lesson'));
      await appendMemoryItem(tempDir, createSolution('S001', 'solution'));
      await appendMemoryItem(tempDir, createPattern('P001', 'pattern', 'bad', 'good'));
      await appendMemoryItem(tempDir, createPreference('R001', 'preference'));

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(4);

      const types = result.items.map((i) => i.type);
      expect(types).toContain('lesson');
      expect(types).toContain('solution');
      expect(types).toContain('pattern');
      expect(types).toContain('preference');
    });

    it('deduplicates by ID (last-write-wins)', async () => {
      await appendMemoryItem(tempDir, createSolution('S001', 'original'));
      await appendMemoryItem(tempDir, createSolution('S001', 'updated'));

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.insight).toBe('updated');
    });

    it('filters out deleted items', async () => {
      await appendMemoryItem(tempDir, createSolution('S001', 'keep'));
      await appendMemoryItem(tempDir, createSolution('S002', 'delete me'));
      await appendMemoryItem(tempDir, { ...createSolution('S002', 'delete me'), deleted: true, deletedAt: new Date().toISOString() });

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('S001');
    });

    it('filters out deleted items across types', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'keep'));
      await appendMemoryItem(tempDir, createPattern('P001', 'delete me', 'bad', 'good'));
      await appendMemoryItem(tempDir, { ...createPattern('P001', 'delete me', 'bad', 'good'), deleted: true, deletedAt: new Date().toISOString() });

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('L001');
    });

    it('converts legacy type:quick records to type:lesson', async () => {
      // Manually write a legacy record with type 'quick'
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const legacyRecord = {
        id: 'L001',
        type: 'quick',
        trigger: 'trigger',
        insight: 'legacy insight',
        tags: [],
        source: 'manual',
        context: { tool: 'test', intent: 'testing' },
        created: new Date().toISOString(),
        confirmed: true,
        supersedes: [],
        related: [],
      };
      await writeFile(filePath, JSON.stringify(legacyRecord) + '\n', 'utf-8');

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.type).toBe('lesson');
      expect(result.items[0]!.insight).toBe('legacy insight');
    });

    it('converts legacy type:full records to type:lesson', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const legacyRecord = {
        id: 'L001',
        type: 'full',
        trigger: 'trigger',
        insight: 'full legacy insight',
        evidence: 'some evidence',
        severity: 'high',
        tags: [],
        source: 'manual',
        context: { tool: 'test', intent: 'testing' },
        created: new Date().toISOString(),
        confirmed: true,
        supersedes: [],
        related: [],
      };
      await writeFile(filePath, JSON.stringify(legacyRecord) + '\n', 'utf-8');

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.type).toBe('lesson');
      expect(result.items[0]!.insight).toBe('full legacy insight');
    });

    it('handles mixed legacy and new format records', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const legacyQuick = {
        id: 'L001', type: 'quick', trigger: 't', insight: 'legacy',
        tags: [], source: 'manual', context: { tool: 'test', intent: 'testing' },
        created: new Date().toISOString(), confirmed: true, supersedes: [], related: [],
      };
      const newSolution = createSolution('S001', 'new solution');
      const newPattern = createPattern('P001', 'new pattern', 'bad', 'good');

      await writeFile(filePath, [
        JSON.stringify(legacyQuick),
        JSON.stringify(newSolution),
        JSON.stringify(newPattern),
      ].join('\n') + '\n', 'utf-8');

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(3);

      // Legacy record should be converted
      const lesson = result.items.find((i) => i.id === 'L001');
      expect(lesson?.type).toBe('lesson');

      // New format records should be preserved
      const sol = result.items.find((i) => i.id === 'S001');
      expect(sol?.type).toBe('solution');

      const pat = result.items.find((i) => i.id === 'P001');
      expect(pat?.type).toBe('pattern');
    });

    it('handles legacy tombstone deletion of legacy records', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const legacyQuick = {
        id: 'L001', type: 'quick', trigger: 't', insight: 'to delete',
        tags: [], source: 'manual', context: { tool: 'test', intent: 'testing' },
        created: new Date().toISOString(), confirmed: true, supersedes: [], related: [],
      };
      // Legacy tombstone: full record with deleted:true
      const tombstone = { ...legacyQuick, deleted: true };

      await writeFile(filePath, [
        JSON.stringify(legacyQuick),
        JSON.stringify(tombstone),
      ].join('\n') + '\n', 'utf-8');

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(0);
    });

    it('result has items and skippedCount fields', async () => {
      await appendMemoryItem(tempDir, createSolution('S001', 'test'));
      const result = await readMemoryItems(tempDir);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('skippedCount');
      expect((result as ReadMemoryItemsResult).items).toHaveLength(1);
      expect((result as ReadMemoryItemsResult).skippedCount).toBe(0);
    });

    it('skips invalid JSON and continues in non-strict mode', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const validItem = JSON.stringify(createSolution('S001', 'valid'));
      const invalidJson = '{not valid json';
      const anotherValid = JSON.stringify(createPreference('R001', 'also valid'));

      await writeFile(filePath, `${validItem}\n${invalidJson}\n${anotherValid}\n`, 'utf-8');

      const result = await readMemoryItems(tempDir) as ReadMemoryItemsResult;
      expect(result.items).toHaveLength(2);
      expect(result.skippedCount).toBe(1);
    });

    it('throws on invalid JSON in strict mode', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const validItem = JSON.stringify(createSolution('S001', 'valid'));
      const invalidJson = '{not valid json';

      await writeFile(filePath, `${validItem}\n${invalidJson}\n`, 'utf-8');

      await expect(readMemoryItems(tempDir, { strict: true })).rejects.toThrow(/line 2/i);
    });

    it('calls onParseError for skipped lines', async () => {
      const mockLogger = vi.fn();
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const validItem = JSON.stringify(createSolution('S001', 'valid'));
      const invalidJson = '{bad json';

      await writeFile(filePath, `${validItem}\n${invalidJson}\n`, 'utf-8');

      await readMemoryItems(tempDir, { onParseError: mockLogger });
      expect(mockLogger).toHaveBeenCalledTimes(1);
      expect(mockLogger).toHaveBeenCalledWith(expect.objectContaining({ line: 2 }));
    });

    it('handles empty lines gracefully', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
      await writeFile(
        filePath,
        JSON.stringify(createSolution('S001', 'test')) + '\n\n\n',
        'utf-8'
      );

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
    });

    it('rethrows non-ENOENT errors from readFile', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(filePath, { recursive: true });

      await expect(readMemoryItems(tempDir)).rejects.toThrow();
    });
  });

  describe('backward compatibility: appendLesson wraps appendMemoryItem', () => {
    it('appendLesson items are readable by readMemoryItems', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'via appendLesson'));

      const result = await readMemoryItems(tempDir);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('L001');
      expect(result.items[0]!.type).toBe('lesson');
    });

    it('appendMemoryItem items are readable by readLessons (lesson type only)', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'via appendMemoryItem'));

      const result = await readLessons(tempDir);
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
    });

    it('readLessons only returns lesson-type items from mixed file', async () => {
      await appendMemoryItem(tempDir, createQuickLesson('L001', 'a lesson'));
      await appendMemoryItem(tempDir, createSolution('S001', 'a solution'));
      await appendMemoryItem(tempDir, createPattern('P001', 'a pattern', 'bad', 'good'));
      await appendMemoryItem(tempDir, createPreference('R001', 'a preference'));

      const result = await readLessons(tempDir);
      // readLessons should only return lesson-type items
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0]!.id).toBe('L001');
      expect(result.lessons[0]!.type).toBe('lesson');
    });
  });
});
