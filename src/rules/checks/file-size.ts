/**
 * File-size rule check implementation.
 *
 * Checks that files matching a glob do not exceed a line count limit.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FileSizeCheck } from '../types.js';
import type { Violation } from '../engine.js';

import { findFiles } from './glob-utils.js';

/**
 * Run a file-size check against files in baseDir.
 *
 * @param baseDir - Root directory to search from
 * @param check - The file-size check configuration
 * @returns Array of violations found
 */
export function runFileSizeCheck(
  baseDir: string,
  check: FileSizeCheck,
): Violation[] {
  const files = findFiles(baseDir, check.glob);
  const violations: Violation[] = [];

  for (const file of files) {
    const content = readFileSync(join(baseDir, file), 'utf-8');
    // Count non-empty trailing: split and filter trailing empty from final newline
    const lineCount = content === '' ? 0 : content.split('\n').filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '').length;

    if (lineCount > check.maxLines) {
      violations.push({
        file,
        message: `File has ${lineCount} lines, exceeds limit of ${check.maxLines}`,
      });
    }
  }

  return violations;
}
