import { execSync } from 'node:child_process';
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ARCHIVE_DIR } from './storage/compact.js';
import { appendLesson, LESSONS_PATH } from './storage/jsonl.js';
import { closeDb, rebuildIndex } from './storage/sqlite.js';
import { createQuickLesson, daysAgo } from './test-utils.js';

describe('CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-cli-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  const runCli = (args: string): { stdout: string; stderr: string; combined: string } => {
    const cliPath = join(process.cwd(), 'dist', 'cli.js');
    try {
      const stdout = execSync(`node ${cliPath} ${args} 2>&1`, {
        cwd: tempDir,
        encoding: 'utf-8',
        env: { ...process.env, LEARNING_AGENT_ROOT: tempDir },
      });
      return { stdout, stderr: '', combined: stdout };
    } catch (error) {
      const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      const stdout = err.stdout?.toString() ?? '';
      const stderr = err.stderr?.toString() ?? '';
      const combined = stdout + stderr + (err.message ?? '');
      return { stdout, stderr, combined };
    }
  };

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

  describe('learn command', () => {
    it('creates a lesson in JSONL file', async () => {
      runCli('learn "Use Polars for large files" --trigger "pandas was slow" --yes');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Polars');
      expect(content).toContain('pandas was slow');
    });

    it('requires insight argument', () => {
      const { combined } = runCli('learn');
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });
  });

  describe('list command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second lesson'));
      await appendLesson(tempDir, createQuickLesson('L003', 'third lesson'));
    });

    it('lists lessons', () => {
      const { combined } = runCli('list');
      expect(combined).toContain('first lesson');
      expect(combined).toContain('second lesson');
    });

    it('respects limit option', () => {
      const { combined } = runCli('list -n 1');
      const lines = combined.trim().split('\n').filter((l: string) => l.includes('lesson'));
      expect(lines.length).toBeLessThanOrEqual(2); // Header + 1 lesson
    });

    it('warns about corrupted lessons', async () => {
      // Write corrupted data directly to JSONL (bypasses appendLesson validation)
      const filePath = join(tempDir, LESSONS_PATH);
      await appendFile(filePath, 'not valid json\n', 'utf-8');
      await appendFile(filePath, '{"id": "bad", "missing": "fields"}\n', 'utf-8');

      const { combined } = runCli('list');
      expect(combined).toContain('first lesson'); // Valid lessons still shown
      expect(combined.toLowerCase()).toMatch(/warn|skip|corrupt/i);
      expect(combined).toMatch(/2/); // Should mention 2 skipped
    });
  });

  describe('search command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createQuickLesson('L002', 'test your code'));
      await rebuildIndex(tempDir);
      closeDb(); // Close so CLI can open fresh
    });

    it('searches by keyword', () => {
      const { combined } = runCli('search "Polars"');
      expect(combined).toContain('Polars');
    });

    it('shows no results for non-matching query', () => {
      const { combined } = runCli('search "nonexistent"');
      // Now shows user-friendly message with suggestions
      expect(combined.toLowerCase()).toMatch(/no lessons match|no.*found|0.*result/i);
    });
  });

  describe('export command', () => {
    beforeEach(async () => {
      // Lessons with different dates and tags
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'first lesson', { tags: ['typescript', 'testing'], created: '2024-01-15T10:00:00Z' })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L002', 'second lesson', { tags: ['python'], created: '2024-02-20T10:00:00Z' })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L003', 'third lesson', { tags: ['typescript', 'cli'], created: '2024-03-25T10:00:00Z' })
      );
    });

    it('exports all lessons as JSON to stdout', () => {
      const { stdout } = runCli('export');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(3);
      expect(exported).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'L001', insight: 'first lesson' }),
          expect.objectContaining({ id: 'L002', insight: 'second lesson' }),
          expect.objectContaining({ id: 'L003', insight: 'third lesson' }),
        ])
      );
    });

    it('exports valid JSON that can be parsed', () => {
      const { stdout } = runCli('export');
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it('filters lessons by --since date', () => {
      const { stdout } = runCli('export --since 2024-02-01');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'L002' }),
          expect.objectContaining({ id: 'L003' }),
        ])
      );
    });

    it('filters lessons by --tags', () => {
      const { stdout } = runCli('export --tags typescript');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'L001' }),
          expect.objectContaining({ id: 'L003' }),
        ])
      );
    });

    it('filters by multiple tags (OR logic)', () => {
      const { stdout } = runCli('export --tags python,cli');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'L002' }), // python
          expect.objectContaining({ id: 'L003' }), // cli
        ])
      );
    });

    it('combines --since and --tags filters', () => {
      const { stdout } = runCli('export --since 2024-02-01 --tags typescript');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual(expect.objectContaining({ id: 'L003' }));
    });

    it('outputs empty array when no lessons exist', async () => {
      // Create new temp dir with no lessons
      const emptyDir = await mkdtemp(join(tmpdir(), 'learning-agent-empty-'));
      try {
        const { stdout } = runCli(`--help`); // Get help first to ensure CLI works
        const exportResult = execSync(`node ${join(process.cwd(), 'dist', 'cli.js')} export`, {
          cwd: emptyDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: emptyDir },
        });
        const exported = JSON.parse(exportResult);
        expect(exported).toEqual([]);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('outputs empty array when no lessons match filters', () => {
      const { stdout } = runCli('export --tags nonexistent');
      const exported = JSON.parse(stdout) as unknown[];
      expect(exported).toEqual([]);
    });

    it('excludes deleted lessons', async () => {
      // Mark L002 as deleted by appending tombstone
      const filePath = join(tempDir, LESSONS_PATH);
      const tombstone = JSON.stringify({
        id: 'L002',
        type: 'quick',
        trigger: 'deleted',
        insight: 'second lesson',
        tags: [],
        source: 'manual',
        context: { tool: 'test', intent: 'testing' },
        created: '2024-02-20T10:00:00Z',
        confirmed: true,
        supersedes: [],
        related: [],
        deleted: true,
      });
      await appendFile(filePath, tombstone + '\n', 'utf-8');

      const { stdout } = runCli('export');
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'L002' })])
      );
    });
  });

  describe('compact command', () => {
    it('shows help for compact command', () => {
      const { combined } = runCli('compact --help');
      expect(combined).toContain('archive old lessons');
      expect(combined).toContain('--force');
      expect(combined).toContain('--dry-run');
    });

    it('reports no compaction needed when below threshold', async () => {
      // Add a single lesson (no tombstones)
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact');
      expect(combined).toContain('Compaction not needed');
      expect(combined).toContain('0 tombstones');
    });

    it('runs with --force even when below threshold', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Running compaction');
      expect(combined).toContain('Compaction complete');
      expect(combined).toContain('Lessons remaining: 1');
    });

    it('shows dry-run output without making changes', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      // Add a tombstone
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'deleted'), deleted: true });

      const { combined } = runCli('compact --dry-run');
      expect(combined).toContain('Dry run');
      expect(combined).toContain('Tombstones found: 1');

      // Verify no changes were made - file should still have tombstone
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('"deleted":true');
    });

    it('archives old lessons with force flag', async () => {
      // Create an old lesson (100 days ago, no retrievals)
      const oldDate = daysAgo(100);
      await appendLesson(tempDir, createQuickLesson('L001', 'old lesson', { created: oldDate }));
      // And a recent lesson
      await appendLesson(tempDir, createQuickLesson('L002', 'new lesson'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Archived: 1 lesson');
      expect(combined).toContain('Lessons remaining: 1');

      // Verify archive file was created
      const archiveDir = join(tempDir, ARCHIVE_DIR);
      const archives = await readdir(archiveDir);
      expect(archives.length).toBeGreaterThan(0);
    });

    it('removes tombstones with force flag', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'keep'));
      await appendLesson(tempDir, createQuickLesson('L002', 'delete me'));
      await appendLesson(tempDir, { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Tombstones removed:');
      expect(combined).toContain('Lessons remaining: 1');

      // Verify tombstone was removed from file
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).not.toContain('"deleted":true');
      expect(content).toContain('L001');
      expect(content).not.toContain('L002');
    });

    it('rebuilds index after compaction', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Index rebuilt');
    });
  });

  describe('import command', () => {
    it('imports lessons from a JSONL file', async () => {
      // Create source file with lessons to import
      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('IMP1', 'imported lesson one')),
          JSON.stringify(createQuickLesson('IMP2', 'imported lesson two')),
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`);
      expect(combined).toContain('Imported 2 lessons');

      // Verify lessons were added
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('IMP1');
      expect(content).toContain('IMP2');
    });

    it('skips lessons with duplicate IDs', async () => {
      // Add existing lesson
      await appendLesson(tempDir, createQuickLesson('EXIST1', 'existing lesson'));

      // Create source file with duplicate and new lesson
      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('EXIST1', 'duplicate lesson')),
          JSON.stringify(createQuickLesson('NEW1', 'new lesson')),
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`);
      expect(combined).toContain('Imported 1 lesson');
      expect(combined).toContain('1 skipped');

      // Verify original lesson unchanged, new lesson added
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson'); // Original preserved
      expect(content).toContain('NEW1'); // New added
    });

    it('reports invalid lessons that fail schema validation', async () => {
      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('VALID1', 'valid lesson')),
          '{"id": "BAD1", "missing": "required fields"}',
          'not even json',
          JSON.stringify(createQuickLesson('VALID2', 'another valid lesson')),
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`);
      expect(combined).toContain('Imported 2 lessons');
      expect(combined).toContain('2 invalid');
    });

    it('requires file argument', () => {
      const { combined } = runCli('import');
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });

    it('handles non-existent file gracefully', () => {
      const { combined } = runCli('import /nonexistent/file.jsonl');
      expect(combined.toLowerCase()).toMatch(/error|not found|enoent/i);
    });

    it('handles empty import file', async () => {
      const sourceFile = join(tempDir, 'empty.jsonl');
      await writeFile(sourceFile, '');

      const { combined } = runCli(`import ${sourceFile}`);
      expect(combined).toContain('Imported 0 lessons');
    });

    it('shows summary with all counts', async () => {
      // Add existing lesson
      await appendLesson(tempDir, createQuickLesson('EXIST1', 'existing'));

      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('NEW1', 'new lesson')),
          JSON.stringify(createQuickLesson('EXIST1', 'duplicate')),
          '{"invalid": "json"}',
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`);
      // Should show: Imported 1 lesson (1 skipped, 1 invalid)
      expect(combined).toMatch(/imported.*1.*lesson/i);
      expect(combined).toMatch(/1.*skipped/i);
      expect(combined).toMatch(/1.*invalid/i);
    });
  });

  describe('global options', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
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
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
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
      await appendLesson(tempDir, createQuickLesson('L001', 'first test lesson', { tags: ['test', 'cli'] }));
      await appendLesson(tempDir, createQuickLesson('L002', 'second test lesson', { tags: ['api'] }));
      await rebuildIndex(tempDir);
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

  describe('stats command', () => {
    it('shows stats for empty database', () => {
      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 0 total');
      expect(combined).toContain('Retrievals: 0 total');
    });

    it('shows correct counts with mixed lesson types', async () => {
      // Add active lessons
      await appendLesson(tempDir, createQuickLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second lesson'));
      // Add deleted lesson (tombstone)
      await appendLesson(tempDir, { ...createQuickLesson('L003', 'deleted lesson'), deleted: true });
      // Rebuild index to include lessons
      await rebuildIndex(tempDir);
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 2 total');
      expect(combined).toContain('1 deleted');
    });

    it('handles missing database gracefully', async () => {
      // Add a lesson so JSONL exists but no database yet
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('stats');
      // Should still work - stats command syncs index if needed
      expect(combined).toContain('Lessons: 1 total');
    });

    it('shows storage size info', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toMatch(/Storage:/);
      expect(combined).toMatch(/KB|B/); // Size units
    });

    it('shows retrieval statistics', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'searchable lesson'));
      await rebuildIndex(tempDir);
      // Trigger a retrieval by searching
      closeDb(); // Close so search opens fresh connection
      runCli('search "searchable"');
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toMatch(/Retrievals:/);
    });
  });

  describe('detect command', () => {
    it('requires --input option', () => {
      const { combined } = runCli('detect');
      expect(combined.toLowerCase()).toMatch(/required|missing/i);
    });

    it('detects user correction from input file', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'edit the config',
              'No, use dev.config.ts instead of prod.config.ts when testing locally',
            ],
            context: { tool: 'edit', intent: 'config update' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('Learning trigger detected');
      expect(combined).toContain('user_correction');
    });

    it('outputs JSON when --json flag is used', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run tests',
              'Actually, use pnpm test instead of npm test in this project',
            ],
            context: { tool: 'bash', intent: 'testing' },
          },
        })
      );

      const { stdout } = runCli(`detect --input ${inputPath} --json`);
      const result = JSON.parse(stdout) as { detected: boolean; source?: string };
      expect(result.detected).toBe(true);
      expect(result.source).toBe('user_correction');
    });

    it('shows no detection for normal conversation', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: ['hello', 'hi there, how can I help?'],
            context: { tool: 'chat', intent: 'greeting' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('No learning trigger detected');
    });

    it('detects test failure from input file', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'test',
          data: {
            passed: false,
            output: 'AssertionError: use toEqual instead of toBe for objects',
            testFile: 'src/app.test.ts',
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath}`);
      expect(combined).toContain('Learning trigger detected');
      expect(combined).toContain('test_failure');
    });

    it('saves lesson when --save flag is used', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: [
              'run the build',
              'Wrong, use pnpm build instead of npm build for this project',
            ],
            context: { tool: 'bash', intent: 'build' },
          },
        })
      );

      const { combined } = runCli(`detect --input ${inputPath} --save`);
      expect(combined).toContain('Saved as lesson');

      // Verify lesson was actually saved
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('pnpm build');
    });
  });
});
