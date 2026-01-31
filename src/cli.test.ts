import { execSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appendLesson, LESSONS_PATH } from './storage/jsonl.js';
import { closeDb, rebuildIndex } from './storage/sqlite.js';
import type { QuickLesson } from './types.js';

describe('CLI', () => {
  let tempDir: string;

  const createLesson = (id: string, insight: string): QuickLesson => ({
    id,
    type: 'quick',
    trigger: `trigger for ${insight}`,
    insight,
    tags: ['test'],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  });

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
      await appendLesson(tempDir, createLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createLesson('L002', 'second lesson'));
      await appendLesson(tempDir, createLesson('L003', 'third lesson'));
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
      await appendLesson(tempDir, createLesson('L001', 'use Polars for data'));
      await appendLesson(tempDir, createLesson('L002', 'test your code'));
      await rebuildIndex(tempDir);
      closeDb(); // Close so CLI can open fresh
    });

    it('searches by keyword', () => {
      const { combined } = runCli('search "Polars"');
      expect(combined).toContain('Polars');
    });

    it('shows no results for non-matching query', () => {
      const { combined } = runCli('search "nonexistent"');
      expect(combined.toLowerCase()).toMatch(/no.*found|0.*result/i);
    });
  });
});
