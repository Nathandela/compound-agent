/**
 * CLI tests for the compact command.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ARCHIVE_DIR } from '../storage/compact.js';
import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { createQuickLesson, daysAgo } from '../test-utils.js';
import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('compact command', () => {
    it('shows help for compact command', () => {
      const { combined } = runCli('compact --help', tempDir);
      expect(combined).toContain('archive old lessons');
      expect(combined).toContain('--force');
      expect(combined).toContain('--dry-run');
    });

    it('reports no compaction needed when below threshold', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact', tempDir);
      expect(combined).toContain('Compaction not needed');
      expect(combined).toContain('0 tombstones');
    });

    it('runs with --force even when below threshold', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact --force', tempDir);
      expect(combined).toContain('Running compaction');
      expect(combined).toContain('Compaction complete');
      expect(combined).toContain('Lessons remaining: 1');
    });

    it('shows dry-run output without making changes', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'deleted'), deleted: true });

      const { combined } = runCli('compact --dry-run', tempDir);
      expect(combined).toContain('Dry run');
      expect(combined).toContain('Tombstones found: 1');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('"deleted":true');
    });

    it('archives old lessons with force flag', async () => {
      const oldDate = daysAgo(100);
      await appendLesson(tempDir, createQuickLesson('L001', 'old lesson', { created: oldDate }));
      await appendLesson(tempDir, createQuickLesson('L002', 'new lesson'));

      const { combined } = runCli('compact --force', tempDir);
      expect(combined).toContain('Archived: 1 lesson');
      expect(combined).toContain('Lessons remaining: 1');

      const archiveDir = join(tempDir, ARCHIVE_DIR);
      const archives = await readdir(archiveDir);
      expect(archives.length).toBeGreaterThan(0);
    });

    it('removes tombstones with force flag', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const { combined } = runCli('compact --force', tempDir);
      expect(combined).toContain('Tombstones removed:');
      expect(combined).toContain('Lessons remaining: 1');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).not.toContain('"deleted":true');
      expect(content).toContain('L001');
      expect(content).not.toContain('L002');
    });

    it('rebuilds index after compaction', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test'));

      const { combined } = runCli('compact --force', tempDir);
      expect(combined).toContain('Index rebuilt');
    });
  });
});
