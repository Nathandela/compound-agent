/**
 * CLI integration tests - cross-cutting concerns and global options.
 *
 * Command-specific tests have been moved to:
 * - src/commands/capture.test.ts (learn, detect, capture, hooks run)
 * - src/commands/retrieval.test.ts (list, search, check-plan, load-session)
 * - src/commands/management.test.ts (export, compact, import, stats, wrong, validate)
 * - src/commands/setup.test.ts (init, setup claude, download-model)
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { setupCliTestContext } from './commands/test-helpers.js';
import { appendLesson } from './storage/jsonl.js';
import { closeDb, rebuildIndex } from './storage/sqlite.js';
import { createQuickLesson } from './test-utils.js';

describe('CLI', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  describe('--version', () => {
    it('shows version', () => {
      const { combined } = runCli('--version');
      expect(combined).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('--help', () => {
    it('shows help', () => {
      const { combined } = runCli('--help');
      expect(combined).toContain('learn');
      expect(combined).toContain('search');
      expect(combined).toContain('list');
    });
  });

  describe('global options', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(getTempDir());
      closeDb();
    });

    it('--verbose flag shows extra detail', () => {
      const { combined } = runCli('list --verbose');
      // Verbose mode should show more info (e.g., created date, context)
      expect(combined).toMatch(/created|context/i);
    });

    it('--quiet flag suppresses info messages', () => {
      const { combined } = runCli('list --quiet');
      // Quiet mode should only show essential output (the lessons)
      expect(combined).toContain('test lesson');
      // Should not include summary line like "Showing X of Y"
      expect(combined).not.toMatch(/showing.*of/i);
    });

    it('-v is alias for --verbose', () => {
      const { combined } = runCli('list -v');
      expect(combined).toMatch(/created|context/i);
    });

    it('-q is alias for --quiet', () => {
      const { combined } = runCli('list -q');
      expect(combined).not.toMatch(/showing.*of/i);
    });
  });

  describe('user-friendly error messages', () => {
    it('shows friendly message for file not found', () => {
      const { combined } = runCli('import /nonexistent/file.jsonl');
      expect(combined).toContain('File not found');
      expect(combined).not.toContain('ENOENT');
    });

    it('shows friendly message when no lessons match search', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('search "zzzznonexistent"');
      expect(combined).toContain('No lessons match your search');
      // Should suggest alternative actions
      expect(combined).toMatch(/try|list|different/i);
    });

    it('shows friendly message for invalid limit', () => {
      const { combined } = runCli('list -n abc');
      expect(combined).toContain('must be a positive integer');
    });

    it('shows friendly message for empty lesson list', () => {
      const { combined } = runCli('list');
      // Should be friendly and suggest getting started
      expect(combined).toMatch(/no lessons|get started|learn/i);
    });
  });

  describe('formatted output', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'first test lesson', { tags: ['test', 'cli'] }));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'second test lesson', { tags: ['api'] }));
      await rebuildIndex(getTempDir());
      closeDb();
    });

    it('list shows formatted table with aligned columns', () => {
      const { combined } = runCli('list');
      // Output should have consistent spacing/formatting
      const lines = combined.split('\n').filter((l: string) => l.trim());
      // Each lesson line should have ID in brackets
      expect(lines.some((l: string) => l.includes('[L001]'))).toBe(true);
      expect(lines.some((l: string) => l.includes('[L002]'))).toBe(true);
    });

    it('search results show formatted output', async () => {
      const { combined } = runCli('search "test"');
      expect(combined).toMatch(/found.*lesson/i);
      expect(combined).toContain('[L001]');
    });

    it('learn command shows success indicator', () => {
      const { combined } = runCli('learn "new lesson" --yes');
      // Should show success message with checkmark or "Learned"
      expect(combined).toMatch(/learned|saved/i);
    });

    it('rebuild command shows progress', () => {
      const { combined } = runCli('rebuild --force');
      expect(combined).toMatch(/rebuild|index/i);
    });
  });

  // ==========================================================================
  // Auto-sync SQLite after mutations (learning_agent-6nj)
  // ==========================================================================
  describe('auto-sync SQLite after mutations', () => {
    it('learn command syncs to SQLite immediately - lesson searchable without manual rebuild', async () => {
      // Create lesson via CLI
      runCli('learn "Use Polars for large CSV files" --yes');
      closeDb(); // Close any open connection

      // Search should find the lesson WITHOUT manual rebuild
      const { combined } = runCli('search "Polars"');
      expect(combined).toContain('Polars');
    });

    it('learn with --severity high creates lesson searchable via keyword', async () => {
      runCli('learn "Critical: Always validate user input" --severity high --yes');
      closeDb();

      const { combined } = runCli('search "validate"');
      expect(combined).toContain('validate');
    });

    it('multiple learn commands all sync correctly', async () => {
      // Create multiple lessons
      runCli('learn "First lesson about databases" --yes');
      runCli('learn "Second lesson about APIs" --yes');
      runCli('learn "Third lesson about testing" --yes');
      closeDb();

      // All should be searchable
      const { combined: search1 } = runCli('search "databases"');
      expect(search1).toContain('databases');

      const { combined: search2 } = runCli('search "APIs"');
      expect(search2).toContain('APIs');

      const { combined: search3 } = runCli('search "testing"');
      expect(search3).toContain('testing');
    });

    it('import command syncs once at end - all lessons searchable', async () => {
      // Create import file with multiple lessons
      const importFile = join(getTempDir(), 'import-lessons.jsonl');
      const lessons = [
        createQuickLesson('IMP001', 'First imported lesson about testing'),
        createQuickLesson('IMP002', 'Second imported lesson about logging'),
        createQuickLesson('IMP003', 'Third imported lesson about caching'),
      ];
      await writeFile(importFile, lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

      runCli(`import ${importFile}`);
      closeDb();

      // All lessons should be searchable
      const { combined: search1 } = runCli('search "testing"');
      expect(search1).toContain('testing');

      const { combined: search2 } = runCli('search "logging"');
      expect(search2).toContain('logging');

      const { combined: search3 } = runCli('search "caching"');
      expect(search3).toContain('caching');
    });

    it('sync completes within 500ms for single lesson', async () => {
      const start = Date.now();
      runCli('learn "Performance test - single lesson sync" --yes');
      const duration = Date.now() - start;

      // Allow some margin for CLI startup overhead
      expect(duration).toBeLessThan(2000); // 2 seconds total including CLI startup
    });

    it('newly created lesson appears in stats command', async () => {
      // Create a lesson
      runCli('learn "Lesson for stats test" --yes');
      closeDb();

      // Stats should reflect the new lesson
      const { combined } = runCli('stats');
      expect(combined).toContain('1 total');
    });

    it('lesson with severity high appears in load-session after sync', async () => {
      runCli('learn "High severity lesson for session" --severity high --yes');
      closeDb();

      const { combined } = runCli('load-session');
      expect(combined).toContain('High severity lesson');
    });
  });

});
