#!/usr/bin/env node
/**
 * Run a deterministic random subset of tests.
 *
 * Usage: tsx src/test-utils/run-random.ts <pct> [-- vitest-args...]
 *
 * Seed is derived from CA_AGENT_SEED env var, falling back to hostname.
 * Different seeds cover different subsets, enabling distributed test coverage.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { selectRandomSubset } from './random-sequencer.js';

/** Recursively find files matching a test pattern. */
function findTestFiles(dir: string, pattern: RegExp, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      findTestFiles(fullPath, pattern, results);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const pctArg = process.argv[2];
if (!pctArg || isNaN(Number(pctArg))) {
  console.error('Usage: run-random <pct> [-- vitest-args...]');
  console.error('  pct: percentage of tests to run (1-100)');
  process.exit(1);
}

const pct = Number(pctArg);
const seed = process.env.CA_AGENT_SEED ?? hostname();

// Collect extra vitest args (everything after --)
const dashDashIdx = process.argv.indexOf('--');
const extraArgs = dashDashIdx >= 0 ? process.argv.slice(dashDashIdx + 1).join(' ') : '';

// Discover test files matching vitest include patterns
const cwd = process.cwd();
const testFiles = [
  ...findTestFiles(join(cwd, 'src'), /\.test\.ts$/),
  ...findTestFiles(join(cwd, 'tools'), /\.test\.js$/),
];

if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

const selected = selectRandomSubset(testFiles, pct, seed);

console.log(`[test:random] seed="${seed}" pct=${pct}% -> ${selected.length}/${testFiles.length} files`);

if (selected.length === 0) {
  console.log('[test:random] No files selected.');
  process.exit(0);
}

const filePatterns = selected.join(' ');
const cmd = `pnpm vitest run ${filePatterns} ${extraArgs}`.trim();

try {
  execSync(cmd, { stdio: 'inherit' });
} catch {
  process.exit(1);
}
