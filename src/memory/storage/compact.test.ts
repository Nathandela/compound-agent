/**
 * Tests for compaction (tombstone removal and JSONL rewrite)
 *
 * Invariants tested:
 * - Active lessons remain in index.jsonl
 * - Tombstones are correctly applied
 * - TOCTOU safety: compact reads file once, produces consistent results
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryItem } from '../types.js';

import {
  compact,
  countTombstones,
  needsCompaction,
  TOMBSTONE_THRESHOLD,
} from './compact.js';
import { appendLesson, LESSONS_PATH, readLessons } from './jsonl.js';

/**
 * Spy on node:fs/promises readFile to count how many times
 * the JSONL file is read during compact(). The mock is transparent:
 * it delegates to the real readFile implementation.
 */
const { readFileSpy } = vi.hoisted(() => ({
  readFileSpy: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...mod,
    readFile: async (...args: unknown[]) => {
      readFileSpy(args[0]);
      return (mod.readFile as (...a: unknown[]) => Promise<string>)(...args);
    },
  };
});

describe('Compaction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-compact-'));
    readFileSpy.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a test lesson with optional date
   */
  const createLesson = (
    id: string,
    insight: string,
    options: { created?: string; retrievalCount?: number } = {}
  ): MemoryItem => ({
    id,
    type: 'lesson',
    trigger: `trigger for ${insight}`,
    insight,
    tags: ['test'],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: options.created ?? new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
    retrievalCount: options.retrievalCount,
  });

  describe('countTombstones', () => {
    it('returns 0 for file with no tombstones', async () => {
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'second'));

      const count = await countTombstones(tempDir);
      expect(count).toBe(0);
    });

    it('counts tombstones correctly', async () => {
      // Add lessons
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'second'));
      // Delete one (creates tombstone)
      await appendLesson(tempDir, { ...createLesson('L001', 'first'), deleted: true });

      const count = await countTombstones(tempDir);
      expect(count).toBe(1);
    });

    it('returns 0 for missing file', async () => {
      const count = await countTombstones(tempDir);
      expect(count).toBe(0);
    });

    it('counts multiple tombstones', async () => {
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'second'));
      await appendLesson(tempDir, createLesson('L003', 'third'));
      // Delete two
      await appendLesson(tempDir, { ...createLesson('L001', 'first'), deleted: true });
      await appendLesson(tempDir, { ...createLesson('L002', 'second'), deleted: true });

      const count = await countTombstones(tempDir);
      expect(count).toBe(2);
    });

    it('skips invalid JSON lines when counting', async () => {
      // Write file with mix of valid lessons and invalid JSON
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const valid1 = JSON.stringify(createLesson('L001', 'valid'));
      const invalidJson = '{not valid json at all';
      const tombstone = JSON.stringify({ ...createLesson('L002', 'deleted'), deleted: true });

      await writeFile(filePath, `${valid1}\n${invalidJson}\n${tombstone}\n`, 'utf-8');

      // Should only count valid tombstones, skipping invalid JSON
      const count = await countTombstones(tempDir);
      expect(count).toBe(1);
    });
  });

  describe('needsCompaction', () => {
    it('returns false when below threshold', async () => {
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, { ...createLesson('L001', 'first'), deleted: true });

      const needs = await needsCompaction(tempDir);
      expect(needs).toBe(false);
    });

    it('returns true when at or above threshold', async () => {
      // Create enough tombstones to hit threshold
      for (let i = 0; i < TOMBSTONE_THRESHOLD; i++) {
        const lesson = createLesson(`L${i.toString().padStart(3, '0')}`, `lesson ${i}`);
        await appendLesson(tempDir, lesson);
        await appendLesson(tempDir, { ...lesson, deleted: true });
      }

      const needs = await needsCompaction(tempDir);
      expect(needs).toBe(true);
    });
  });

  describe('compact', () => {
    it('removes tombstones and keeps active lessons', async () => {
      // Add lessons
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'deleted'));
      await appendLesson(tempDir, { ...createLesson('L002', 'deleted'), deleted: true });
      await appendLesson(tempDir, createLesson('L003', 'keep'));

      const result = await compact(tempDir);

      expect(result.archived).toBe(0);
      expect(result.tombstonesRemoved).toBeGreaterThanOrEqual(1);

      // L001 and L003 should remain
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(2);
      expect(lessons.map((l) => l.id).sort()).toEqual(['L001', 'L003']);
    });

    it('keeps old lessons without archiving them', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      await appendLesson(tempDir, createLesson('L001', 'old', { created: oldDate.toISOString() }));
      await appendLesson(tempDir, createLesson('L002', 'keep'));

      const result = await compact(tempDir);

      // No archiving -- old lessons stay in the main file
      expect(result.archived).toBe(0);
      expect(result.lessonsRemaining).toBe(2);

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(2);
    });

    it('returns stats about compaction', async () => {
      await appendLesson(tempDir, createLesson('L001', 'keep1'));
      await appendLesson(tempDir, createLesson('L002', 'keep2'));

      const result = await compact(tempDir);

      expect(result).toHaveProperty('archived');
      expect(result).toHaveProperty('tombstonesRemoved');
      expect(result).toHaveProperty('lessonsRemaining');
      expect(result.lessonsRemaining).toBe(2);
    });

    it('is idempotent', async () => {
      await appendLesson(tempDir, createLesson('L001', 'keep1'));
      await appendLesson(tempDir, createLesson('L002', 'keep2'));

      const result1 = await compact(tempDir);
      const result2 = await compact(tempDir);

      // Second run should be no-op
      expect(result2.archived).toBe(0);
      expect(result2.tombstonesRemoved).toBe(0);
      expect(result2.lessonsRemaining).toBe(result1.lessonsRemaining);
    });

    it('handles empty file', async () => {
      const result = await compact(tempDir);

      expect(result.archived).toBe(0);
      expect(result.tombstonesRemoved).toBe(0);
      expect(result.lessonsRemaining).toBe(0);
    });

    it('tracks count of invalid records dropped during compaction', async () => {
      // Write a JSONL file with mix of valid and invalid-schema records
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });

      const validLesson = createLesson('L001', 'valid lesson');
      // Invalid: missing required fields like insight, type, etc.
      const invalidRecord = { id: 'L002', foo: 'bar' };
      // Another invalid: has id but not valid MemoryItem schema
      const invalidRecord2 = { id: 'L003', type: 'unknown_type', insight: 'nope' };

      await writeFile(
        filePath,
        [JSON.stringify(validLesson), JSON.stringify(invalidRecord), JSON.stringify(invalidRecord2)].join('\n') + '\n',
        'utf-8'
      );

      const result = await compact(tempDir);

      expect(result.droppedInvalid).toBe(2);
      expect(result.lessonsRemaining).toBe(1);
    });

    it('returns droppedInvalid of 0 when all records are valid', async () => {
      await appendLesson(tempDir, createLesson('L001', 'valid1'));
      await appendLesson(tempDir, createLesson('L002', 'valid2'));

      const result = await compact(tempDir);

      expect(result.droppedInvalid).toBe(0);
    });
  });

  describe('TOCTOU safety', () => {
    it('compact reads the JSONL file at most once', async () => {
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'keep'));
      await appendLesson(tempDir, createLesson('L003', 'deleted'));
      await appendLesson(tempDir, { ...createLesson('L003', 'deleted'), deleted: true });

      const jsonlPath = join(tempDir, LESSONS_PATH);
      readFileSpy.mockClear();

      await compact(tempDir);

      const jsonlReads = readFileSpy.mock.calls.filter(
        ([path]: [unknown]) => String(path) === jsonlPath
      );

      expect(jsonlReads).toHaveLength(1);
    });

    it('returns exact counts for known input', async () => {
      // 4 active lessons (no archiving)
      await appendLesson(tempDir, createLesson('L001', 'lesson1'));
      await appendLesson(tempDir, createLesson('L002', 'lesson2'));
      await appendLesson(tempDir, createLesson('L003', 'active1'));
      await appendLesson(tempDir, createLesson('L004', 'active2'));
      // 1 deleted (creates 1 tombstone)
      await appendLesson(tempDir, createLesson('L005', 'todelete'));
      await appendLesson(tempDir, { ...createLesson('L005', 'todelete'), deleted: true });

      const result = await compact(tempDir);

      expect(result.archived).toBe(0);
      expect(result.tombstonesRemoved).toBe(1);
      expect(result.lessonsRemaining).toBe(4);
    });

    it('maintains data invariant: remaining = total non-deleted unique lessons', async () => {
      await appendLesson(tempDir, createLesson('L001', 'keep1'));
      await appendLesson(tempDir, createLesson('L002', 'keep2'));
      await appendLesson(tempDir, createLesson('L003', 'willdelete'));
      await appendLesson(tempDir, { ...createLesson('L003', 'willdelete'), deleted: true });

      const result = await compact(tempDir);

      // L001 + L002 = 2 total non-deleted unique lessons
      expect(result.lessonsRemaining).toBe(2);

      // File contains exactly lessonsRemaining lessons
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(result.lessonsRemaining);

      // No tombstones remain after compact
      const tombstones = await countTombstones(tempDir);
      expect(tombstones).toBe(0);
    });
  });
});
