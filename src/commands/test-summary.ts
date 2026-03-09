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

/** Max lines to capture from a failure body. */
const MAX_ERROR_BODY_LINES = 10;

/** Default log file path relative to repo root. */
const LOG_REL_PATH = '.claude/.cache/last-test-run.log';

/** Allowed test command prefixes. */
const SAFE_CMD_PREFIXES = ['pnpm', 'npm', 'npx', 'yarn', 'vitest', 'jest'];

/** Shell metacharacters that indicate injection attempts. */
const SHELL_META = /[;|&`$(){}!<>\\]/;

/** Check if a --cmd value is safe to execute. */
export function isTestCommandSafe(cmd: string): boolean {
  if (SHELL_META.test(cmd)) return false;
  const firstWord = cmd.split(/\s/)[0] ?? '';
  return SAFE_CMD_PREFIXES.includes(firstWord);
}

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

  // Parse individual FAIL blocks with multiline body
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const failMatch = lines[i]!.match(/^ FAIL\s+(.+?)(?:\s+\[.*?\])?$/);
    if (!failMatch) continue;

    const name = failMatch[1]!.trim();
    const bodyLines: string[] = [];

    // Collect up to MAX_ERROR_BODY_LINES of the failure body
    for (let j = i + 1; j < lines.length && bodyLines.length < MAX_ERROR_BODY_LINES; j++) {
      const line = lines[j]!;
      // Stop at location lines or section separators
      if (line.trimStart().startsWith('\u276F') || line.match(/^⎯/)) break;
      // Stop at next FAIL block
      if (line.match(/^ FAIL\s+/)) break;
      // Skip blank lines at the start
      if (bodyLines.length === 0 && line.trim() === '') continue;
      bodyLines.push(line);
    }

    // Trim trailing blank lines
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]!.trim() === '') {
      bodyLines.pop();
    }

    if (bodyLines.length === 0) continue;

    summary.failures.push({ name, error: bodyLines.join('\n').trim() });
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
        if (!isTestCommandSafe(options.cmd)) {
          console.error(`Unsafe --cmd value: "${options.cmd}". Must start with ${SAFE_CMD_PREFIXES.join('/')} and contain no shell metacharacters.`);
          process.exitCode = 1;
          return;
        }
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

      process.exitCode = exitCode;
    });
}
