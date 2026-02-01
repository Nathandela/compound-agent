/**
 * CLI tests for export and import commands.
 */

import { execSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLesson, LESSONS_PATH } from '../storage/jsonl.js';
import { createQuickLesson } from '../test-utils.js';
import { cleanupCliTestDir, runCli, setupCliTestDir } from './cli-test-utils.js';

describe('CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('export command', () => {
    beforeEach(async () => {
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
      const { stdout } = runCli('export', tempDir);
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
      const { stdout } = runCli('export', tempDir);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it('filters lessons by --since date', () => {
      const { stdout } = runCli('export --since 2024-02-01', tempDir);
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
      const { stdout } = runCli('export --tags typescript', tempDir);
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
      const { stdout } = runCli('export --tags python,cli', tempDir);
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'L002' }),
          expect.objectContaining({ id: 'L003' }),
        ])
      );
    });

    it('combines --since and --tags filters', () => {
      const { stdout } = runCli('export --since 2024-02-01 --tags typescript', tempDir);
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual(expect.objectContaining({ id: 'L003' }));
    });

    it('outputs empty array when no lessons exist', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'learning-agent-empty-'));
      try {
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
      const { stdout } = runCli('export --tags nonexistent', tempDir);
      const exported = JSON.parse(stdout) as unknown[];
      expect(exported).toEqual([]);
    });

    it('excludes deleted lessons', async () => {
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

      const { stdout } = runCli('export', tempDir);
      const exported = JSON.parse(stdout) as unknown[];

      expect(exported).toHaveLength(2);
      expect(exported).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'L002' })])
      );
    });
  });

  describe('import command', () => {
    it('imports lessons from a JSONL file', async () => {
      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('IMP1', 'imported lesson one')),
          JSON.stringify(createQuickLesson('IMP2', 'imported lesson two')),
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`, tempDir);
      expect(combined).toContain('Imported 2 lessons');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('IMP1');
      expect(content).toContain('IMP2');
    });

    it('skips lessons with duplicate IDs', async () => {
      await appendLesson(tempDir, createQuickLesson('EXIST1', 'existing lesson'));

      const sourceFile = join(tempDir, 'import-source.jsonl');
      await writeFile(
        sourceFile,
        [
          JSON.stringify(createQuickLesson('EXIST1', 'duplicate lesson')),
          JSON.stringify(createQuickLesson('NEW1', 'new lesson')),
        ].join('\n') + '\n'
      );

      const { combined } = runCli(`import ${sourceFile}`, tempDir);
      expect(combined).toContain('Imported 1 lesson');
      expect(combined).toContain('1 skipped');

      const filePath = join(tempDir, LESSONS_PATH);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('existing lesson');
      expect(content).toContain('NEW1');
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

      const { combined } = runCli(`import ${sourceFile}`, tempDir);
      expect(combined).toContain('Imported 2 lessons');
      expect(combined).toContain('2 invalid');
    });

    it('requires file argument', () => {
      const { combined } = runCli('import', tempDir);
      expect(combined.toLowerCase()).toMatch(/missing|required|argument/i);
    });

    it('handles non-existent file gracefully', () => {
      const { combined } = runCli('import /nonexistent/file.jsonl', tempDir);
      expect(combined.toLowerCase()).toMatch(/error|not found|enoent/i);
    });

    it('handles empty import file', async () => {
      const sourceFile = join(tempDir, 'empty.jsonl');
      await writeFile(sourceFile, '');

      const { combined } = runCli(`import ${sourceFile}`, tempDir);
      expect(combined).toContain('Imported 0 lessons');
    });

    it('shows summary with all counts', async () => {
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

      const { combined } = runCli(`import ${sourceFile}`, tempDir);
      expect(combined).toMatch(/imported.*1.*lesson/i);
      expect(combined).toMatch(/1.*skipped/i);
      expect(combined).toMatch(/1.*invalid/i);
    });
  });
});
