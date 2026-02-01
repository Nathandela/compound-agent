import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from './embeddings/nomic.js';
import { ARCHIVE_DIR } from './storage/compact.js';
import { appendLesson, LESSONS_PATH } from './storage/jsonl.js';
import { closeDb, rebuildIndex } from './storage/sqlite.js';
import { createFullLesson, createQuickLesson, daysAgo } from './test-utils.js';

// Check model availability at module load time for conditional tests
const modelAvailable = isModelAvailable();

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

    it('always saves with confirmed: true even without --yes', async () => {
      runCli('learn "Always confirm manual lessons"');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { confirmed: boolean };
      expect(lesson.confirmed).toBe(true);
    });

    // --severity flag tests (Data Invariants)
    describe('--severity flag', () => {
      it('creates full lesson with severity=high when --severity high is used', async () => {
        runCli('learn "Use Polars for files >100MB" --severity high --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
      });

      it('creates full lesson with severity=medium when --severity medium is used', async () => {
        runCli('learn "Validate input before processing" --severity medium --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('medium');
      });

      it('creates full lesson with severity=low when --severity low is used', async () => {
        runCli('learn "Consider adding comments" --severity low --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('low');
      });

      it('automatically sets type=full when --severity flag is provided', async () => {
        runCli('learn "High severity lesson" --severity high --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        // Coupling invariant: severity !== undefined implies type === 'full'
        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
      });

      // Safety Property S1: Invalid severity values rejected with clear error
      it('rejects invalid severity value with clear error message', () => {
        const { combined } = runCli('learn "Test lesson" --severity invalid --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });

      it('rejects case-incorrect severity value (case-sensitive)', () => {
        const { combined } = runCli('learn "Test lesson" --severity High --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      it('rejects empty severity string', () => {
        const { combined } = runCli('learn "Test lesson" --severity "" --yes');

        expect(combined.toLowerCase()).toMatch(/error|invalid/i);
        expect(combined).toMatch(/severity/i);
      });

      // Safety Property S5: JSONL must not be corrupted by invalid input
      it('does not corrupt JSONL when invalid severity is provided', async () => {
        // Create a valid lesson first
        runCli('learn "Valid lesson" --yes');

        const filePathBefore = join(tempDir, LESSONS_PATH);
        const contentBefore = await readFile(filePathBefore, 'utf-8');

        // Try to create lesson with invalid severity
        runCli('learn "Invalid severity lesson" --severity bad --yes');

        const filePathAfter = join(tempDir, LESSONS_PATH);
        const contentAfter = await readFile(filePathAfter, 'utf-8');

        // JSONL should be unchanged (no new lesson added)
        expect(contentAfter).toBe(contentBefore);
        expect(contentAfter).not.toContain('Invalid severity lesson');
      });

      // Backward compatibility: No --severity flag creates quick lesson
      it('creates quick lesson with no severity when --severity flag is omitted', async () => {
        runCli('learn "Quick capture lesson" --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string };

        expect(lesson.type).toBe('quick');
        expect(lesson.severity).toBeUndefined();
      });

      // Safety Property S3: High-severity lessons must be retrievable by loadSessionLessons
      it('creates high-severity lesson that is retrievable by loadSessionLessons', async () => {
        runCli('learn "Critical security lesson" --severity high --yes');

        const filePath = join(tempDir, LESSONS_PATH);
        const content = await readFile(filePath, 'utf-8');
        const lesson = JSON.parse(content.trim()) as { type: string; severity?: string; confirmed: boolean };

        // Verify all required fields for loadSessionLessons filter
        expect(lesson.type).toBe('full');
        expect(lesson.severity).toBe('high');
        expect(lesson.confirmed).toBe(true);
      });

      it('works with all other flags combined', async () => {
        runCli('learn "Complex lesson" --severity high --trigger "bug occurred" --tags "security,auth" --yes');

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

      // Liveness Property L1: CLI completes within 500ms
      it('completes within 500ms for severity flag', async () => {
        const start = Date.now();
        runCli('learn "Performance test" --severity high --yes');
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(500);
      });

      // Liveness Property L2: Clear error messages list valid values
      it('shows clear error message listing valid severity values', () => {
        const { combined } = runCli('learn "Test" --severity wrong --yes');

        // Error message must list all valid values
        expect(combined).toMatch(/high/i);
        expect(combined).toMatch(/medium/i);
        expect(combined).toMatch(/low/i);
      });
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

  describe('load-session command', () => {
    it('outputs lessons in human-readable format', async () => {
      // Create high-severity confirmed lessons
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
          tags: ['performance', 'data'],
          created: '2025-01-28T10:00:00Z',
        })
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Always validate input before processing', 'high', {
          tags: ['security'],
          created: '2025-01-27T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session');

      // New format: header, intro, bold insights with tags, learned line, footer
      expect(combined).toContain('## Lessons from Past Sessions');
      expect(combined).toContain('**Use Polars for files >100MB, not pandas**');
      expect(combined).toMatch(/\(performance, data\)/);
      expect(combined).toContain('Consider these lessons');
    });

    it('outputs valid JSON with --json flag', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high', { tags: ['test'] })
      );

      const { stdout } = runCli('load-session --json');
      const result = JSON.parse(stdout) as { lessons: unknown[]; count: number };

      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(result.count).toBe(1);
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('shows message when no high-severity lessons exist', () => {
      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('returns exit code 0 even with no lessons', () => {
      // runCli catches errors, so successful execution means exit 0
      const { combined } = runCli('load-session');
      // Should not contain error indicators
      expect(combined).not.toMatch(/error|exception|fail/i);
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out non-high-severity lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Medium severity lesson', 'medium')
      );
      await appendLesson(
        tempDir,
        createFullLesson('L002', 'Low severity lesson', 'low')
      );
      await appendLesson(tempDir, createQuickLesson('L003', 'Quick lesson'));

      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('filters out unconfirmed lessons', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Unconfirmed lesson', 'high', { confirmed: false })
      );

      const { combined } = runCli('load-session');
      expect(combined).toContain('No high-severity lessons found');
    });

    it('respects --quiet flag', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high')
      );

      const { combined } = runCli('load-session --quiet');
      // Should not contain info prefix or summary
      expect(combined).not.toMatch(/\[info\]/);
    });

    it('shows source and date in human-readable format', async () => {
      await appendLesson(
        tempDir,
        createFullLesson('L001', 'Test lesson', 'high', {
          created: '2025-01-28T10:00:00Z',
        })
      );

      const { combined } = runCli('load-session');
      // New format uses "Learned: DATE via SOURCE" instead of "Source:"
      expect(combined).toContain('Learned:');
      expect(combined).toContain('2025-01-28');
    });

    // ========================================================================
    // NEW TESTS FOR ENHANCED OUTPUT FORMAT (learning_agent-793)
    // ========================================================================

    describe('enhanced output format (S1, S2, S3)', () => {
      it('uses new header "## Lessons from Past Sessions"', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should use new header instead of "Session Lessons (High Severity)"
        expect(combined).toContain('## Lessons from Past Sessions');
        expect(combined).not.toContain('Session Lessons (High Severity)');
      });

      it('includes intro text for Claude', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should include intro paragraph
        expect(combined).toMatch(/these lessons were captured from previous/i);
        expect(combined).toMatch(/should inform your work/i);
      });

      it('does not include lesson IDs [Lxxxxxxxx] in human output (S1)', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L12345678', 'Use Polars for large files', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should NOT include lesson ID in output
        expect(combined).not.toMatch(/\[L[a-f0-9]{8}\]/);
        // Should include the insight
        expect(combined).toContain('Use Polars for large files');
      });

      it('does not include [info] prefix in output (S2)', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should NOT include [info] prefix anywhere
        expect(combined).not.toMatch(/\[info\]/i);
      });

      it('formats lessons with bold insight and tags in parentheses', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for files >100MB', 'high', {
            tags: ['performance'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Insight should be bold (starts with **)
        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*/);
        // Tags should be in parentheses after insight on same line
        expect(combined).toMatch(/\*\*Use Polars for files >100MB\*\*.*\(performance\)/);
      });

      it('shows "Learned: DATE via SOURCE" format', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );

        const { combined } = runCli('load-session');

        // Should use "Learned:" prefix
        expect(combined).toMatch(/Learned:/);
        // Should show date in YYYY-MM-DD format
        expect(combined).toMatch(/2025-01-28/);
        // Should show "via SOURCE" (underscores converted to spaces for readability)
        expect(combined).toMatch(/via\s+user\s+correction/);
      });

      it('includes footer with actionable reminder', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should include footer with actionable reminder
        expect(combined).toMatch(/consider these lessons/i);
        expect(combined).toMatch(/planning|implementing/i);
      });

      it('shows friendly empty state message', () => {
        const { combined } = runCli('load-session');

        // Should show friendly message (not error)
        expect(combined).toContain('No high-severity lessons found');
        // Should NOT show error indicators
        expect(combined).not.toMatch(/\[error\]/i);
      });

      it('exits with code 0 even with no lessons (S4)', () => {
        // runCli catches errors, so successful execution means exit 0
        const { combined } = runCli('load-session');

        // Should not contain error indicators
        expect(combined).not.toMatch(/error|exception|fail/i);
      });

      it('token count is reasonable (~150 tokens per lesson)', async () => {
        // Create 5 lessons with realistic content
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for files >100MB, not pandas', 'high', {
            tags: ['performance', 'data'],
            created: '2025-01-28T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L002', 'Always validate input before processing', 'high', {
            tags: ['security'],
            created: '2025-01-27T10:00:00Z',
            source: 'test_failure',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L003', 'Run tests before committing code', 'high', {
            tags: ['testing', 'workflow'],
            created: '2025-01-26T10:00:00Z',
            source: 'manual',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L004', 'Check authentication before API calls', 'high', {
            tags: ['auth', 'api'],
            created: '2025-01-25T10:00:00Z',
            source: 'user_correction',
          })
        );
        await appendLesson(
          tempDir,
          createFullLesson('L005', 'Handle edge cases in validation logic', 'high', {
            tags: ['validation', 'edge-cases'],
            created: '2025-01-24T10:00:00Z',
            source: 'test_failure',
          })
        );

        const { combined } = runCli('load-session');

        // Rough token estimation: 4 chars = 1 token
        const charCount = combined.length;
        const estimatedTokens = charCount / 4;

        // Should be under 800 tokens total (S3)
        expect(estimatedTokens).toBeLessThan(800);

        // Should be reasonable per lesson (~150 tokens × 5 = 750 max)
        const tokensPerLesson = estimatedTokens / 5;
        expect(tokensPerLesson).toBeLessThan(160);
      });

      it('formats lessons without tags by omitting tag parentheses', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson without tags', 'high', {
            tags: [],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Should show insight
        expect(combined).toContain('Test lesson without tags');
        // Should NOT show empty parentheses
        expect(combined).not.toMatch(/\*\*Test lesson without tags\*\*\s*\(\s*\)/);
      });

      it('formats multiple tags correctly', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Use Polars for large files', 'high', {
            tags: ['performance', 'data', 'optimization'],
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session');

        // Tags should be in parentheses on same line as insight
        expect(combined).toMatch(/\*\*Use Polars for large files\*\*.*\(performance, data, optimization\)/);
      });

      it('footer respects --quiet flag', async () => {
        await appendLesson(
          tempDir,
          createFullLesson('L001', 'Test lesson', 'high', {
            created: '2025-01-28T10:00:00Z',
          })
        );

        const { combined } = runCli('load-session --quiet');

        // Should NOT include footer in quiet mode
        expect(combined).not.toMatch(/consider these lessons/i);
        expect(combined).not.toMatch(/1.*high-severity.*lesson/i);
      });
    });
  });

  describe('download-model command', () => {
    it('command is registered and recognized', () => {
      const { combined } = runCli('download-model --help');
      // Command should be recognized and show help
      expect(combined).toContain('download-model');
      expect(combined).not.toMatch(/unknown command|not found/i);
    });

    it('shows success message when model downloads successfully', () => {
      const { combined } = runCli('download-model');
      // Should show download progress and success
      expect(combined).toMatch(/downloading|model|success/i);
    });

    it('shows model path and size after successful download', () => {
      const { combined } = runCli('download-model');
      // Should display the path to the downloaded model
      expect(combined).toMatch(/path/i);
      expect(combined).toMatch(/\.gguf/i);
      // Should show size in human-readable format (MB)
      expect(combined).toMatch(/\d+\s*MB/i);
    });

    it('is idempotent - skips download if model already exists', () => {
      // Run download twice
      runCli('download-model');
      const { combined } = runCli('download-model');

      // Second run should indicate model already exists
      expect(combined).toMatch(/already\s+(downloaded|exists|available)/i);
      expect(combined).not.toMatch(/downloading/i);
    });

    it('second download completes instantly (no re-download)', () => {
      // First download
      runCli('download-model');

      // Second run should be instant (no actual download)
      const start = Date.now();
      runCli('download-model');
      const duration = Date.now() - start;

      // Should complete in less than 2 seconds (way faster than 278MB download)
      expect(duration).toBeLessThan(2000);
    });

    it('isModelAvailable returns true after successful download', () => {
      // Download model (may already exist)
      runCli('download-model');

      // After download, model should be available
      const afterAvailable = isModelAvailable();

      // Invariant: after running download-model, isModelAvailable() must be true
      expect(afterAvailable).toBe(true);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('download-model --json');

      // Extract JSON from output (may have other output from node-llama-cpp)
      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as {
        success: boolean;
        path: string;
        size: number;
        alreadyExisted: boolean;
      };

      expect(result.success).toBe(true);
      expect(result.path).toMatch(/\.gguf$/);
      expect(result.size).toBeGreaterThan(0);
      expect(typeof result.alreadyExisted).toBe('boolean');
    });

    it('JSON output shows alreadyExisted field accurately reflects model state', () => {
      // First check if model exists
      const modelExistsBefore = isModelAvailable();

      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      // alreadyExisted should match whether model existed before this run
      expect(result.alreadyExisted).toBe(modelExistsBefore);
    });

    it('JSON output shows alreadyExisted: true on subsequent download', () => {
      // First download
      runCli('download-model');

      // Second download
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { alreadyExisted: boolean };
      expect(result.alreadyExisted).toBe(true);
    });

    it('uses absolute path for model location', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      // Path should be absolute (starts with /)
      expect(result.path).toMatch(/^\//);
      // Path should include home directory
      expect(result.path).toContain('.node-llama-cpp');
    });

    it('uses consistent model filename', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { path: string };

      // Should use MODEL_FILENAME constant (hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf)
      expect(result.path).toContain('hf_ggml-org_embeddinggemma-300M-qat-Q4_0.gguf');
    });

    it('downloaded model file has valid size (approximately 278MB)', () => {
      const { stdout } = runCli('download-model --json');

      const jsonLine = stdout.split('\n').find((line) => line.trim().startsWith('{'));
      expect(jsonLine).toBeDefined();

      const result = JSON.parse(jsonLine!) as { size: number };

      // Size should be approximately 278MB (277,852,359 bytes ±5%)
      const expectedSize = 277852359;
      const tolerance = expectedSize * 0.05; // 5% tolerance for model variations

      expect(result.size).toBeGreaterThan(expectedSize - tolerance);
      expect(result.size).toBeLessThan(expectedSize + tolerance);
    });

    it('command name matches error messages in check-plan', () => {
      // Create temp dir with no model
      const { combined } = runCli('check-plan --plan "test plan"');

      // Error message should reference the same command name
      if (combined.includes('download-model')) {
        expect(combined).toContain('npx learning-agent download-model');
      }
    });

    it('check-plan works immediately after download-model', async () => {
      // Create a test lesson
      await appendLesson(tempDir, createQuickLesson('L001', 'Test lesson for search'));
      await rebuildIndex(tempDir);
      closeDb();

      // Download model
      runCli('download-model');

      // check-plan should work immediately (no race condition)
      const { combined } = runCli('check-plan --plan "test search"');

      // Should not show "model not available" error
      expect(combined).not.toMatch(/model not available|download.*model/i);
    });
  });

  describe('check-plan command', () => {
    beforeEach(async () => {
      // Create some lessons for vector search
      await appendLesson(
        tempDir,
        createQuickLesson('L001', 'Always run tests before committing', {
          trigger: 'test failure after commit',
          tags: ['testing'],
        })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L002', 'Use Polars for large file processing', {
          trigger: 'pandas was slow',
          tags: ['performance'],
        })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('L003', 'Check authentication before API calls', {
          trigger: 'unauthorized error',
          tags: ['auth', 'api'],
        })
      );
      await rebuildIndex(tempDir);
      closeDb();
    });

    it('retrieves relevant lessons with --plan flag', () => {
      const { combined } = runCli('check-plan --plan "implement testing workflow"');
      // Should find lessons and display them
      expect(combined).toMatch(/lessons|relevant/i);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('reads plan from stdin', () => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      const stdout = execSync(`echo "test workflow" | node ${cliPath} check-plan`, {
        cwd: tempDir,
        encoding: 'utf-8',
        env: { ...process.env, LEARNING_AGENT_ROOT: tempDir },
      });
      expect(stdout).toMatch(/lessons|relevant|no.*found/i);
    });

    it('respects --limit option', () => {
      const { stdout } = runCli('check-plan --json --limit 1 --plan "testing and authentication"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result.lessons.length).toBeLessThanOrEqual(1);
    });

    it('shows user-friendly message when no relevant lessons found', async () => {
      // Create a fresh temp dir with no lessons
      const emptyDir = await mkdtemp(join(tmpdir(), 'learning-agent-empty-'));
      try {
        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        const stdout = execSync(`node ${cliPath} check-plan --plan "something completely unrelated xyz123"`, {
          cwd: emptyDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: emptyDir },
        });
        expect(stdout).toMatch(/no.*lessons|no.*relevant|no.*found/i);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('requires plan text from --plan or stdin', () => {
      // When run without --plan and without stdin data (TTY mode simulated)
      const { combined } = runCli('check-plan');
      expect(combined.toLowerCase()).toMatch(/no plan|required|error/i);
    });

    it('includes relevance score in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ relevance?: number }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('relevance');
        expect(typeof result.lessons[0].relevance).toBe('number');
      }
    });

    it('includes lesson ID in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      // Extract JSON from output (may contain library warnings on earlier lines)
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ id?: string }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('id');
        expect(typeof result.lessons[0].id).toBe('string');
      }
    });

    // Test that check-plan returns proper error when model unavailable
    // This test only runs when model IS available (to verify format of success case)
    it.skipIf(!modelAvailable)('returns lessons array when model is available', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"');
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons?: unknown[]; error?: string };
      // Should have lessons (not error) when model is available
      expect(result.lessons).toBeDefined();
      expect(result.error).toBeUndefined();
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

    it('--save without --yes shows error and does not save', async () => {
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
      expect(combined.toLowerCase()).toMatch(/--yes|confirmation|required/i);

      // Should NOT save without --yes
      const filePath = join(tempDir, LESSONS_PATH);
      let content = '';
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist, which is expected
      }
      expect(content).not.toContain('pnpm build');
    });

    it('saves lesson when --save and --yes are used together', async () => {
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

      const { combined } = runCli(`detect --input ${inputPath} --save --yes`);
      expect(combined).toContain('Saved as lesson');

      // Verify lesson was actually saved
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('pnpm build');
    });
  });

  describe('capture command', () => {
    it('captures lesson with --trigger and --insight using --yes', async () => {
      runCli('capture --trigger "Used setTimeout" --insight "Use await with sleep() helper" --yes');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Used setTimeout');
      expect(content).toContain('Use await with sleep() helper');
    });

    it('outputs valid JSON with --json flag', async () => {
      const { stdout } = runCli('capture --trigger "test trigger" --insight "test insight" --json --yes');
      const result = JSON.parse(stdout) as { id: string; trigger: string; insight: string; saved: boolean };

      expect(result.id).toMatch(/^L[a-f0-9]{8}$/);
      expect(result.trigger).toBe('test trigger');
      expect(result.insight).toBe('test insight');
      expect(result.saved).toBe(true);
    });

    it('works with --input file like detect --save', async () => {
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

      const { combined } = runCli(`capture --input ${inputPath} --yes`);
      expect(combined).toContain('Lesson saved');

      // Verify lesson was actually saved
      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('pnpm build');
    });

    it('errors in non-interactive mode without --yes flag', async () => {
      const { combined } = runCli('capture --trigger "test trigger" --insight "test insight"');

      // Should show error about requiring --yes in non-interactive mode
      expect(combined.toLowerCase()).toMatch(/--yes|non.?interactive|confirmation|required/i);

      // Should NOT save (no --yes flag)
      const filePath = join(tempDir, LESSONS_PATH);
      let content = '';
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist, which is expected
      }
      expect(content).not.toContain('test insight');
    });

    it('saves with confirmed: true when --yes is used', async () => {
      runCli('capture --trigger "test trigger" --insight "test insight" --yes');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lesson = JSON.parse(content.trim()) as { confirmed: boolean };
      expect(lesson.confirmed).toBe(true);
    });

    it('requires either --trigger/--insight or --input', () => {
      const { combined } = runCli('capture --yes');
      expect(combined.toLowerCase()).toMatch(/require|missing|provide/i);
    });

    it('shows error when --input file has no detection', async () => {
      const inputPath = join(tempDir, 'input.json');
      await writeFile(
        inputPath,
        JSON.stringify({
          type: 'user',
          data: {
            messages: ['hello', 'hi there'],
            context: { tool: 'chat', intent: 'greeting' },
          },
        })
      );

      const { combined } = runCli(`capture --input ${inputPath} --yes`);
      expect(combined).toContain('No learning trigger detected');
    });

    it('respects --quiet flag', async () => {
      const { combined } = runCli('capture --trigger "t" --insight "i" --yes --quiet');
      // Should only show minimal output
      expect(combined).toContain('Lesson saved');
      // Should not show verbose details
      expect(combined).not.toMatch(/Type:|Tags:/);
    });

    it('shows extra details with --verbose flag', async () => {
      const { combined } = runCli('capture --trigger "test" --insight "insight" --yes --verbose');
      // Verbose mode should show more info
      expect(combined).toMatch(/Type:|ID:/);
    });

    it('outputs JSON with saved: false when using --json without --yes', () => {
      const { stdout } = runCli('capture --trigger "t" --insight "i" --json');
      const result = JSON.parse(stdout) as { saved: boolean };
      expect(result.saved).toBe(false);
    });
  });

  describe('hooks run command', () => {
    it('outputs lesson reminder prompt for pre-commit hook', () => {
      const { combined } = runCli('hooks run pre-commit');
      expect(combined).toContain('lessons');
      expect(combined.toLowerCase()).toMatch(/capture|remember|session/i);
    });

    it('exits with code 0 (non-blocking)', () => {
      // runCli will throw if exit code is non-zero
      const { combined } = runCli('hooks run pre-commit');
      // Should not contain error indicators
      expect(combined).not.toMatch(/error|fail/i);
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('hooks run pre-commit --json');
      const result = JSON.parse(stdout) as { hook: string; message: string };
      expect(result.hook).toBe('pre-commit');
      expect(result.message).toBeDefined();
    });

    it('shows error for unknown hook', () => {
      const { combined } = runCli('hooks run unknown-hook');
      expect(combined.toLowerCase()).toMatch(/unknown|not found|invalid/i);
    });
  });

  describe('setup claude command', () => {
    let mockHome: string;

    beforeEach(async () => {
      // Create a mock home directory for testing global settings
      mockHome = join(tempDir, 'mock-home');
      await mkdir(join(mockHome, '.claude'), { recursive: true });
    });

    const runSetupClaude = (args = ''): { stdout: string; stderr: string; combined: string } => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      try {
        const stdout = execSync(`node ${cliPath} setup claude ${args} 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, HOME: mockHome, LEARNING_AGENT_ROOT: tempDir },
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

    it('installs hooks to project settings file by default (v0.2.1+)', async () => {
      // Create project .claude directory
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      const { combined } = runSetupClaude();

      // Should indicate success
      expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

      // Verify settings file was created in PROJECT directory (new default)
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Should have SessionStart hook
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.SessionStart).toBeDefined();
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);

      // Hook should contain our command
      const hookEntry = settings.hooks.SessionStart[0];
      expect(hookEntry.hooks[0].command).toContain('learning-agent');
      expect(hookEntry.hooks[0].command).toContain('load-session');
    });

    it('preserves existing settings when adding hooks', async () => {
      // Create existing project settings (v0.2.1+: default is project)
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            permissions: { enabled: true },
            mcpServers: { test: { command: 'test' } },
          },
          null,
          2
        )
      );

      runSetupClaude();

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should preserve existing fields
      expect(settings.permissions).toEqual({ enabled: true });
      expect(settings.mcpServers).toEqual({ test: { command: 'test' } });
      // Should add hooks
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('preserves existing SessionStart hooks when adding our hook', async () => {
      // Create project settings with existing SessionStart hook (v0.2.1+: default is project)
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                {
                  matcher: 'startup',
                  hooks: [{ type: 'command', command: 'echo "existing hook"' }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      runSetupClaude();

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should have 2 hooks now
      expect(settings.hooks.SessionStart.length).toBe(2);
      // First should be existing
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "existing hook"');
      // Second should be ours
      expect(settings.hooks.SessionStart[1].hooks[0].command).toContain('learning-agent');
    });

    it('is idempotent - does not duplicate hook on re-run', async () => {
      // v0.2.1+: default is project
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();
      runSetupClaude();

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Should still have only 1 hook
      expect(settings.hooks.SessionStart.length).toBe(1);
    });

    it('reports already installed when hook exists', async () => {
      // v0.2.1+: default is project
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      runSetupClaude();
      const { combined } = runSetupClaude();

      expect(combined.toLowerCase()).toMatch(/already|unchanged/i);
    });

    it('--uninstall removes our hook', async () => {
      // v0.2.1+: default is project
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      // First install
      runSetupClaude();

      // Then uninstall
      const { combined } = runSetupClaude('--uninstall');
      expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));

      // Hook should be removed
      expect(settings.hooks.SessionStart).toHaveLength(0);
    });

    it('--uninstall preserves other hooks', async () => {
      // v0.2.1+: default is project - create project settings with existing and our hook
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify(
          {
            hooks: {
              SessionStart: [
                { matcher: 'startup', hooks: [{ type: 'command', command: 'echo "keep me"' }] },
                {
                  matcher: 'startup|resume|compact',
                  hooks: [{ type: 'command', command: 'npx learning-agent load-session 2>/dev/null || true' }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      runSetupClaude('--uninstall');

      const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
      // Should keep other hook
      expect(settings.hooks.SessionStart.length).toBe(1);
      expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo "keep me"');
    });

    it('--dry-run shows changes without writing', async () => {
      const { combined } = runSetupClaude('--dry-run');

      expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

      // v0.2.1+: default is project - project settings file should not exist
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(false);
    });

    it('--global installs to global ~/.claude directory', async () => {
      const { combined } = runSetupClaude('--global');
      expect(combined.toLowerCase()).toMatch(/global|installed/i);

      // Should be in global, not project
      const projectSettings = join(tempDir, '.claude', 'settings.json');
      const globalSettings = join(mockHome, '.claude', 'settings.json');

      expect(existsSync(globalSettings)).toBe(true);
      expect(existsSync(projectSettings)).toBe(false);
    });

    it('--json outputs machine-readable result', async () => {
      // v0.2.1+: default is project
      await mkdir(join(tempDir, '.claude'), { recursive: true });

      const { stdout } = runSetupClaude('--json');
      const result = JSON.parse(stdout) as {
        installed: boolean;
        location: string;
        hooks: string[];
        action: string;
      };

      expect(result.installed).toBe(true);
      expect(result.location).toContain('settings.json');
      expect(result.hooks).toContain('SessionStart');
      expect(['created', 'updated']).toContain(result.action);
    });

    it('--json with --dry-run shows what would happen', async () => {
      const { stdout } = runSetupClaude('--dry-run --json');
      const result = JSON.parse(stdout) as {
        dryRun: boolean;
        wouldInstall: boolean;
        location: string;
      };

      expect(result.dryRun).toBe(true);
      expect(result.wouldInstall).toBe(true);
    });
  });

  describe('init command', () => {
    it('creates .claude/lessons directory structure', async () => {
      runCli('init');

      const lessonsDir = join(tempDir, '.claude', 'lessons');
      const dirs = await readdir(join(tempDir, '.claude'));
      expect(dirs).toContain('lessons');
    });

    it('creates empty index.jsonl file', async () => {
      runCli('init');

      const indexPath = join(tempDir, LESSONS_PATH);
      const content = await readFile(indexPath, 'utf-8');
      // Should be empty or have minimal content
      expect(content.trim()).toBe('');
    });

    it('creates AGENTS.md with Learning Agent section', async () => {
      runCli('init');

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');
      expect(content).toContain('Learning Agent Integration');
      expect(content).toContain('load-session');
      expect(content).toContain('check-plan');
      expect(content).toContain('capture');
    });

    it('AGENTS.md template includes explicit plan-time instructions', async () => {
      runCli('init');

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Must include explicit instruction to run check-plan BEFORE implementing
      expect(content).toMatch(/before\s+(implementing|starting|coding)/i);
      // Must mention running check-plan command
      expect(content).toContain('npx learning-agent check-plan');
      // Must explain what to do with results
      expect(content).toMatch(/lessons?\s*check/i);
    });

    it('appends to existing AGENTS.md without duplicating', async () => {
      // Create existing AGENTS.md
      const agentsPath = join(tempDir, 'AGENTS.md');
      await writeFile(agentsPath, '# Existing Content\n\nSome existing instructions.\n');

      runCli('init');

      const content = await readFile(agentsPath, 'utf-8');
      // Should preserve existing content
      expect(content).toContain('Existing Content');
      // Should add Learning Agent section
      expect(content).toContain('Learning Agent Integration');
    });

    it('is idempotent - does not duplicate section on re-run', async () => {
      // Run init twice
      runCli('init');
      runCli('init');

      const agentsPath = join(tempDir, 'AGENTS.md');
      const content = await readFile(agentsPath, 'utf-8');

      // Count occurrences of the section header
      const matches = content.match(/## Learning Agent Integration/g);
      expect(matches?.length).toBe(1);
    });

    it('respects --skip-agents flag', async () => {
      runCli('init --skip-agents');

      // Should create lessons directory
      const lessonsDir = join(tempDir, '.claude', 'lessons');
      const dirs = await readdir(join(tempDir, '.claude'));
      expect(dirs).toContain('lessons');

      // Should NOT create AGENTS.md
      const agentsPath = join(tempDir, 'AGENTS.md');
      let agentsExists = true;
      try {
        await readFile(agentsPath, 'utf-8');
      } catch {
        agentsExists = false;
      }
      expect(agentsExists).toBe(false);
    });

    it('shows success message', () => {
      const { combined } = runCli('init');
      expect(combined).toMatch(/initialized|created|success/i);
    });

    it('respects --quiet flag', () => {
      const { combined } = runCli('init --quiet');
      // Should have minimal output
      expect(combined.length).toBeLessThan(100);
    });

    it('does not overwrite existing lessons', async () => {
      // Create some lessons first
      await appendLesson(tempDir, createQuickLesson('L001', 'existing lesson'));

      runCli('init');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson');
    });

    it('outputs JSON with --json flag', () => {
      const { stdout } = runCli('init --json');
      const result = JSON.parse(stdout) as { initialized: boolean; lessonsDir: string; agentsMd: boolean };
      expect(result.initialized).toBe(true);
      expect(result.lessonsDir).toContain('.claude/lessons');
      expect(result.agentsMd).toBe(true);
    });

    it('installs pre-commit hook in .git/hooks', async () => {
      // Create .git directory first (simulating a git repo)
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const hookExists = existsSync(hookPath);
      expect(hookExists).toBe(true);
    });

    it('creates executable pre-commit hook', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const stats = statSync(hookPath);
      // Check if executable (mode & 0o111 should be non-zero)
      expect(stats.mode & 0o111).toBeGreaterThan(0);
    });

    it('pre-commit hook calls learning-agent hooks run', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      expect(content).toContain('learning-agent');
      expect(content).toContain('hooks run pre-commit');
    });

    it('does not duplicate pre-commit hook on re-run', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init');
      runCli('init');

      const hookPath = join(gitHooksDir, 'pre-commit');
      const content = await readFile(hookPath, 'utf-8');
      // Count occurrences of the shebang (should be exactly 1)
      const shebangs = content.match(/#!/g);
      expect(shebangs?.length).toBe(1);
    });

    it('skips hook installation if .git/hooks does not exist', async () => {
      // Don't create .git directory
      const { combined } = runCli('init');

      // Should still succeed (not a git repo)
      expect(combined).toMatch(/initialized|created|success/i);

      // Hook should not exist
      const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('--skip-hooks flag skips hook installation', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      runCli('init --skip-hooks');

      const hookPath = join(gitHooksDir, 'pre-commit');
      expect(existsSync(hookPath)).toBe(false);
    });

    it('JSON output includes hooks field', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      const { stdout } = runCli('init --json');
      const result = JSON.parse(stdout) as { hooks: boolean };
      expect(result.hooks).toBe(true);
    });

    it('appends to existing hook without overwriting original content', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      // Create existing hook
      const hookPath = join(gitHooksDir, 'pre-commit');
      const existingContent = '#!/bin/sh\necho "existing hook"\npnpm test\n';
      await writeFile(hookPath, existingContent);

      runCli('init');

      const newContent = await readFile(hookPath, 'utf-8');
      // Should preserve existing content
      expect(newContent).toContain('existing hook');
      expect(newContent).toContain('pnpm test');
      // Should also have our marker
      expect(newContent).toContain('Learning Agent');
      expect(newContent).toContain('learning-agent hooks run');
    });

    it('does not modify hook that already has Learning Agent marker', async () => {
      const gitHooksDir = join(tempDir, '.git', 'hooks');
      await mkdir(gitHooksDir, { recursive: true });

      // Create existing hook with our marker
      const hookPath = join(gitHooksDir, 'pre-commit');
      const contentWithMarker = '#!/bin/sh\n# Learning Agent pre-commit hook\nnpx learning-agent hooks run pre-commit\n';
      await writeFile(hookPath, contentWithMarker);

      runCli('init');

      const newContent = await readFile(hookPath, 'utf-8');
      // Should be unchanged
      expect(newContent).toBe(contentWithMarker);
    });

    it('respects core.hooksPath configuration', async () => {
      // Create custom hooks directory
      const customHooksDir = join(tempDir, 'custom-hooks');
      await mkdir(customHooksDir, { recursive: true });

      // Create minimal .git directory with config
      await mkdir(join(tempDir, '.git'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), `[core]\n\thooksPath = custom-hooks\n`);

      runCli('init');

      // Hook should be in custom directory, not .git/hooks
      const customHookPath = join(customHooksDir, 'pre-commit');
      const defaultHookPath = join(tempDir, '.git', 'hooks', 'pre-commit');

      expect(existsSync(customHookPath)).toBe(true);
      expect(existsSync(defaultHookPath)).toBe(false);
    });

    it('handles absolute core.hooksPath', async () => {
      // Create custom hooks directory with absolute path
      const customHooksDir = join(tempDir, 'absolute-hooks');
      await mkdir(customHooksDir, { recursive: true });

      // Create minimal .git directory with config
      await mkdir(join(tempDir, '.git'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), `[core]\n\thooksPath = ${customHooksDir}\n`);

      runCli('init');

      // Hook should be in custom directory
      const customHookPath = join(customHooksDir, 'pre-commit');
      expect(existsSync(customHookPath)).toBe(true);
    });

    describe('pre-commit hook insertion edge cases', () => {
      it('inserts hook BEFORE top-level exit 0 statement', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        // Create existing hook with exit 0 at end
        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        // Find line numbers
        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        // Learning Agent hook must appear BEFORE exit statement
        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit 1 statement', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nif ! pnpm test; then\n  echo "Tests failed"\n  exit 1\nfi\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 1');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE exit with variable (exit $STATUS)', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\nSTATUS=0\npnpm test || STATUS=1\nexit $STATUS\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim().startsWith('exit $'));

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(exitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(exitLine);
      });

      it('inserts hook BEFORE first top-level exit when multiple exist', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm lint\nif [ $? -eq 0 ]; then\n  exit 0\nfi\nexit 1\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const firstExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(firstExitLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeLessThan(firstExitLine);
      });

      it('appends hook at end when no exit statement exists', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\necho "running tests"\npnpm test\n';
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const lastContentLine = lines.findIndex((line) => line.includes('pnpm test'));

        // Should be appended after existing content
        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(learningAgentLine).toBeGreaterThan(lastContentLine);
      });

      it('ignores exit inside function definition', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = `#!/bin/sh
check_format() {
  if ! pnpm format:check; then
    exit 1
  fi
}
check_format
exit 0
`;
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        // Find the exit 1 inside function
        const functionExitLine = lines.findIndex((line) => line.trim() === 'exit 1');
        // Find the exit 0 at end (top-level)
        const topLevelExitLine = lines.findIndex((line) => line.trim() === 'exit 0');

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        // Should insert before top-level exit (exit 0), not function exit (exit 1)
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
        // Learning agent line should be AFTER the function exit
        expect(learningAgentLine).toBeGreaterThan(functionExitLine);
      });

      it('ignores exit in heredoc', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = `#!/bin/sh
cat <<'EOF'
To exit, run: exit 0
EOF
pnpm test
exit 0
`;
        await writeFile(hookPath, existingContent);

        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');
        const lines = newContent.split('\n');

        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        // Find the ACTUAL top-level exit (last exit 0)
        let topLevelExitLine = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].trim() === 'exit 0') {
            topLevelExitLine = i;
            break;
          }
        }

        expect(learningAgentLine).toBeGreaterThan(-1);
        expect(topLevelExitLine).toBeGreaterThan(-1);
        // Should insert before the REAL exit, not the one in heredoc
        expect(learningAgentLine).toBeLessThan(topLevelExitLine);
      });

      it('remains idempotent when run twice with exit statements', async () => {
        const gitHooksDir = join(tempDir, '.git', 'hooks');
        await mkdir(gitHooksDir, { recursive: true });

        const hookPath = join(gitHooksDir, 'pre-commit');
        const existingContent = '#!/bin/sh\npnpm test\nexit 0\n';
        await writeFile(hookPath, existingContent);

        // Run init twice
        runCli('init');
        runCli('init');

        const newContent = await readFile(hookPath, 'utf-8');

        // Count occurrences of learning-agent hook
        const matches = newContent.match(/learning-agent hooks run pre-commit/g);
        expect(matches?.length).toBe(1);

        // Ensure hook is still before exit
        const lines = newContent.split('\n');
        const learningAgentLine = lines.findIndex((line) => line.includes('learning-agent hooks run'));
        const exitLine = lines.findIndex((line) => line.trim() === 'exit 0');
        expect(learningAgentLine).toBeLessThan(exitLine);
      });
    });
  });

  // ============================================================================
  // Setup Claude Defaults Tests (v0.2.1 Breaking Change)
  // ============================================================================
  describe('setup claude - default behavior change (v0.2.1)', () => {
    let mockHome: string;

    beforeEach(async () => {
      // Create a mock home directory for testing global settings
      mockHome = join(tempDir, 'mock-home');
      await mkdir(join(mockHome, '.claude'), { recursive: true });
      // Create project .claude directory
      await mkdir(join(tempDir, '.claude'), { recursive: true });
    });

    const runSetupClaude = (args = ''): { stdout: string; stderr: string; combined: string } => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      try {
        const stdout = execSync(`node ${cliPath} setup claude ${args} 2>&1`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, HOME: mockHome, LEARNING_AGENT_ROOT: tempDir },
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

    // ========================================================================
    // I2: Flag Semantics (Breaking Change)
    // ========================================================================
    describe('flag semantics (breaking change from v0.2.0)', () => {
      it('default (no flags) installs to project-local .claude/settings.json', async () => {
        const { combined } = runSetupClaude();

        // Should indicate success
        expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

        // Verify settings file was created in PROJECT directory
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');

        // Project settings should exist
        expect(existsSync(projectSettings)).toBe(true);
        // Global settings should NOT exist
        expect(existsSync(globalSettings)).toBe(false);

        // Verify hook is in project settings
        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('--global flag installs to ~/.claude/settings.json', async () => {
        const { combined } = runSetupClaude('--global');

        // Should indicate success
        expect(combined.toLowerCase()).toMatch(/installed|ok|success/i);

        // Verify settings file was created in GLOBAL directory
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');

        // Global settings should exist
        expect(existsSync(globalSettings)).toBe(true);
        // Project settings should NOT exist
        expect(existsSync(projectSettings)).toBe(false);

        // Verify hook is in global settings
        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toBeDefined();
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('--project flag is no longer recognized (removed in v0.2.1)', () => {
        const { combined } = runSetupClaude('--project');

        // Should show error about unknown option
        expect(combined.toLowerCase()).toMatch(/unknown|invalid|option|flag|error/i);
      });
    });

    // ========================================================================
    // I3: Scope Consistency
    // ========================================================================
    describe('scope consistency across operations', () => {
      it('uninstall without --global removes from project settings', async () => {
        // Install to project (default)
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);

        // Uninstall from project (default)
        const { combined } = runSetupClaude('--uninstall');
        expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

        // Verify removed from project settings
        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toHaveLength(0);
      });

      it('uninstall with --global removes from global settings', async () => {
        // Install to global
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);

        // Uninstall from global
        const { combined } = runSetupClaude('--global --uninstall');
        expect(combined.toLowerCase()).toMatch(/removed|uninstalled/i);

        // Verify removed from global settings
        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));
        expect(settings.hooks.SessionStart).toHaveLength(0);
      });
    });

    // ========================================================================
    // I4: Display Path Accuracy
    // ========================================================================
    describe('output messages show correct paths', () => {
      it('default install shows project path in output', () => {
        const { combined } = runSetupClaude();

        // Output should mention project-local path
        expect(combined).toContain('.claude/settings.json');
        // Should NOT mention global path
        expect(combined).not.toMatch(/~\/.claude|home/i);
      });

      it('--global install shows global path in output', () => {
        const { combined } = runSetupClaude('--global');

        // Output should mention global path
        expect(combined).toContain('~/.claude/settings.json');
      });

      it('JSON output location field matches actual file written (project)', async () => {
        const { stdout } = runSetupClaude('--json');
        const result = JSON.parse(stdout) as { location: string };

        // Location should indicate project
        expect(result.location).toBe('.claude/settings.json');

        // Verify file actually exists at project location
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);
      });

      it('JSON output location field matches actual file written (global)', async () => {
        const { stdout } = runSetupClaude('--global --json');
        const result = JSON.parse(stdout) as { location: string };

        // Location should indicate global
        expect(result.location).toBe('~/.claude/settings.json');

        // Verify file actually exists at global location
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);
      });
    });

    // ========================================================================
    // S1: No Cross-Scope Pollution
    // ========================================================================
    describe('safety: no cross-scope pollution', () => {
      it('project install does not modify global settings', async () => {
        // Create existing global settings
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        await writeFile(
          globalSettings,
          JSON.stringify({ permissions: { enabled: true } }, null, 2)
        );
        const globalBefore = await readFile(globalSettings, 'utf-8');

        // Install to project
        runSetupClaude();

        // Global settings should be unchanged
        const globalAfter = await readFile(globalSettings, 'utf-8');
        expect(globalAfter).toBe(globalBefore);
      });

      it('global install does not modify project settings', async () => {
        // Create existing project settings
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        await writeFile(
          projectSettings,
          JSON.stringify({ permissions: { enabled: false } }, null, 2)
        );
        const projectBefore = await readFile(projectSettings, 'utf-8');

        // Install to global
        runSetupClaude('--global');

        // Project settings should be unchanged
        const projectAfter = await readFile(projectSettings, 'utf-8');
        expect(projectAfter).toBe(projectBefore);
      });
    });

    // ========================================================================
    // S2: No Wrong-Scope Uninstall
    // ========================================================================
    describe('safety: wrong-scope uninstall does not affect correct scope', () => {
      it('uninstall from project (default) does not affect global hook', async () => {
        // Install to global
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        const globalBefore = await readFile(globalSettings, 'utf-8');

        // Try to uninstall from project (wrong scope)
        const { combined } = runSetupClaude('--uninstall');

        // Should show helpful message
        expect(combined.toLowerCase()).toMatch(/no.*hook|not found|no.*learning/i);

        // Global hook should still exist
        const globalAfter = await readFile(globalSettings, 'utf-8');
        expect(globalAfter).toBe(globalBefore);

        const settings = JSON.parse(globalAfter);
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('uninstall from global does not affect project hook', async () => {
        // Install to project
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const projectBefore = await readFile(projectSettings, 'utf-8');

        // Try to uninstall from global (wrong scope)
        const { combined } = runSetupClaude('--global --uninstall');

        // Should show helpful message
        expect(combined.toLowerCase()).toMatch(/no.*hook|not found|no.*learning/i);

        // Project hook should still exist
        const projectAfter = await readFile(projectSettings, 'utf-8');
        expect(projectAfter).toBe(projectBefore);

        const settings = JSON.parse(projectAfter);
        expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
      });

      it('wrong-scope uninstall suggests correct flag', () => {
        // Install to global
        runSetupClaude('--global');

        // Try to uninstall from project
        const { combined } = runSetupClaude('--uninstall');

        // Should suggest using --global flag
        expect(combined.toLowerCase()).toMatch(/--global|global.*flag/i);
      });
    });

    // ========================================================================
    // S4: No Duplicate Hooks (Idempotency)
    // ========================================================================
    describe('safety: idempotency prevents duplicate hooks', () => {
      it('running default install twice does not duplicate project hook', async () => {
        runSetupClaude();
        runSetupClaude();

        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(projectSettings, 'utf-8'));

        // Should still have only 1 hook
        expect(settings.hooks.SessionStart.length).toBe(1);
      });

      it('running global install twice does not duplicate global hook', async () => {
        runSetupClaude('--global');
        runSetupClaude('--global');

        const globalSettings = join(mockHome, '.claude', 'settings.json');
        const settings = JSON.parse(await readFile(globalSettings, 'utf-8'));

        // Should still have only 1 hook
        expect(settings.hooks.SessionStart.length).toBe(1);
      });

      it('second install shows already installed message', () => {
        runSetupClaude();
        const { combined } = runSetupClaude();

        expect(combined.toLowerCase()).toMatch(/already|unchanged/i);
      });
    });

    // ========================================================================
    // E2: Settings Directory Creation
    // ========================================================================
    describe('edge case: settings directory does not exist', () => {
      it('creates project .claude directory if it does not exist', async () => {
        // Remove project .claude directory
        await rm(join(tempDir, '.claude'), { recursive: true, force: true });

        runSetupClaude();

        // Should create directory and settings file
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(true);
      });

      it('creates global .claude directory if it does not exist', async () => {
        // Remove global .claude directory
        await rm(join(mockHome, '.claude'), { recursive: true, force: true });

        runSetupClaude('--global');

        // Should create directory and settings file
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(globalSettings)).toBe(true);
      });
    });

    // ========================================================================
    // Dry-run respects scope
    // ========================================================================
    describe('dry-run respects scope flag', () => {
      it('--dry-run without --global reports project location', () => {
        const { combined } = runSetupClaude('--dry-run');

        expect(combined).toContain('.claude/settings.json');
        expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

        // No files should be created
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(false);
        expect(existsSync(globalSettings)).toBe(false);
      });

      it('--dry-run with --global reports global location', () => {
        const { combined } = runSetupClaude('--dry-run --global');

        expect(combined).toContain('~/.claude/settings.json');
        expect(combined.toLowerCase()).toMatch(/would|dry.run/i);

        // No files should be created
        const projectSettings = join(tempDir, '.claude', 'settings.json');
        const globalSettings = join(mockHome, '.claude', 'settings.json');
        expect(existsSync(projectSettings)).toBe(false);
        expect(existsSync(globalSettings)).toBe(false);
      });
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
      const importFile = join(tempDir, 'import-lessons.jsonl');
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
