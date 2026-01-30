import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { appendLesson } from './storage/jsonl.js';
import { rebuildIndex, closeDb } from './storage/sqlite.js';
import { LESSONS_PATH } from './storage/jsonl.js';
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

  const runCli = (args: string): string => {
    const cliPath = join(process.cwd(), 'dist', 'cli.js');
    try {
      return execSync(`node ${cliPath} ${args}`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LEARNING_AGENT_ROOT: tempDir },
      });
    } catch (error) {
      const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      const stdout = err.stdout?.toString() ?? '';
      const stderr = err.stderr?.toString() ?? '';
      return stdout + stderr + (err.message ?? '');
    }
  };

  describe('--version', () => {
    it('shows version', () => {
      const output = runCli('--version');
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('--help', () => {
    it('shows help', () => {
      const output = runCli('--help');
      expect(output).toContain('learn');
      expect(output).toContain('search');
      expect(output).toContain('list');
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
      const output = runCli('learn');
      expect(output.toLowerCase()).toMatch(/missing|required|argument/i);
    });
  });

  describe('list command', () => {
    beforeEach(async () => {
      await appendLesson(tempDir, createLesson('L001', 'first lesson'));
      await appendLesson(tempDir, createLesson('L002', 'second lesson'));
      await appendLesson(tempDir, createLesson('L003', 'third lesson'));
    });

    it('lists lessons', () => {
      const output = runCli('list');
      expect(output).toContain('first lesson');
      expect(output).toContain('second lesson');
    });

    it('respects limit option', () => {
      const output = runCli('list -n 1');
      const lines = output.trim().split('\n').filter((l) => l.includes('lesson'));
      expect(lines.length).toBeLessThanOrEqual(2); // Header + 1 lesson
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
      const output = runCli('search "Polars"');
      expect(output).toContain('Polars');
    });

    it('shows no results for non-matching query', () => {
      const output = runCli('search "nonexistent"');
      expect(output.toLowerCase()).toMatch(/no.*found|0.*result/i);
    });
  });
});
