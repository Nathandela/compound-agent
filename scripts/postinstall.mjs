#!/usr/bin/env node
/**
 * Postinstall script for compound-agent.
 *
 * Patches the consumer's package.json to allow native addon builds
 * in pnpm v10+ projects. No-op for non-pnpm or already-configured projects.
 *
 * IMPORTANT: This script MUST NOT import any native modules or built code.
 * It runs before native addons are compiled.
 *
 * NOTE: The REQUIRED_BUILD_DEPS list is intentionally duplicated here
 * (canonical source: src/setup/primitives.ts REQUIRED_BUILD_DEPS).
 * This file cannot import TypeScript build output because it runs
 * before the package is fully installed. Keep both lists in sync.
 * The list intentionally excludes "esbuild" -- that is only needed
 * for compound-agent's own dev build (tsup), not consumer projects.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_BUILD_DEPS = ['better-sqlite3'];

/**
 * Core postinstall logic, extracted for testability.
 * @param {string} consumerRoot - The consumer project root directory.
 * @returns {{ added: string[] } | null} - What was added, or null if no-op.
 */
export function patchPnpmConfig(consumerRoot) {
  const pkgPath = join(consumerRoot, 'package.json');

  if (!existsSync(pkgPath)) return null;

  let raw;
  try { raw = readFileSync(pkgPath, 'utf-8'); } catch { return null; }

  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  let pkg;
  try { pkg = JSON.parse(raw); } catch { return null; }

  // Detect pnpm: lockfile OR packageManager field
  const lockPath = join(consumerRoot, 'pnpm-lock.yaml');
  const isPnpm = existsSync(lockPath) ||
    (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm'));
  if (!isPnpm) return null;

  // Merge onlyBuiltDependencies
  if (!pkg.pnpm || typeof pkg.pnpm !== 'object') pkg.pnpm = {};
  if (!Array.isArray(pkg.pnpm.onlyBuiltDependencies)) pkg.pnpm.onlyBuiltDependencies = [];

  const existing = pkg.pnpm.onlyBuiltDependencies;
  // Wildcard "*" means all builds are allowed — nothing to add
  if (existing.includes('*')) return null;
  const added = [];
  for (const dep of REQUIRED_BUILD_DEPS) {
    if (!existing.includes(dep)) {
      existing.push(dep);
      added.push(dep);
    }
  }

  if (added.length === 0) return null; // Already configured

  // Detect indentation from the original file to preserve formatting
  const indentMatch = raw.match(/^(\s+)"/m);
  const indent = indentMatch ? indentMatch[1] : '  ';

  const content = JSON.stringify(pkg, null, indent) + '\n';

  // Atomic write: write to temp file then rename to prevent corruption
  const tmpPath = pkgPath + '.compound-agent-tmp';
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, pkgPath);

  return { added };
}

function run() {
  // INIT_CWD is set by npm/pnpm to the directory where install was initiated.
  // Without it, process.cwd() points to the package dir inside node_modules,
  // which is the wrong location. Exit early rather than patching the wrong file.
  const consumerRoot = process.env.INIT_CWD;
  if (!consumerRoot) return;

  // Skip self-install (when running pnpm install inside compound-agent itself)
  if (process.env.npm_package_name === 'compound-agent') return;

  const result = patchPnpmConfig(consumerRoot);
  if (result) {
    console.error(`[compound-agent] Added pnpm.onlyBuiltDependencies: [${result.added.join(', ')}]`);
    console.error('[compound-agent] Run: pnpm install  (to compile native addons)');
  }
}

try {
  run();
} catch (e) {
  // Postinstall must never fail the install, but log unexpected errors
  console.error('[compound-agent] postinstall warning:', e?.message ?? e);
}
