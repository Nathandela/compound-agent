/**
 * Shared test utilities for CLI tests.
 *
 * Provides common setup/teardown functions and CLI execution helpers
 * used across all CLI test files.
 */

import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeDb } from '../storage/sqlite.js';

/**
 * Create a temporary directory for CLI tests.
 * Each test should call this in beforeEach.
 */
export async function setupCliTestDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'learning-agent-cli-'));
}

/**
 * Clean up the temporary directory after tests.
 * Each test should call this in afterEach.
 */
export async function cleanupCliTestDir(tempDir: string): Promise<void> {
  closeDb();
  await rm(tempDir, { recursive: true, force: true });
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
 * Run the CLI with given arguments.
 *
 * @param args - Command line arguments
 * @param tempDir - Working directory (used as LEARNING_AGENT_ROOT)
 * @returns Object with stdout, stderr, and combined output
 */
export function runCli(args: string, tempDir: string): CliResult {
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
}

/**
 * Run CLI with custom environment variables.
 *
 * @param args - Command line arguments
 * @param tempDir - Working directory
 * @param env - Additional environment variables
 * @returns Object with stdout, stderr, and combined output
 */
export function runCliWithEnv(
  args: string,
  tempDir: string,
  env: Record<string, string>
): CliResult {
  const cliPath = join(process.cwd(), 'dist', 'cli.js');
  try {
    const stdout = execSync(`node ${cliPath} ${args} 2>&1`, {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, LEARNING_AGENT_ROOT: tempDir, ...env },
    });
    return { stdout, stderr: '', combined: stdout };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const stdout = err.stdout?.toString() ?? '';
    const stderr = err.stderr?.toString() ?? '';
    const combined = stdout + stderr + (err.message ?? '');
    return { stdout, stderr, combined };
  }
}
