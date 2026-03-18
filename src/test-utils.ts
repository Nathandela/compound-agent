/**
 * Shared test utilities for the compound-agent test suite.
 *
 * Sections:
 *   1. Lesson fixtures  - createLesson, createQuickLesson, createFullLesson, daysAgo
 *   2. skipIf helpers   - shouldSkipEmbeddingTests
 *   3. CLI test setup   - setupCliTestDir, cleanupCliTestDir, runCli, runCliWithEnv,
 *                         setupCliTestContext, createRunCli
 *
 * Sections 1 and 2 are re-exported from test-utils-pure.ts (zero native imports).
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

import { closeDb } from './memory/storage/sqlite/index.js';

// Re-export pure fixture creators and skip helpers (sections 1 & 2)
export * from './test-utils-pure.js';

// ---------------------------------------------------------------------------
// Section 3: CLI test setup
// ---------------------------------------------------------------------------

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
 * Create a temporary directory for CLI tests.
 * Each test should call this in beforeEach.
 */
export async function setupCliTestDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'compound-agent-cli-'));
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
 * Parse a CLI args string into an array, respecting quoted strings.
 * Simple implementation sufficient for test usage.
 */
function parseCliArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const char of args) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Run the CLI with given arguments.
 *
 * @param args - Command line arguments
 * @param tempDir - Working directory (used as COMPOUND_AGENT_ROOT)
 * @returns Object with stdout, stderr, and combined output
 */
export function runCli(args: string, tempDir: string): CliResult {
  const cliPath = join(process.cwd(), 'dist', 'cli.js');
  const argArray = parseCliArgs(args);
  try {
    const result = execFileSync('node', [cliPath, ...argArray], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, COMPOUND_AGENT_ROOT: tempDir },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const stdout = result;
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
  const argArray = parseCliArgs(args);
  try {
    const result = execFileSync('node', [cliPath, ...argArray], {
      cwd: tempDir,
      encoding: 'utf-8',
      env: { ...process.env, COMPOUND_AGENT_ROOT: tempDir, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const stdout = result;
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
 * Create a runCli helper bound to a specific temp directory.
 */
export function createRunCli(getTempDir: () => string): (args: string) => CliResult {
  return (args: string): CliResult => runCli(args, getTempDir());
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
    tempDir = await setupCliTestDir();
  });

  afterEach(async () => {
    await cleanupCliTestDir(tempDir);
  });

  const getTempDir = (): string => tempDir;
  const boundRunCli = createRunCli(getTempDir);

  return { getTempDir, runCli: boundRunCli };
}
