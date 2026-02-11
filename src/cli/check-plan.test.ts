/**
 * CLI tests for the check-plan command.
 */

import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable } from '../memory/embeddings/nomic.js';
import { appendLesson } from '../memory/storage/jsonl.js';
import { closeDb, rebuildIndex } from '../memory/storage/sqlite/index.js';
import { cleanupCliTestDir, createQuickLesson, runCli, setupCliTestDir, shouldSkipEmbeddingTests } from '../test-utils.js';

// Check if embedding tests should be skipped (env var or model unavailable)
const skipEmbedding = shouldSkipEmbeddingTests(isModelAvailable());

describe('CLI', { tags: ['integration'] }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  describe('check-plan command', () => {
    beforeEach(async () => {
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
      const { combined } = runCli('check-plan --plan "implement testing workflow"', tempDir);
      if (/runtime initialization failed|failed to create context/i.test(combined)) {
        expect(combined).toMatch(/download-model|compatibility/i);
        return;
      }
      expect(combined).toMatch(/lessons|relevant/i);
    });

    it('outputs valid JSON with --json flag', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"', tempDir);
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('reads plan from stdin', () => {
      const cliPath = join(process.cwd(), 'dist', 'cli.js');
      try {
        const stdout = execSync(`echo "test workflow" | node ${cliPath} check-plan`, {
          cwd: tempDir,
          encoding: 'utf-8',
          env: { ...process.env, COMPOUND_AGENT_ROOT: tempDir },
        });
        expect(stdout).toMatch(/lessons|relevant|no.*found/i);
      } catch (error) {
        const output = String((error as { stdout?: string; stderr?: string }).stdout ?? '')
          + String((error as { stdout?: string; stderr?: string }).stderr ?? '');
        expect(output).toMatch(/runtime initialization failed|failed to create context/i);
      }
    });

    it('respects --limit option', () => {
      const { stdout } = runCli('check-plan --json --limit 1 --plan "testing and authentication"', tempDir);
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: unknown[]; count: number };
      expect(result.lessons.length).toBeLessThanOrEqual(1);
    });

    it('shows user-friendly message when no relevant lessons found', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'compound-agent-empty-'));
      try {
        const cliPath = join(process.cwd(), 'dist', 'cli.js');
        try {
          const stdout = execSync(`node ${cliPath} check-plan --plan "something completely unrelated xyz123"`, {
            cwd: emptyDir,
            encoding: 'utf-8',
            env: { ...process.env, COMPOUND_AGENT_ROOT: emptyDir },
          });
          expect(stdout).toMatch(/no.*lessons|no.*relevant|no.*found/i);
        } catch (error) {
          const output = String((error as { stdout?: string; stderr?: string }).stdout ?? '')
            + String((error as { stdout?: string; stderr?: string }).stderr ?? '');
          expect(output).toMatch(/runtime initialization failed|failed to create context/i);
        }
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('requires plan text from --plan or stdin', () => {
      const { combined } = runCli('check-plan', tempDir);
      expect(combined.toLowerCase()).toMatch(/no plan|required|error/i);
    });

    it('includes rankScore (final ranking score) in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"', tempDir);
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ rankScore?: number }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('rankScore');
        expect(typeof result.lessons[0].rankScore).toBe('number');
        // Should NOT have the old 'relevance' field
        expect(result.lessons[0]).not.toHaveProperty('relevance');
      }
    });

    it('includes lesson ID in JSON output', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"', tempDir);
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons: Array<{ id?: string }> };
      if (result.lessons.length > 0) {
        expect(result.lessons[0]).toHaveProperty('id');
        expect(typeof result.lessons[0].id).toBe('string');
      }
    });

    it.skipIf(skipEmbedding)('returns lessons array when model is available', () => {
      const { stdout } = runCli('check-plan --json --plan "testing workflow"', tempDir);
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      expect(jsonLine).toBeDefined();
      const result = JSON.parse(jsonLine!) as { lessons?: unknown[]; error?: string };
      if (result.error) {
        expect(result.error).toMatch(/runtime initialization failed|failed to create context/i);
        return;
      }
      expect(result.lessons).toBeDefined();
      expect(result.error).toBeUndefined();
    });
  });
});
