/**
 * Tests for management commands: export, compact, import, stats, wrong, validate, rebuild,
 *                                show, update, delete
 */

import { execSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { ARCHIVE_DIR } from '../storage/compact.js';
import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { closeDb, rebuildIndex } from '../storage/sqlite.js';
import { createFullLesson, createQuickLesson, daysAgo } from '../test-utils.js';
import { setupCliTestContext } from './test-helpers.js';

describe('Management Commands', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  describe('export command', () => {
    beforeEach(async () => {
      // Lessons with different dates and tags
      await appendLesson(
        getTempDir(),
        createQuickLesson('L001', 'first lesson', { tags: ['typescript', 'testing'], created: '2024-01-15T10:00:00Z' })
      );
      await appendLesson(
        getTempDir(),
        createQuickLesson('L002', 'second lesson', { tags: ['python'], created: '2024-02-20T10:00:00Z' })
      );
      await appendLesson(
        getTempDir(),
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
        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        const result = execSync(`node ${cliPath} export`, {
          cwd: emptyDir,
          encoding: 'utf-8',
          env: { ...process.env, LEARNING_AGENT_ROOT: emptyDir },
        });
        const exported = JSON.parse(result);
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
      const filePath = join(getTempDir(), LESSONS_PATH);
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
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact');
      expect(combined).toContain('Compaction not needed');
      expect(combined).toContain('0 tombstones');
    });

    it('runs with --force even when below threshold', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Running compaction');
      expect(combined).toContain('Compaction complete');
      expect(combined).toContain('Lessons remaining: 1');
    });

    it('shows dry-run output without making changes', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));
      // Add a tombstone
      await appendLesson(getTempDir(), { ...createQuickLesson('L002', 'deleted'), deleted: true });

      const { combined } = runCli('compact --dry-run');
      expect(combined).toContain('Dry run');
      expect(combined).toContain('Tombstones found: 1');

      // Verify no changes were made - file should still have tombstone
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('"deleted":true');
    });

    it('archives old lessons with force flag', async () => {
      // Create an old lesson (100 days ago, no retrievals)
      const oldDate = daysAgo(100);
      await appendLesson(getTempDir(), createQuickLesson('L001', 'old lesson', { created: oldDate }));
      // And a recent lesson
      await appendLesson(getTempDir(), createQuickLesson('L002', 'new lesson'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Archived: 1 lesson');
      expect(combined).toContain('Lessons remaining: 1');

      // Verify archive file was created
      const archiveDir = join(getTempDir(), ARCHIVE_DIR);
      const archives = await readdir(archiveDir);
      expect(archives.length).toBeGreaterThan(0);
    });

    it('removes tombstones with force flag', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'keep'));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'delete me'));
      await appendLesson(getTempDir(), { ...createQuickLesson('L002', 'delete me'), deleted: true });

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Tombstones removed:');
      expect(combined).toContain('Lessons remaining: 1');

      // Verify tombstone was removed from file
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).not.toContain('"deleted":true');
      expect(content).toContain('L001');
      expect(content).not.toContain('L002');
    });

    it('rebuilds index after compaction', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test'));

      const { combined } = runCli('compact --force');
      expect(combined).toContain('Index rebuilt');
    });
  });

  describe('import command', () => {
    it('imports lessons from a JSONL file', async () => {
      // Create source file with lessons to import
      const sourceFile = join(getTempDir(), 'import-source.jsonl');
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
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('IMP1');
      expect(content).toContain('IMP2');
    });

    it('skips lessons with duplicate IDs', async () => {
      // Add existing lesson
      await appendLesson(getTempDir(), createQuickLesson('EXIST1', 'existing lesson'));

      // Create source file with duplicate and new lesson
      const sourceFile = join(getTempDir(), 'import-source.jsonl');
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
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson'); // Original preserved
      expect(content).toContain('NEW1'); // New added
    });

    it('reports invalid lessons that fail schema validation', async () => {
      const sourceFile = join(getTempDir(), 'import-source.jsonl');
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
      const sourceFile = join(getTempDir(), 'empty.jsonl');
      await writeFile(sourceFile, '');

      const { combined } = runCli(`import ${sourceFile}`);
      expect(combined).toContain('Imported 0 lessons');
    });

    it('shows summary with all counts', async () => {
      // Add existing lesson
      await appendLesson(getTempDir(), createQuickLesson('EXIST1', 'existing'));

      const sourceFile = join(getTempDir(), 'import-source.jsonl');
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

  describe('stats command', () => {
    it('shows stats for empty database', () => {
      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 0 total');
      expect(combined).toContain('Retrievals: 0 total');
    });

    it('shows correct counts with mixed lesson types', async () => {
      // Add active lessons
      await appendLesson(getTempDir(), createQuickLesson('L001', 'first lesson'));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'second lesson'));
      // Add deleted lesson (tombstone)
      await appendLesson(getTempDir(), { ...createQuickLesson('L003', 'deleted lesson'), deleted: true });
      // Rebuild index to include lessons
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 2 total');
      expect(combined).toContain('1 deleted');
    });

    it('handles missing database gracefully', async () => {
      // Add a lesson so JSONL exists but no database yet
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));

      const { combined } = runCli('stats');
      // Should still work - stats command syncs index if needed
      expect(combined).toContain('Lessons: 1 total');
    });

    it('shows storage size info', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toMatch(/Storage:/);
      expect(combined).toMatch(/KB|B/); // Size units
    });

    it('shows retrieval statistics', async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'searchable lesson'));
      await rebuildIndex(getTempDir());
      // Trigger a retrieval by searching
      closeDb(); // Close so search opens fresh connection
      runCli('search "searchable"');
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toMatch(/Retrievals:/);
    });

    it('shows no warning when lesson count is 20 or below', async () => {
      // Add exactly 20 lessons
      for (let i = 1; i <= 20; i++) {
        await appendLesson(getTempDir(), createQuickLesson(`L${String(i).padStart(3, '0')}`, `lesson ${i}`));
      }
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 20 total');
      expect(combined).not.toMatch(/warn|consider.*compact/i);
    });

    it('shows warning when lesson count exceeds 20', async () => {
      // Add 21 lessons to trigger warning
      for (let i = 1; i <= 21; i++) {
        await appendLesson(getTempDir(), createQuickLesson(`L${String(i).padStart(3, '0')}`, `lesson ${i}`));
      }
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('stats');
      expect(combined).toContain('Lessons: 21 total');
      expect(combined).toMatch(/warn|consider.*compact/i);
    });

    it('shows age distribution when lessons exist', async () => {
      // Add lessons of different ages
      await appendLesson(getTempDir(), createQuickLesson('L001', 'recent lesson', { created: daysAgo(10) }));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'medium lesson', { created: daysAgo(45) }));
      await appendLesson(getTempDir(), createQuickLesson('L003', 'older lesson', { created: daysAgo(100) }));
      await rebuildIndex(getTempDir());
      closeDb();

      const { combined } = runCli('stats');
      // Should show age distribution with counts for each bracket
      expect(combined).toMatch(/Age:/i);
      expect(combined).toMatch(/<30d|30-90d|>90d/i);
    });
  });

  describe('wrong command', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('L001', 'first lesson'));
      await appendLesson(getTempDir(), createQuickLesson('L002', 'second lesson'));
    });

    it('marks a lesson as invalid', async () => {
      const { combined } = runCli('wrong L001');
      expect(combined).toMatch(/invalidated|marked.*invalid/i);

      // Verify the lesson has invalidatedAt set
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('invalidatedAt');
    });

    it('accepts --reason option', async () => {
      const { combined } = runCli('wrong L001 --reason "This lesson was incorrect"');
      expect(combined).toMatch(/invalidated|marked.*invalid/i);

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('This lesson was incorrect');
    });

    it('shows error for non-existent lesson', () => {
      const { combined } = runCli('wrong LNONEXISTENT');
      expect(combined.toLowerCase()).toMatch(/not found|does not exist|error/i);
    });

    it('requires lesson ID argument', () => {
      const { combined } = runCli('wrong');
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });
  });

  describe('validate command', () => {
    beforeEach(async () => {
      // Create an invalidated lesson
      const invalidatedLesson = {
        ...createQuickLesson('L001', 'invalidated lesson'),
        invalidatedAt: '2026-01-30T12:00:00Z',
        invalidationReason: 'Was incorrect',
      };
      await appendLesson(getTempDir(), invalidatedLesson);
      await appendLesson(getTempDir(), createQuickLesson('L002', 'normal lesson'));
    });

    it('removes invalidation from a lesson', async () => {
      const { combined } = runCli('validate L001');
      expect(combined).toMatch(/validated|restored|re-enabled/i);
    });

    it('shows error for non-existent lesson', () => {
      const { combined } = runCli('validate LNONEXISTENT');
      expect(combined.toLowerCase()).toMatch(/not found|does not exist|error/i);
    });

    it('requires lesson ID argument', () => {
      const { combined } = runCli('validate');
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });
  });

  // ==========================================================================
  // CRUD Commands: show, update, delete
  // ==========================================================================

  describe('show command', () => {
    beforeEach(async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('SHOW001', 'API requires X-Request-ID header', 'high', {
          trigger: 'API returned 401 despite valid token',
          evidence: 'Traced in network tab, header missing',
          tags: ['api', 'auth'],
        })
      );
      await appendLesson(
        getTempDir(),
        createQuickLesson('SHOW002', 'Use Polars for large files', {
          tags: ['python', 'performance'],
        })
      );
    });

    it('show <id> displays lesson in human-readable format', () => {
      const { combined } = runCli('show SHOW001');
      expect(combined).toContain('SHOW001');
      expect(combined).toContain('API requires X-Request-ID header');
      expect(combined).toContain('API returned 401 despite valid token');
      expect(combined).toContain('high');
      expect(combined).toContain('api');
      expect(combined).toContain('auth');
    });

    it('show <id> --json outputs JSON', () => {
      const { stdout } = runCli('show SHOW001 --json');
      const lesson = JSON.parse(stdout) as { id: string; insight: string; severity: string };
      expect(lesson.id).toBe('SHOW001');
      expect(lesson.insight).toBe('API requires X-Request-ID header');
      expect(lesson.severity).toBe('high');
    });

    it('show non-existent ID returns error', () => {
      const { combined } = runCli('show L99999999');
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('show deleted lesson shows deleted status', async () => {
      // Create a tombstone for deleted lesson
      await appendLesson(getTempDir(), { id: 'SHOW003', deleted: true, deletedAt: new Date().toISOString() } as any);

      const { combined } = runCli('show SHOW003');
      expect(combined.toLowerCase()).toMatch(/not found|deleted/i);
    });

    it('show includes all lesson fields (insight, trigger, severity, tags, etc.)', () => {
      const { combined } = runCli('show SHOW001');
      expect(combined).toContain('SHOW001'); // ID
      expect(combined).toContain('API requires X-Request-ID header'); // Insight
      expect(combined).toContain('API returned 401 despite valid token'); // Trigger
      expect(combined).toContain('high'); // Severity
      expect(combined).toContain('Traced in network tab'); // Evidence
      expect(combined).toContain('api'); // Tags
      expect(combined).toContain('auth'); // Tags
    });
  });

  describe('update command', () => {
    beforeEach(async () => {
      await appendLesson(
        getTempDir(),
        createFullLesson('UPD001', 'Original insight', 'medium', {
          trigger: 'Original trigger',
          evidence: 'Original evidence',
          tags: ['original', 'tag'],
        })
      );
      await appendLesson(
        getTempDir(),
        createQuickLesson('UPD002', 'Quick lesson insight', {
          tags: ['quick'],
        })
      );
    });

    it('update <id> --insight "new" changes insight', async () => {
      runCli('update UPD001 --insight "Updated insight text"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Last line should be the updated lesson
      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; insight: string };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.insight).toBe('Updated insight text');
    });

    it('update <id> --severity high changes severity', async () => {
      runCli('update UPD001 --severity high');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; severity: string };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.severity).toBe('high');
    });

    it('update <id> --tags "a,b" sets tags array', async () => {
      runCli('update UPD001 --tags "api,auth,security"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; tags: string[] };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.tags).toEqual(['api', 'auth', 'security']);
    });

    it('update <id> --confirmed true sets confirmed', async () => {
      // First create an unconfirmed lesson
      await appendLesson(
        getTempDir(),
        createQuickLesson('UPD003', 'Unconfirmed lesson', { confirmed: false })
      );

      runCli('update UPD003 --confirmed true');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; confirmed: boolean };
      expect(updatedLesson.id).toBe('UPD003');
      expect(updatedLesson.confirmed).toBe(true);
    });

    it('update <id> --json outputs JSON', () => {
      const { stdout } = runCli('update UPD001 --insight "New insight" --json');
      const lesson = JSON.parse(stdout) as { id: string; insight: string };
      expect(lesson.id).toBe('UPD001');
      expect(lesson.insight).toBe('New insight');
    });

    it('update non-existent ID returns error', () => {
      const { combined } = runCli('update L99999999 --insight "test"');
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('update with invalid severity returns error with valid options', () => {
      const { combined } = runCli('update UPD001 --severity invalid');
      expect(combined.toLowerCase()).toMatch(/invalid|must be/i);
      expect(combined).toMatch(/high|medium|low/i);
    });

    it('update deleted lesson returns error', async () => {
      // Create a deleted lesson
      await appendLesson(getTempDir(), { id: 'UPD004', deleted: true, deletedAt: new Date().toISOString() } as any);

      const { combined } = runCli('update UPD004 --insight "Cannot update deleted"');
      expect(combined.toLowerCase()).toMatch(/deleted|not found/i);
    });

    it('update preserves other fields not being updated', async () => {
      runCli('update UPD001 --insight "New insight only"');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as {
        id: string;
        insight: string;
        trigger: string;
        evidence: string;
        tags: string[];
        severity: string;
      };

      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.insight).toBe('New insight only');
      // Other fields preserved
      expect(updatedLesson.trigger).toBe('Original trigger');
      expect(updatedLesson.evidence).toBe('Original evidence');
      expect(updatedLesson.tags).toEqual(['original', 'tag']);
      expect(updatedLesson.severity).toBe('medium');
    });

    it('update auto-syncs to SQLite (lesson searchable after)', async () => {
      // Update the insight to something searchable
      runCli('update UPD001 --insight "Use PostgreSQL for structured data"');
      closeDb();

      // Search should find updated content
      const { combined } = runCli('search "PostgreSQL"');
      expect(combined).toContain('PostgreSQL');
    });
  });

  describe('delete command', () => {
    beforeEach(async () => {
      await appendLesson(getTempDir(), createQuickLesson('DEL001', 'First lesson to delete'));
      await appendLesson(getTempDir(), createQuickLesson('DEL002', 'Second lesson to delete'));
      await appendLesson(getTempDir(), createQuickLesson('DEL003', 'Third lesson to delete'));
    });

    it('delete <id> creates canonical tombstone record', async () => {
      runCli('delete DEL001');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Last line should be tombstone
      const tombstone = JSON.parse(lines[lines.length - 1]) as {
        id: string;
        deleted: boolean;
        deletedAt: string;
      };

      expect(tombstone.id).toBe('DEL001');
      expect(tombstone.deleted).toBe(true);
      expect(tombstone.deletedAt).toBeDefined();
      expect(new Date(tombstone.deletedAt).getTime()).toBeGreaterThan(0); // Valid ISO date
      // Canonical tombstone should ONLY have id, deleted, deletedAt (not full lesson copy)
      expect(Object.keys(tombstone).sort()).toEqual(['deleted', 'deletedAt', 'id']);
    });

    it('delete <id> --json outputs JSON', () => {
      const { stdout } = runCli('delete DEL001 --json');
      const result = JSON.parse(stdout) as { deleted: string[] };
      expect(result.deleted).toContain('DEL001');
    });

    it('delete L001 L002 deletes multiple', async () => {
      runCli('delete DEL001 DEL002');

      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Last two lines should be tombstones
      const secondToLast = JSON.parse(lines[lines.length - 2]) as { id: string; deleted: boolean };
      const last = JSON.parse(lines[lines.length - 1]) as { id: string; deleted: boolean };

      expect([secondToLast.id, last.id]).toContain('DEL001');
      expect([secondToLast.id, last.id]).toContain('DEL002');
      expect(secondToLast.deleted).toBe(true);
      expect(last.deleted).toBe(true);
    });

    it('delete non-existent ID returns error', () => {
      const { combined } = runCli('delete L99999999');
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('delete already-deleted ID is graceful no-op', async () => {
      // Delete once
      runCli('delete DEL001');

      // Try to delete again
      const { combined } = runCli('delete DEL001');
      expect(combined.toLowerCase()).toMatch(/not found|already deleted/i);

      // Verify only one tombstone in JSONL
      const filePath = join(getTempDir(), LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const tombstones = lines.filter((line) => {
        const record = JSON.parse(line) as { id: string; deleted?: boolean };
        return record.id === 'DEL001' && record.deleted === true;
      });
      expect(tombstones.length).toBe(1);
    });

    it('deleted lesson excluded from list output', () => {
      runCli('delete DEL001');

      const { combined } = runCli('list');
      expect(combined).not.toContain('First lesson to delete');
      expect(combined).toContain('Second lesson to delete'); // Other lessons still visible
    });

    it('deleted lesson excluded from search results', async () => {
      await rebuildIndex(getTempDir());
      closeDb();

      runCli('delete DEL001');
      closeDb();

      const { combined } = runCli('search "First lesson"');
      expect(combined).not.toContain('First lesson to delete');
    });
  });

  describe('rebuild command', () => {
    it('shows rebuild progress', () => {
      const { combined } = runCli('rebuild --force');
      expect(combined).toMatch(/rebuild|index/i);
    });
  });

  // ==========================================================================
  // Prime Command (Context Recovery)
  // ==========================================================================

  describe('prime command', () => {
    it('outputs workflow context for Claude Code', () => {
      const { stdout } = runCli('prime');
      // Should contain the header (now Beads-style)
      expect(stdout).toContain('Learning Agent Active');
    });

    it('includes core rules (NEVER edit files directly)', () => {
      const { stdout } = runCli('prime');
      // Updated to match new Beads-style language
      expect(stdout).toMatch(/NEVER.*edit/i);
      expect(stdout).toMatch(/\.claude\/lessons/i);
      expect(stdout).toMatch(/lna learn|lna list|lna show|lna search/i);
    });

    it('includes when to capture lessons', () => {
      const { stdout } = runCli('prime');
      expect(stdout).toMatch(/correct|wrong|actually/i);
      expect(stdout).toMatch(/self-correct|iteration/i);
      expect(stdout).toMatch(/test fail/i);
    });

    it('includes MCP tools prominently', () => {
      const { stdout } = runCli('prime');
      // MCP tools should be mentioned prominently at top
      expect(stdout).toContain('lesson_search');
      expect(stdout).toContain('lesson_capture');
      // Should emphasize MCP over CLI
      expect(stdout).toMatch(/MUST use MCP/i);
    });

    it('includes CLI fallback reference (search, learn, list only)', () => {
      const { stdout } = runCli('prime');
      // CLI fallback should mention only these three commands
      expect(stdout).toContain('lna search');
      expect(stdout).toContain('lna learn');
      expect(stdout).toContain('lna list');
      // Should NOT mention check-plan or stats in CLI fallback
      expect(stdout).not.toContain('check-plan');
      expect(stdout).not.toContain('lna stats');
    });

    it('includes quality gate (novel, specific, actionable)', () => {
      const { stdout } = runCli('prime');
      expect(stdout.toLowerCase()).toContain('novel');
      expect(stdout.toLowerCase()).toContain('specific');
      expect(stdout.toLowerCase()).toContain('actionable');
    });

    it('outputs nothing to stderr on success', () => {
      const { stderr } = runCli('prime');
      expect(stderr).toBe('');
    });
  });
});
