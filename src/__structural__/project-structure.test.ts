/**
 * Structural tests -- verify project invariants at test time.
 *
 * These tests encode architectural rules that should never be violated.
 * They act as a belt-and-suspenders complement to ESLint rules.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all files matching a predicate. */
function collectFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectFiles(full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Recursively collect all directories under `dir`. */
function collectDirs(dir: string): { name: string; path: string }[] {
  const results: { name: string; path: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      const full = join(dir, entry.name);
      results.push({ name: entry.name, path: full });
      results.push(...collectDirs(full));
    }
  }
  return results;
}

/** Whether `dir` or any descendant has .ts source files (not tests, not declarations). */
function hasTsDescendants(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      if (hasTsDescendants(join(dir, entry.name))) return true;
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether `dir` has a barrel export -- either a direct index.ts or all
 * subdirectories that contain .ts files have barrel exports.
 */
function hasBarrelExport(dir: string): boolean {
  if (existsSync(join(dir, 'index.ts'))) return true;

  const subs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name))
    .filter(hasTsDescendants);

  return subs.length > 0 && subs.every(hasBarrelExport);
}

/** Relative path from project root for readable test output. */
function rel(absPath: string): string {
  return absPath.replace(ROOT + '/', '');
}

// ---------------------------------------------------------------------------
// 1. Module barrel exports exist
// ---------------------------------------------------------------------------

describe('module barrel exports', () => {
  const EXCEPTIONS = new Set(['__structural__', 'cli']);

  const moduleDirs = readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !EXCEPTIONS.has(e.name))
    .map((e) => e.name)
    .filter((name) => hasTsDescendants(join(SRC, name)));

  it.each(moduleDirs)(
    'src/%s has barrel export (index.ts at root or in all subdirectories)',
    (dir) => {
      expect(hasBarrelExport(join(SRC, dir))).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Barrel exports only re-export (no implementation logic)
// ---------------------------------------------------------------------------

describe('barrel exports are re-export only', () => {
  // These index.ts files contain implementation logic by design:
  // - src/index.ts: package entry point with VERSION constant
  // - src/commands/index.ts: CLI command registration functions
  const EXCEPTIONS = new Set([
    resolve(SRC, 'index.ts'),
    resolve(SRC, 'commands/index.ts'),
  ]);

  const barrelFiles = collectFiles(SRC, (name) => name === 'index.ts')
    .filter((f) => !EXCEPTIONS.has(resolve(f)));

  it.each(barrelFiles.map((f) => [rel(f), f]))(
    '%s contains only re-exports',
    (_label, filePath) => {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      const BARREL_ALLOWED_PATTERNS = [
        /^\s*export\s+\{/,       // export { x } from
        /^\s*export\s+\*/,        // export * from
        /^\s*export\s+type\s+\{/, // export type { x } from
        /^\s*export\s+type\s+\*/, // export type * from
        /^\s*import\s+/,          // import statements (used for re-export)
        /^\s*\/\//,               // single-line comments
        /^\s*\/\*/,               // multi-line comment start
        /^\s*\*/,                 // multi-line comment body/end
        /^\s*$/,                  // blank lines
        /^\s*\w+\s*,?\s*$/,      // continuation line in multi-line export (identifier with optional comma)
        /^\s*}\s*from\s+/,       // closing brace of multi-line export
      ];

      const violations: string[] = [];
      for (const line of lines) {
        const isAllowed = BARREL_ALLOWED_PATTERNS.some((p) => p.test(line));
        if (!isAllowed) {
          violations.push(`${rel(filePath)}: ${line.trim()}`);
        }
      }

      expect(
        violations,
        `Barrel file ${rel(filePath)} contains non-export lines`,
      ).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// 3. No banned directory names
// ---------------------------------------------------------------------------

describe('no banned directory names', () => {
  const BANNED = new Set(['utils', 'helpers', 'shared', 'common', 'misc']);

  it('no directory under src/ uses a banned name', () => {
    const allDirs = collectDirs(SRC);
    const violations = allDirs.filter((d) => BANNED.has(d.name));

    expect(
      violations.map((v) => rel(v.path)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Git ignore includes cache
// ---------------------------------------------------------------------------

describe('.gitignore configuration', () => {
  it('ignores .claude/.cache/', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    const cacheIgnored = gitignore
      .split('\n')
      .some((line) => line.trim().includes('.claude/.cache'));
    expect(cacheIgnored).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Package.json module type
// ---------------------------------------------------------------------------

describe('package.json configuration', () => {
  it('uses ESM ("type": "module")', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');
  });
});

// ---------------------------------------------------------------------------
// 6. No focused or skipped tests
// ---------------------------------------------------------------------------

describe('test hygiene', () => {
  const THIS_FILE = resolve(SRC, '__structural__/project-structure.test.ts');
  const TOOLS = join(ROOT, 'tools');

  const testFiles = [
    ...collectFiles(SRC, (name) => name.endsWith('.test.ts')),
    ...(existsSync(TOOLS) ? collectFiles(TOOLS, (name) => name.endsWith('.test.js')) : []),
  ].filter((f) => resolve(f) !== THIS_FILE);

  it('no test file uses .only()', () => {
    const violations: string[] = [];
    for (const file of testFiles) {
      const content = readFileSync(file, 'utf-8');
      if (/\b(?:it|describe|test)\.only\s*\(/.test(content)) {
        violations.push(rel(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('no test file uses .skip()', () => {
    const violations: string[] = [];
    for (const file of testFiles) {
      const content = readFileSync(file, 'utf-8');
      if (/\b(?:it|describe|test)\.skip\s*\(/.test(content)) {
        violations.push(rel(file));
      }
    }
    expect(violations).toEqual([]);
  });
});
