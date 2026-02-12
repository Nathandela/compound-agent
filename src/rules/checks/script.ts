/**
 * Script rule check implementation.
 *
 * Runs a shell command and checks the exit code.
 */

import { execSync } from 'node:child_process';

import type { ScriptCheck } from '../types.js';
import type { Violation } from '../engine.js';

/**
 * Run a script check by executing a shell command.
 *
 * @param check - The script check configuration
 * @returns Array of violations (empty if command exits with expected code)
 */
export function runScriptCheck(check: ScriptCheck): Violation[] {
  const expectedCode = check.expectExitCode ?? 0;

  try {
    execSync(check.command, { stdio: ['pipe', 'pipe', 'pipe'] });
    // Exit code 0
    if (expectedCode !== 0) {
      return [{ message: `Script exited with exit code 0, expected ${expectedCode}` }];
    }
    return [];
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status ?? 1;
    if (exitCode === expectedCode) {
      return [];
    }
    const stderr = ((err as { stderr?: Buffer }).stderr ?? Buffer.alloc(0))
      .toString('utf-8')
      .trim();
    const msg = stderr
      ? `Script exited with exit code ${exitCode} (expected ${expectedCode}): ${stderr}`
      : `Script exited with exit code ${exitCode} (expected ${expectedCode})`;
    return [{ message: msg }];
  }
}
