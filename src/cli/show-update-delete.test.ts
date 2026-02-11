/**
 * CLI tests for show, update, and delete commands.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLesson, LESSONS_PATH } from '../memory/storage/jsonl.js';
import { closeDb, rebuildIndex } from '../memory/storage/sqlite/index.js';
import { cleanupCliTestDir, createFullLesson, createQuickLesson, runCli, setupCliTestDir } from '../test-utils.js';

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('show command', () => {
    beforeEach(async () => {
      await appendLesson(
        tempDir,
        createFullLesson('SHOW001', 'API requires X-Request-ID header', 'high', {
          trigger: 'API returned 401 despite valid token',
          evidence: 'Traced in network tab, header missing',
          tags: ['api', 'auth'],
        })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('SHOW002', 'Use Polars for large files', {
          tags: ['python', 'performance'],
        })
      );
    });

    it('show <id> displays lesson in human-readable format', () => {
      const { combined } = runCli('show SHOW001', tempDir);
      expect(combined).toContain('SHOW001');
      expect(combined).toContain('API requires X-Request-ID header');
      expect(combined).toContain('API returned 401 despite valid token');
      expect(combined).toContain('high');
      expect(combined).toContain('api');
      expect(combined).toContain('auth');
    });

    it('show <id> --json outputs JSON', () => {
      const { stdout } = runCli('show SHOW001 --json', tempDir);
      const lesson = JSON.parse(stdout) as { id: string; insight: string; severity: string };
      expect(lesson.id).toBe('SHOW001');
      expect(lesson.insight).toBe('API requires X-Request-ID header');
      expect(lesson.severity).toBe('high');
    });

    it('show non-existent ID returns error', () => {
      const { combined } = runCli('show L99999999', tempDir);
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('show deleted lesson shows deleted status', async () => {
      await appendLesson(tempDir, { id: 'SHOW003', deleted: true, deletedAt: new Date().toISOString() } as any);

      const { combined } = runCli('show SHOW003', tempDir);
      expect(combined.toLowerCase()).toMatch(/not found|deleted/i);
    });

    it('show includes all lesson fields (insight, trigger, severity, tags, etc.)', () => {
      const { combined } = runCli('show SHOW001', tempDir);
      expect(combined).toContain('SHOW001');
      expect(combined).toContain('API requires X-Request-ID header');
      expect(combined).toContain('API returned 401 despite valid token');
      expect(combined).toContain('high');
      expect(combined).toContain('Traced in network tab');
      expect(combined).toContain('api');
      expect(combined).toContain('auth');
    });
  });

  describe('update command', () => {
    beforeEach(async () => {
      await appendLesson(
        tempDir,
        createFullLesson('UPD001', 'Original insight', 'medium', {
          trigger: 'Original trigger',
          evidence: 'Original evidence',
          tags: ['original', 'tag'],
        })
      );
      await appendLesson(
        tempDir,
        createQuickLesson('UPD002', 'Quick lesson insight', {
          tags: ['quick'],
        })
      );
    });

    it('update <id> --insight "new" changes insight', async () => {
      runCli('update UPD001 --insight "Updated insight text"', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; insight: string };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.insight).toBe('Updated insight text');
    });

    it('update <id> --severity high changes severity', async () => {
      runCli('update UPD001 --severity high', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; severity: string };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.severity).toBe('high');
    });

    it('update <id> --tags "a,b" sets tags array', async () => {
      runCli('update UPD001 --tags "api,auth,security"', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; tags: string[] };
      expect(updatedLesson.id).toBe('UPD001');
      expect(updatedLesson.tags).toEqual(['api', 'auth', 'security']);
    });

    it('update <id> --confirmed true sets confirmed', async () => {
      await appendLesson(
        tempDir,
        createQuickLesson('UPD003', 'Unconfirmed lesson', { confirmed: false })
      );

      runCli('update UPD003 --confirmed true', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const updatedLesson = JSON.parse(lines[lines.length - 1]) as { id: string; confirmed: boolean };
      expect(updatedLesson.id).toBe('UPD003');
      expect(updatedLesson.confirmed).toBe(true);
    });

    it('update <id> --json outputs JSON', () => {
      const { stdout } = runCli('update UPD001 --insight "New insight" --json', tempDir);
      const lesson = JSON.parse(stdout) as { id: string; insight: string };
      expect(lesson.id).toBe('UPD001');
      expect(lesson.insight).toBe('New insight');
    });

    it('update non-existent ID returns error', () => {
      const { combined } = runCli('update L99999999 --insight "test"', tempDir);
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('update with invalid severity returns error with valid options', () => {
      const { combined } = runCli('update UPD001 --severity invalid', tempDir);
      expect(combined.toLowerCase()).toMatch(/invalid|must be/i);
      expect(combined).toMatch(/high|medium|low/i);
    });

    it('update deleted lesson returns error', async () => {
      await appendLesson(tempDir, { id: 'UPD004', deleted: true, deletedAt: new Date().toISOString() } as any);

      const { combined } = runCli('update UPD004 --insight "Cannot update deleted"', tempDir);
      expect(combined.toLowerCase()).toMatch(/deleted|not found/i);
    });

    it('update preserves other fields not being updated', async () => {
      runCli('update UPD001 --insight "New insight only"', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
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
      expect(updatedLesson.trigger).toBe('Original trigger');
      expect(updatedLesson.evidence).toBe('Original evidence');
      expect(updatedLesson.tags).toEqual(['original', 'tag']);
      expect(updatedLesson.severity).toBe('medium');
    });

    it('update auto-syncs to SQLite (lesson searchable after)', async () => {
      runCli('update UPD001 --insight "Use PostgreSQL for structured data"', tempDir);
      closeDb();

      const { combined } = runCli('search "PostgreSQL"', tempDir);
      expect(combined).toContain('PostgreSQL');
    });
  });

  describe('delete command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('DEL001', 'First lesson to delete'));
      await appendLesson(tempDir, createQuickLesson('DEL002', 'Second lesson to delete'));
      await appendLesson(tempDir, createQuickLesson('DEL003', 'Third lesson to delete'));
    });

    it('delete <id> appends deleted lesson record with lifecycle fields', async () => {
      runCli('delete DEL001', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const deletedRecord = JSON.parse(lines[lines.length - 1]) as {
        id: string;
        type: string;
        trigger: string;
        insight: string;
        source: string;
        deleted: boolean;
        deletedAt: string;
      };

      expect(deletedRecord.id).toBe('DEL001');
      expect(deletedRecord.type).toBe('quick');
      expect(deletedRecord.trigger).toBeDefined();
      expect(deletedRecord.insight).toBe('First lesson to delete');
      expect(deletedRecord.source).toBe('manual');
      expect(deletedRecord.deleted).toBe(true);
      expect(deletedRecord.deletedAt).toBeDefined();
      expect(new Date(deletedRecord.deletedAt).getTime()).toBeGreaterThan(0);
    });

    it('delete <id> --json outputs JSON', () => {
      const { stdout } = runCli('delete DEL001 --json', tempDir);
      const result = JSON.parse(stdout) as { deleted: string[] };
      expect(result.deleted).toContain('DEL001');
    });

    it('delete L001 L002 deletes multiple', async () => {
      runCli('delete DEL001 DEL002', tempDir);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const secondToLast = JSON.parse(lines[lines.length - 2]) as { id: string; deleted: boolean };
      const last = JSON.parse(lines[lines.length - 1]) as { id: string; deleted: boolean };

      expect([secondToLast.id, last.id]).toContain('DEL001');
      expect([secondToLast.id, last.id]).toContain('DEL002');
      expect(secondToLast.deleted).toBe(true);
      expect(last.deleted).toBe(true);
    });

    it('delete non-existent ID returns error', () => {
      const { combined } = runCli('delete L99999999', tempDir);
      expect(combined.toLowerCase()).toMatch(/not found|does not exist/i);
      expect(combined).toContain('L99999999');
    });

    it('delete already-deleted ID is graceful no-op', async () => {
      runCli('delete DEL001', tempDir);

      const { combined } = runCli('delete DEL001', tempDir);
      expect(combined.toLowerCase()).toMatch(/not found|already deleted/i);

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const tombstones = lines.filter((line) => {
        const record = JSON.parse(line) as { id: string; deleted?: boolean };
        return record.id === 'DEL001' && record.deleted === true;
      });
      expect(tombstones.length).toBe(1);
    });

    it('deleted lesson excluded from list output', () => {
      runCli('delete DEL001', tempDir);

      const { combined } = runCli('list', tempDir);
      expect(combined).not.toContain('First lesson to delete');
      expect(combined).toContain('Second lesson to delete');
    });

    it('deleted lesson excluded from search results', async () => {
      await rebuildIndex(tempDir);
      closeDb();

      runCli('delete DEL001', tempDir);
      closeDb();

      const { combined } = runCli('search "First lesson"', tempDir);
      expect(combined).not.toContain('First lesson to delete');
    });
  });
});
