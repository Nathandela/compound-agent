/**
 * Shared test helpers for CLI command tests.
 */

import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

import { closeDb } from '../storage/sqlite.js';

/** Test context for CLI tests */
export interface CliTestContext {
  tempDir: string;
}

/**
 * Result from running a CLI command.
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  combined: string;
}

/**
 * Create a runCli helper bound to a specific temp directory.
 */
export function createRunCli(getTempDir: () => string): (args: string) => CliResult {
  return (args: string): CliResult => {
    const tempDir = getTempDir();
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
}

/**
 * Setup and teardown helpers for CLI tests.
 * Returns a function to get the current temp directory.
 */
export function setupCliTestContext(): {
  getTempDir: () => string;
  runCli: (args: string) => CliResult;
} {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-cli-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  const getTempDir = (): string => tempDir;
  const runCli = createRunCli(getTempDir);

  return { getTempDir, runCli };
}
