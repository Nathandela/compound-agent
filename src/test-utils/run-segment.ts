#!/usr/bin/env node
/**
 * Run tests for a specific module only.
 *
 * Usage: tsx src/test-utils/run-segment.ts <module> [vitest-args...]
 * Example: pnpm test:segment memory
 *          pnpm test:segment commands --reporter=json
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const moduleArg = process.argv[2];
if (!moduleArg) {
  console.error('Usage: test:segment <module> [vitest-args...]');
  console.error('  module: directory name under src/ (e.g., memory, commands, cli)');
  process.exit(1);
}

const moduleDir = join('src', moduleArg);
if (!existsSync(moduleDir)) {
  console.error(`Module directory not found: ${moduleDir}`);
  process.exit(1);
}

// Extra vitest args (everything after the module name)
const extraArgs = process.argv.slice(3);

try {
  execFileSync('pnpm', ['vitest', 'run', moduleDir, ...extraArgs], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
