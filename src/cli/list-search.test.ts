/**
 * CLI tests for list and search commands.
 */

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from '../memory/embeddings/nomic.js';
import { appendLesson, LESSONS_PATH } from '../memory/storage/jsonl.js';
import { closeDb, rebuildIndex } from '../memory/storage/sqlite/index.js';
import { cleanupCliTestDir, createQuickLesson, runCli, setupCliTestDir, shouldSkipEmbeddingTests } from '../test-utils.js';

// SAFETY: Never call isModelUsable() at module top-level — causes ~400MB native memory leak.
const modelAvailable = isModelAvailable();
const hybridEnabled = !shouldSkipEmbeddingTests(modelAvailable);

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('list command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createQuickLesson('L002', 'second lesson'));
      await appendLesson(tempDir, createQuickLesson('L003', 'third lesson'));
    });

    it('lists lessons', () => {
      const { combined } = runCli('list', tempDir);
      expect(combined).toContain('first lesson');
      expect(combined).toContain('second lesson');
    });

    it('respects limit option', () => {
      const { combined } = runCli('list -n 1', tempDir);
      const lines = combined.trim().split('\n').filter((l: string) => l.includes('lesson'));
      expect(lines.length).toBeLessThanOrEqual(2);
    });

    it('warns about corrupted lessons', async () => {
      const filePath = join(tempDir, LESSONS_PATH);
      await appendFile(filePath, 'not valid json\n', 'utf-8');
      await appendFile(filePath, '{"id": "bad", "missing": "fields"}\n', 'utf-8');

      const { combined } = runCli('list', tempDir);
      expect(combined).toContain('first lesson');
      expect(combined.toLowerCase()).toMatch(/warn|skip|corrupt/i);
      expect(combined).toMatch(/2/);
    });
  });

  describe('search command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createQuickLesson('L002', 'test your code'));
      await rebuildIndex(tempDir);
      closeDb();
    });

    it('searches by keyword', () => {
      const { combined } = runCli('search "Polars"', tempDir);
      expect(combined).toContain('Polars');
    });

    // With hybrid search enabled, vector similarity returns results even for unrelated queries
    it.skipIf(hybridEnabled)('shows no results for non-matching query (FTS-only)', () => {
      const { combined } = runCli('search "nonexistent"', tempDir);
      expect(combined.toLowerCase()).toMatch(/no lessons match|no.*found|0.*result/i);
    });
  });

  describe('global options', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
      closeDb();
    });

    it('--verbose flag shows extra detail', () => {
      const { combined } = runCli('list --verbose', tempDir);
      expect(combined).toMatch(/created|context/i);
    });

    it('--quiet flag suppresses info messages', () => {
      const { combined } = runCli('list --quiet', tempDir);
      expect(combined).toContain('test lesson');
      expect(combined).not.toMatch(/showing.*of/i);
    });

    it('-v is alias for --verbose', () => {
      const { combined } = runCli('list -v', tempDir);
      expect(combined).toMatch(/created|context/i);
    });

    it('-q is alias for --quiet', () => {
      const { combined } = runCli('list -q', tempDir);
      expect(combined).not.toMatch(/showing.*of/i);
    });
  });

  describe('user-friendly error messages', () => {
    it('shows friendly message for file not found', () => {
      const { combined } = runCli('import /nonexistent/file.jsonl', tempDir);
      expect(combined).toContain('File not found');
      expect(combined).not.toContain('ENOENT');
    });

    // With hybrid search enabled, vector similarity returns results even for gibberish queries
    it.skipIf(hybridEnabled)('shows friendly message when no lessons match search (FTS-only)', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
      await rebuildIndex(tempDir);
      closeDb();

      const { combined } = runCli('search "zzzznonexistent"', tempDir);
      expect(combined).toContain('No lessons match your search');
      expect(combined).toMatch(/try|list|different/i);
    });

    it('shows friendly message for invalid limit', () => {
      const { combined } = runCli('list -n abc', tempDir);
      expect(combined).toContain('must be a positive integer');
      expect(combined).not.toMatch(/Error:\s+Invalid limit/i);
      expect(combined).not.toMatch(/\bat Command\./);
    });

    it('shows friendly message for non-positive limit', () => {
      const { combined } = runCli('search "test" -n 0', tempDir);
      expect(combined).toContain('must be a positive integer');
      expect(combined).not.toMatch(/Error:\s+Invalid limit/i);
      expect(combined).not.toMatch(/\bat Command\./);
    });

    it('shows friendly message for empty lesson list', () => {
      const { combined } = runCli('list', tempDir);
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
      const { combined } = runCli('list', tempDir);
      const lines = combined.split('\n').filter((l: string) => l.trim());
      expect(lines.some((l: string) => l.includes('[L001]'))).toBe(true);
      expect(lines.some((l: string) => l.includes('[L002]'))).toBe(true);
    });

    it('search results show formatted output', async () => {
      const { combined } = runCli('search "test"', tempDir);
      expect(combined).toMatch(/found.*lesson/i);
      expect(combined).toContain('[L001]');
    });

    it('learn command shows success indicator', () => {
      const { combined } = runCli('learn "new lesson" --yes', tempDir);
      expect(combined).toMatch(/learned|saved/i);
    });

    it('rebuild command shows progress', () => {
      const { combined } = runCli('rebuild --force', tempDir);
      expect(combined).toMatch(/rebuild|index/i);
    });
  });
});
