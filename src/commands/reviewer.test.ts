import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

import { registerReviewerCommand } from './reviewer.js';
import { CONFIG_FILENAME, readConfig } from '../config/index.js';

let tempDir: string;
let program: Command;
let originalGetRepoRoot: () => string;

// Mock getRepoRoot to use temp directory
vi.mock('../cli-utils.js', async () => {
  const actual = await vi.importActual('../cli-utils.js');
  return {
    ...(actual as object),
    getRepoRoot: () => tempDir,
  };
});

beforeEach(async () => {
  tempDir = join(tmpdir(), `ca-reviewer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(tempDir, '.claude'), { recursive: true });

  program = new Command();
  program.exitOverride(); // Prevent process.exit
  registerReviewerCommand(program);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function run(...args: string[]): Promise<string> {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
  try {
    await program.parseAsync(['node', 'ca', 'reviewer', ...args]);
  } finally {
    spy.mockRestore();
  }
  return logs.join('\n');
}

describe('ca reviewer', () => {
  describe('enable', () => {
    it('enables gemini reviewer', async () => {
      const output = await run('enable', 'gemini');
      expect(output).toContain('gemini');

      const config = await readConfig(tempDir);
      expect(config.externalReviewers).toContain('gemini');
    });

    it('enables codex reviewer', async () => {
      const output = await run('enable', 'codex');
      expect(output).toContain('codex');

      const config = await readConfig(tempDir);
      expect(config.externalReviewers).toContain('codex');
    });

    it('reports already enabled', async () => {
      await run('enable', 'gemini');
      const output = await run('enable', 'gemini');
      expect(output).toMatch(/already/i);
    });
  });

  describe('disable', () => {
    it('disables an enabled reviewer', async () => {
      await run('enable', 'gemini');
      const output = await run('disable', 'gemini');
      expect(output).toContain('gemini');

      const config = await readConfig(tempDir);
      expect(config.externalReviewers ?? []).not.toContain('gemini');
    });

    it('reports not enabled', async () => {
      const output = await run('disable', 'gemini');
      expect(output).toMatch(/not enabled/i);
    });
  });

  describe('list', () => {
    it('shows no reviewers when none enabled', async () => {
      const output = await run('list');
      expect(output).toMatch(/no external reviewers/i);
    });

    it('shows enabled reviewers', async () => {
      await run('enable', 'gemini');
      await run('enable', 'codex');
      const output = await run('list');
      expect(output).toContain('gemini');
      expect(output).toContain('codex');
    });
  });
});
