/**
 * Tests for compaction and auto-archive functionality
 *
 * Invariants tested:
 * - Archived lessons are never lost
 * - Active lessons remain in index.jsonl
 * - Tombstones are correctly applied
 * - Archive files use format: YYYY-MM.jsonl
 * - TOCTOU safety: compact reads file once, produces consistent results
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryItem } from '../types.js';

import {
  archiveOldLessons,
  compact,
  countTombstones,
  getArchivePath,
  needsCompaction,
  rewriteWithoutTombstones,
  ARCHIVE_DIR,
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

  /**
   * Helper to create an old lesson (>90 days)
   */
  const createOldLesson = (id: string, insight: string): MemoryItem => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
    return createLesson(id, insight, { created: oldDate.toISOString() });
  };

  /**
   * Read raw JSONL content (including tombstones)
   */
  const readRawJsonl = async (repoRoot: string): Promise<string> => {
    const filePath = join(repoRoot, LESSONS_PATH);
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  };

  /**
   * Read archive file content
   */
  const readArchive = async (repoRoot: string, yearMonth: string): Promise<string> => {
    const archivePath = join(repoRoot, ARCHIVE_DIR, `${yearMonth}.jsonl`);
    try {
      return await readFile(archivePath, 'utf-8');
    } catch {
      return '';
    }
  };

  describe('getArchivePath', () => {
    it('generates correct archive path for a date', () => {
      const date = new Date('2024-06-15T10:00:00Z');
      const path = getArchivePath(tempDir, date);
      expect(path).toBe(join(tempDir, ARCHIVE_DIR, '2024-06.jsonl'));
    });

    it('pads single-digit months with zero', () => {
      const date = new Date('2024-01-05T10:00:00Z');
      const path = getArchivePath(tempDir, date);
      expect(path).toContain('2024-01.jsonl');
    });
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

  describe('rewriteWithoutTombstones', () => {
    it('removes tombstones from JSONL', async () => {
      await appendLesson(tempDir, createLesson('L001', 'keep'));
      await appendLesson(tempDir, createLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createLesson('L002', 'delete me'), deleted: true });

      await rewriteWithoutTombstones(tempDir);

      const raw = await readRawJsonl(tempDir);
      const lines = raw.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!) as MemoryItem;
      expect(parsed.id).toBe('L001');
    });

    it('preserves all non-deleted lessons', async () => {
      await appendLesson(tempDir, createLesson('L001', 'first'));
      await appendLesson(tempDir, createLesson('L002', 'second'));
      await appendLesson(tempDir, createLesson('L003', 'third'));

      await rewriteWithoutTombstones(tempDir);

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(3);
    });

    it('applies last-write-wins for duplicates', async () => {
      await appendLesson(tempDir, createLesson('L001', 'original'));
      await appendLesson(tempDir, createLesson('L001', 'updated'));

      await rewriteWithoutTombstones(tempDir);

      const raw = await readRawJsonl(tempDir);
      const lines = raw.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!) as MemoryItem;
      expect(parsed.insight).toBe('updated');
    });

    it('handles empty file gracefully', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await mkdir(join(tempDir, '.claude', 'lessons'), { recursive: true });
      await writeFile(filePath, '', 'utf-8');

      await rewriteWithoutTombstones(tempDir);

      const raw = await readRawJsonl(tempDir);
      expect(raw.trim()).toBe('');
    });
  });

  describe('archiveOldLessons', () => {
    it('archives lessons older than 90 days with 0 retrievals', async () => {
      const oldLesson = createOldLesson('L001', 'old lesson');
      const newLesson = createLesson('L002', 'new lesson');

      await appendLesson(tempDir, oldLesson);
      await appendLesson(tempDir, newLesson);

      const archived = await archiveOldLessons(tempDir);

      expect(archived).toBe(1);

      // New lesson should remain in main file
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.id).toBe('L002');
    });

    it('does not archive lessons with retrievalCount > 0', async () => {
      const oldButRetrieved = createOldLesson('L001', 'old but retrieved');
      oldButRetrieved.retrievalCount = 5;

      await appendLesson(tempDir, oldButRetrieved);

      const archived = await archiveOldLessons(tempDir);

      expect(archived).toBe(0);

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
    });

    it('does not archive lessons less than 90 days old', async () => {
      const recentLesson = createLesson('L001', 'recent');
      // 30 days ago - not old enough
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      (recentLesson as MemoryItem).created = recentDate.toISOString();

      await appendLesson(tempDir, recentLesson);

      const archived = await archiveOldLessons(tempDir);

      expect(archived).toBe(0);
    });

    it('creates archive directory if missing', async () => {
      await appendLesson(tempDir, createOldLesson('L001', 'archive me'));

      await archiveOldLessons(tempDir);

      const archiveDir = join(tempDir, ARCHIVE_DIR);
      const stats = await stat(archiveDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('groups archived lessons by month', async () => {
      // Create lessons from different months
      const jan = createLesson('L001', 'jan lesson', {
        created: '2024-01-15T10:00:00Z',
      });
      const feb = createLesson('L002', 'feb lesson', {
        created: '2024-02-15T10:00:00Z',
      });

      await appendLesson(tempDir, jan);
      await appendLesson(tempDir, feb);

      await archiveOldLessons(tempDir);

      const janArchive = await readArchive(tempDir, '2024-01');
      const febArchive = await readArchive(tempDir, '2024-02');

      expect(janArchive).toContain('jan lesson');
      expect(febArchive).toContain('feb lesson');
    });

    it('appends to existing archive files', async () => {
      // Create initial archive
      const archiveDir = join(tempDir, ARCHIVE_DIR);
      await mkdir(archiveDir, { recursive: true });
      const existingLesson = { ...createLesson('L000', 'existing'), created: '2024-01-01T10:00:00Z' };
      await writeFile(
        join(archiveDir, '2024-01.jsonl'),
        JSON.stringify(existingLesson) + '\n',
        'utf-8'
      );

      // Add new old lesson
      const oldLesson = createLesson('L001', 'new old lesson', {
        created: '2024-01-15T10:00:00Z',
      });
      await appendLesson(tempDir, oldLesson);

      await archiveOldLessons(tempDir);

      const janArchive = await readArchive(tempDir, '2024-01');
      expect(janArchive).toContain('existing');
      expect(janArchive).toContain('new old lesson');
    });

    it('preserves original lesson data in archive', async () => {
      const oldLesson = createOldLesson('L001', 'archive me');
      oldLesson.tags = ['special', 'archive'];

      await appendLesson(tempDir, oldLesson);
      await archiveOldLessons(tempDir);

      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(0);

      // Find the archive file
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      const yearMonth = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}`;
      const archiveContent = await readArchive(tempDir, yearMonth);
      const archived = JSON.parse(archiveContent.trim()) as MemoryItem;

      expect(archived.id).toBe('L001');
      expect(archived.tags).toEqual(['special', 'archive']);
    });
  });

  describe('compact', () => {
    it('runs both archive and tombstone removal', async () => {
      // Add old lesson
      await appendLesson(tempDir, createOldLesson('L001', 'old'));
      // Add lesson and delete it
      await appendLesson(tempDir, createLesson('L002', 'deleted'));
      await appendLesson(tempDir, { ...createLesson('L002', 'deleted'), deleted: true });
      // Add normal lesson
      await appendLesson(tempDir, createLesson('L003', 'keep'));

      const result = await compact(tempDir);

      expect(result.archived).toBe(1);
      expect(result.tombstonesRemoved).toBeGreaterThanOrEqual(1);

      // Only L003 should remain
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.id).toBe('L003');
    });

    it('returns stats about compaction', async () => {
      await appendLesson(tempDir, createOldLesson('L001', 'old'));
      await appendLesson(tempDir, createLesson('L002', 'keep'));

      const result = await compact(tempDir);

      expect(result).toHaveProperty('archived');
      expect(result).toHaveProperty('tombstonesRemoved');
      expect(result).toHaveProperty('lessonsRemaining');
      expect(result.lessonsRemaining).toBe(1);
    });

    it('is idempotent', async () => {
      await appendLesson(tempDir, createOldLesson('L001', 'old'));
      await appendLesson(tempDir, createLesson('L002', 'keep'));

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
      await appendLesson(tempDir, createOldLesson('L001', 'old'));
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
      // 2 archivable (old, 0 retrievals)
      await appendLesson(tempDir, createOldLesson('L001', 'old1'));
      await appendLesson(tempDir, createOldLesson('L002', 'old2'));
      // 2 active
      await appendLesson(tempDir, createLesson('L003', 'active1'));
      await appendLesson(tempDir, createLesson('L004', 'active2'));
      // 1 deleted (creates 1 tombstone)
      await appendLesson(tempDir, createLesson('L005', 'todelete'));
      await appendLesson(tempDir, { ...createLesson('L005', 'todelete'), deleted: true });

      const result = await compact(tempDir);

      expect(result.archived).toBe(2);
      expect(result.tombstonesRemoved).toBe(1);
      expect(result.lessonsRemaining).toBe(2);
    });

    it('maintains data invariant: archived + remaining = total non-deleted unique lessons', async () => {
      await appendLesson(tempDir, createOldLesson('L001', 'archive'));
      await appendLesson(tempDir, createLesson('L002', 'active'));
      await appendLesson(tempDir, createLesson('L003', 'willdelete'));
      await appendLesson(tempDir, { ...createLesson('L003', 'willdelete'), deleted: true });

      const result = await compact(tempDir);

      // L001 (archived) + L002 (remaining) = 2 total non-deleted unique lessons
      expect(result.archived + result.lessonsRemaining).toBe(2);

      // File contains exactly lessonsRemaining lessons
      const { lessons } = await readLessons(tempDir);
      expect(lessons).toHaveLength(result.lessonsRemaining);

      // No tombstones remain after compact
      const tombstones = await countTombstones(tempDir);
      expect(tombstones).toBe(0);
    });
  });
});
