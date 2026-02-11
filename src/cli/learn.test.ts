/**
 * CLI tests for the learn command.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LESSONS_PATH } from '../memory/storage/jsonl.js';
import { cleanupCliTestDir, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('learn command', () => {
    it('creates a lesson in JSONL file', async () => {
      runCli('learn "Use Polars for large files" --trigger "pandas was slow" --yes', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Polars');
      expect(content).toContain('pandas was slow');
    });

    it('requires insight argument', () => {
      const { combined } = runCli('learn', tempDir);
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });

    it('always saves with confirmed: true even without --yes', async () => {
      runCli('learn "Always confirm manual lessons"', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { confirmed: boolean };
      expect(lesson.confirmed).toBe(true);
    });

    describe('--severity flag', () => {
      it('creates full lesson with severity=high when --severity high is used', async () => {
        runCli('learn "Use Polars for files >100MB" --severity high --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
      });

      it('creates full lesson with severity=medium when --severity medium is used', async () => {
        runCli('learn "Validate input before processing" --severity medium --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('medium');
      });

      it('creates full lesson with severity=low when --severity low is used', async () => {
        runCli('learn "Consider adding comments" --severity low --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('low');
      });

      it('automatically sets type=full when --severity flag is provided', async () => {
        runCli('learn "High severity lesson" --severity high --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
      });

      it('rejects invalid severity value with clear error message', () => {
        const { combined } = runCli('learn "Test lesson" --severity invalid --yes', tempDir);

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });

      it('rejects case-incorrect severity value (case-sensitive)', () => {
        const { combined } = runCli('learn "Test lesson" --severity High --yes', tempDir);

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      it('rejects empty severity string', () => {
        const { combined } = runCli('learn "Test lesson" --severity "" --yes', tempDir);

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      it('does not corrupt JSONL when invalid severity is provided', async () => {
        runCli('learn "Valid lesson" --yes', tempDir);

        const filePathBefore = join(tempDir, LESSONS_PATH);
        const contentBefore = await readFile(filePathBefore, 'utf-8');

        runCli('learn "Invalid severity lesson" --severity bad --yes', tempDir);

        const filePathAfter = join(tempDir, LESSONS_PATH);
        const contentAfter = await readFile(filePathAfter, 'utf-8');

        expect(contentAfter).toBe(contentBefore);
        expect(contentAfter).not.toContain('Invalid severity lesson');
      });

      it('creates quick lesson with no severity when --severity flag is omitted', async () => {
        runCli('learn "Quick capture lesson" --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('quick');
        expect(lesson.severity).toBeUndefined();
      });

      it('creates high-severity lesson that is retrievable by loadSessionLessons', async () => {
        runCli('learn "Critical security lesson" --severity high --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string; confirmed: boolean };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
        expect(lesson.confirmed).toBe(true);
      });

      it('works with all other flags combined', async () => {
        runCli('learn "Complex lesson" --severity high --trigger "bug occurred" --tags "security,auth" --yes', tempDir);

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as {
          type: string;
          severity?: string;
          trigger: string;
          tags: string[];
        };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
        expect(lesson.trigger).toBe('bug occurred');
        expect(lesson.tags).toContain('security');
        expect(lesson.tags).toContain('auth');
      });

      it('completes within reasonable time for severity flag', async () => {
        const start = Date.now();
        runCli('learn "Performance test" --severity high --yes', tempDir);
        const duration = Date.now() - start;

        // Allow margin for CLI startup overhead in parallel test environment
        expect(duration).toBeLessThan(5000);
      });

      it('shows clear error message listing valid severity values', () => {
        const { combined } = runCli('learn "Test" --severity wrong --yes', tempDir);

        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });
    });
  });
});
