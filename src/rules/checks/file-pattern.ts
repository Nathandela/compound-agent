/**
 * File-pattern rule check implementation.
 *
 * Scans files matching a glob for a regex pattern.
 * By default, matches are violations. With mustMatch=true,
 * files missing the pattern are violations.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FilePatternCheck } from '../types.js';
import type { Violation } from '../engine.js';

import { findFiles } from './glob-utils.js';

/**
 * Run a file-pattern check against files in baseDir.
 *
 * @param baseDir - Root directory to search from
 * @param check - The file-pattern check configuration
 * @returns Array of violations found
 */
export function runFilePatternCheck(
  baseDir: string,
  check: FilePatternCheck,
): Violation[] {
  const files = findFiles(baseDir, check.glob);
  const regex = new RegExp(check.pattern);
  const violations: Violation[] = [];

  for (const file of files) {
    const fullPath = join(baseDir, file);
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    if (check.mustMatch) {
      const found = lines.some((line) => regex.test(line));
      if (!found) {
        violations.push({
          file,
          message: `Pattern ${check.pattern} missing from file`,
        });
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i]!)) {
          violations.push({
            file,
            line: i + 1,
            message: `Pattern ${check.pattern} matched`,
          });
        }
      }
    }
  }

  return violations;
}
