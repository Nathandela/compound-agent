/**
 * CLI tests for auto-sync SQLite after mutations.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupCliTestDir, createQuickLesson, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('auto-sync SQLite after mutations', () => {
    it('learn command syncs to SQLite immediately - lesson searchable without manual rebuild', async () => {
      const learn = runCli('learn "Use Polars for large CSV files" --yes', tempDir);
      expect(learn.combined).not.toMatch(/error|Error/);

      const { combined } = runCli('search "Polars"', tempDir);
      expect(combined).toContain('Polars');
    });

    it('learn with --severity high creates lesson searchable via keyword', async () => {
      const learn = runCli('learn "Critical: Always validate user input" --severity high --yes', tempDir);
      expect(learn.combined).not.toMatch(/error|Error/);

      const { combined } = runCli('search "validate"', tempDir);
      expect(combined).toContain('validate');
    });

    it('multiple learn commands all sync correctly', async () => {
      runCli('learn "First lesson about databases" --yes', tempDir);
      runCli('learn "Second lesson about APIs" --yes', tempDir);
      runCli('learn "Third lesson about testing" --yes', tempDir);

      const { combined: search1 } = runCli('search "databases"', tempDir);
      expect(search1).toContain('databases');

      const { combined: search2 } = runCli('search "APIs"', tempDir);
      expect(search2).toContain('APIs');

      const { combined: search3 } = runCli('search "testing"', tempDir);
      expect(search3).toContain('testing');
    });

    it('import command syncs once at end - all lessons searchable', async () => {
      const importFile = join(tempDir, 'import-lessons.jsonl');
      const lessons = [
        createQuickLesson('IMP001', 'First imported lesson about testing'),
        createQuickLesson('IMP002', 'Second imported lesson about logging'),
        createQuickLesson('IMP003', 'Third imported lesson about caching'),
      ];
      await writeFile(importFile, lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

      runCli(`import ${importFile}`, tempDir);

      const { combined: search1 } = runCli('search "testing"', tempDir);
      expect(search1).toContain('testing');

      const { combined: search2 } = runCli('search "logging"', tempDir);
      expect(search2).toContain('logging');

      const { combined: search3 } = runCli('search "caching"', tempDir);
      expect(search3).toContain('caching');
    });

    it('sync completes within reasonable time for single lesson', async () => {
      const start = Date.now();
      runCli('learn "Performance test - single lesson sync" --yes', tempDir);
      const duration = Date.now() - start;

      // Includes CLI startup overhead; generous threshold for parallel test environments
      expect(duration).toBeLessThan(10000);
    });

    it('newly created lesson appears in stats command', async () => {
      runCli('learn "Lesson for stats test" --yes', tempDir);

      const { combined } = runCli('stats', tempDir);
      expect(combined).toContain('1 total');
    });

    it('lesson with severity high appears in load-session after sync', async () => {
      runCli('learn "High severity lesson for session" --severity high --yes', tempDir);

      const { combined } = runCli('load-session', tempDir);
      expect(combined).toContain('High severity lesson');
    });
  });
});
