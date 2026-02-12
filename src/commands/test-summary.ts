/**
 * Test summary command: runs tests and outputs a compact summary.
 *
 * Parses Vitest output to extract pass/fail/skip counts, duration,
 * and failing test names + error messages.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';

// ============================================================================
// Types
// ============================================================================

/** A single test failure with name and error message. */
export interface TestFailure {
  name: string;
  error: string;
}

/** Parsed summary of a Vitest run. */
export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: string;
  failures: TestFailure[];
}

// ============================================================================
// Constants
// ============================================================================

/** Max length for a single error message line before truncation. */
const MAX_ERROR_LINE_LENGTH = 200;

/** Default log file path relative to repo root. */
const LOG_REL_PATH = '.claude/.cache/last-test-run.log';

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse Vitest output into a structured summary.
 *
 * @param output - Raw Vitest stdout/stderr output
 * @returns Parsed test summary
 */
export function parseVitestOutput(output: string): TestSummary {
  const summary: TestSummary = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    duration: 'unknown',
    failures: [],
  };

  if (!output.trim()) return summary;

  // Parse the summary line: "Tests  3 failed | 17 passed (20)" or "Tests  65 passed (65)"
  const testsLine = output.match(/Tests\s+(.+)\((\d+)\)/);
  if (testsLine) {
    summary.total = parseInt(testsLine[2]!, 10);
    const parts = testsLine[1]!;

    const failedMatch = parts.match(/(\d+)\s+failed/);
    if (failedMatch) summary.failed = parseInt(failedMatch[1]!, 10);

    const passedMatch = parts.match(/(\d+)\s+passed/);
    if (passedMatch) summary.passed = parseInt(passedMatch[1]!, 10);

    const skippedMatch = parts.match(/(\d+)\s+skipped/);
    if (skippedMatch) summary.skipped = parseInt(skippedMatch[1]!, 10);
  }

  // Parse duration: "Duration  1.23s" or "Duration  142ms"
  const durationMatch = output.match(/Duration\s+([\d.]+(?:ms|s))/);
  if (durationMatch) {
    summary.duration = durationMatch[1]!;
  }

  // Parse individual FAIL blocks
  // Pattern: " FAIL  path > suite > test\nErrorMessage"
  const failPattern = / FAIL\s+(.+?)(?:\s+\[.*?\])?\n(.+)/g;
  let match;
  while ((match = failPattern.exec(output)) !== null) {
    const name = match[1]!.trim();
    const errorLine = match[2]!.trim();

    // Skip location lines (start with ❯)
    if (errorLine.startsWith('\u276F')) continue;

    const error = errorLine.length > MAX_ERROR_LINE_LENGTH
      ? errorLine.slice(0, MAX_ERROR_LINE_LENGTH) + '...'
      : errorLine;

    summary.failures.push({ name, error });
  }

  return summary;
}

/**
 * Format a TestSummary into a compact string for CLI output.
 *
 * @param summary - Parsed test summary
 * @param logPath - Path to the full log file
 * @returns Formatted summary string
 */
export function formatTestSummary(summary: TestSummary, logPath: string): string {
  const lines: string[] = [];

  lines.push(
    `TESTS: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${summary.duration})`
  );

  if (summary.failures.length > 0) {
    const first = summary.failures[0]!;
    lines.push(`FAIL ${first.name}`);
    lines.push(`  ${first.error}`);
    if (summary.failures.length > 1) {
      lines.push(`  ... and ${summary.failures.length - 1} more failure(s)`);
    }
  }

  lines.push(`LOG: Full output at ${logPath}`);

  return lines.join('\n');
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the test-summary command on the program.
 */
export function registerTestSummaryCommand(program: Command): void {
  program
    .command('test-summary')
    .description('Run tests and output a compact summary')
    .option('--fast', 'Run pnpm test:fast instead of pnpm test')
    .option('--cmd <command>', 'Custom test command to run')
    .action((options: { fast?: boolean; cmd?: string }) => {
      const repoRoot = getRepoRoot();

      // Determine test command
      let testCmd = 'pnpm test';
      if (options.cmd) {
        testCmd = options.cmd;
      } else if (options.fast) {
        testCmd = 'pnpm test:fast';
      }

      // Run test command, capture output
      let output: string;
      let exitCode: number;
      try {
        output = execSync(testCmd, {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          // Merge stderr into stdout for Vitest (it writes to both)
          env: { ...process.env, FORCE_COLOR: '0' },
        });
        exitCode = 0;
      } catch (err) {
        const execErr = err as { stdout?: string; stderr?: string; status?: number };
        output = (execErr.stdout ?? '') + '\n' + (execErr.stderr ?? '');
        exitCode = execErr.status ?? 1;
      }

      // Write full output to log file
      const logPath = join(repoRoot, LOG_REL_PATH);
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, output, 'utf-8');

      // Parse and format summary
      const summary = parseVitestOutput(output);
      console.log(formatTestSummary(summary, logPath));

      process.exit(exitCode);
    });
}
