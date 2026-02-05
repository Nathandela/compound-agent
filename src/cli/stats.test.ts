/**
 * CLI tests for the stats command.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import { closeDb, rebuildIndex } from '../storage/sqlite/index.js';
import { cleanupCliTestDir, createQuickLesson, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('stats command', () => {
    it('shows stats for empty database', () => {
      const { combined } = runCli('stats', tempDir);
      expect(combined).toContain('Lessons: 0 total');
      expect(combined).toContain('Retrievals: 0 total');
    });

    it('shows correct counts with mixed lesson types', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second lesson'));
      await appendLesson(tempDir, { ...createQuickLesson('L003', 'deleted lesson'), deleted: true });
      await rebuildIndex(tempDir);
      closeDb();

      const { combined } = runCli('stats', tempDir);
      expect(combined).toContain('Lessons: 2 total');
      expect(combined).toContain('1 deleted');
    });

    it('handles missing database gracefully', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('stats', tempDir);
      expect(combined).toContain('Lessons: 1 total');
    });

    it('shows storage size info', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
      closeDb();

      const { combined } = runCli('stats', tempDir);
      expect(combined).toMatch(/Storage:/);
      expect(combined).toMatch(/KB|B/);
    });

    it('shows retrieval statistics', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'searchable lesson'));
      await rebuildIndex(tempDir);
      closeDb();
      runCli('search "searchable"', tempDir);
      closeDb();

      const { combined } = runCli('stats', tempDir);
      expect(combined).toMatch(/Retrievals:/);
    });
  });
});
