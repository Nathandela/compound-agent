/**
 * Tests for test-utils-pure.ts — pure fixture utilities with zero native imports.
 *
 * Written BEFORE implementation (TDD).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Source-scan tests (zero native imports contract)
// ---------------------------------------------------------------------------

describe('zero native imports (fragile contract)', () => {
  it('test-utils-pure.ts does NOT import better-sqlite3', () => {
    const source = readFileSync(join(__dirname, 'test-utils-pure.ts'), 'utf-8');
    expect(source).not.toMatch(/from\s+['"]better-sqlite3['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]better-sqlite3['"]\s*\)/);
  });

  it('test-utils-pure.ts does NOT import onnxruntime-node', () => {
    const source = readFileSync(join(__dirname, 'test-utils-pure.ts'), 'utf-8');
    expect(source).not.toMatch(/from\s+['"]onnxruntime-node['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]onnxruntime-node['"]\s*\)/);
  });

  it('test-utils-pure.ts does NOT import @huggingface/transformers', () => {
    const source = readFileSync(join(__dirname, 'test-utils-pure.ts'), 'utf-8');
    expect(source).not.toMatch(/from\s+['"]@huggingface\/transformers['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]@huggingface\/transformers['"]\s*\)/);
  });

  it('test-utils-pure.ts does NOT import from memory/storage/sqlite', () => {
    const source = readFileSync(join(__dirname, 'test-utils-pure.ts'), 'utf-8');
    expect(source).not.toMatch(/from\s+['"][^'"]*memory\/storage\/sqlite[^'"]*['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"][^'"]*memory\/storage\/sqlite[^'"]*['"]\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Exports: expected symbols are present and are functions
// ---------------------------------------------------------------------------

describe('exports expected symbols', () => {
  it('exports createQuickLesson as a function', async () => {
    const { createQuickLesson } = await import('./test-utils-pure.js');
    expect(typeof createQuickLesson).toBe('function');
  });

  it('exports shouldSkipEmbeddingTests as a function', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    expect(typeof shouldSkipEmbeddingTests).toBe('function');
  });

  it('exports createLesson as a function', async () => {
    const { createLesson } = await import('./test-utils-pure.js');
    expect(typeof createLesson).toBe('function');
  });

  it('exports createFullLesson as a function', async () => {
    const { createFullLesson } = await import('./test-utils-pure.js');
    expect(typeof createFullLesson).toBe('function');
  });

  it('exports createSolution as a function', async () => {
    const { createSolution } = await import('./test-utils-pure.js');
    expect(typeof createSolution).toBe('function');
  });

  it('exports createPattern as a function', async () => {
    const { createPattern } = await import('./test-utils-pure.js');
    expect(typeof createPattern).toBe('function');
  });

  it('exports createPreference as a function', async () => {
    const { createPreference } = await import('./test-utils-pure.js');
    expect(typeof createPreference).toBe('function');
  });

  it('exports daysAgo as a function', async () => {
    const { daysAgo } = await import('./test-utils-pure.js');
    expect(typeof daysAgo).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Basic behavior smoke tests
// ---------------------------------------------------------------------------

describe('createQuickLesson', () => {
  it('returns a lesson with the given id and insight', async () => {
    const { createQuickLesson } = await import('./test-utils-pure.js');
    const lesson = createQuickLesson('L001', 'Use Polars for data');
    expect(lesson.id).toBe('L001');
    expect(lesson.insight).toBe('Use Polars for data');
    expect(lesson.type).toBe('lesson');
  });

  it('defaults trigger to "trigger for {insight}"', async () => {
    const { createQuickLesson } = await import('./test-utils-pure.js');
    const lesson = createQuickLesson('L001', 'my insight');
    expect(lesson.trigger).toBe('trigger for my insight');
  });
});

describe('shouldSkipEmbeddingTests', () => {
  it('returns true when modelAvailable is false', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    expect(shouldSkipEmbeddingTests(false)).toBe(true);
  });

  it('returns false when modelAvailable is true and no env skip', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    const original = process.env.SKIP_EMBEDDING_TESTS;
    delete process.env.SKIP_EMBEDDING_TESTS;
    try {
      expect(shouldSkipEmbeddingTests(true)).toBe(false);
    } finally {
      if (original !== undefined) process.env.SKIP_EMBEDDING_TESTS = original;
    }
  });

  it('returns true when SKIP_EMBEDDING_TESTS=1', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    const original = process.env.SKIP_EMBEDDING_TESTS;
    process.env.SKIP_EMBEDDING_TESTS = '1';
    try {
      expect(shouldSkipEmbeddingTests(true)).toBe(true);
    } finally {
      if (original !== undefined) process.env.SKIP_EMBEDDING_TESTS = original;
      else delete process.env.SKIP_EMBEDDING_TESTS;
    }
  });

  it('returns false when SKIP_EMBEDDING_TESTS=0 (falsy override)', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    const original = process.env.SKIP_EMBEDDING_TESTS;
    process.env.SKIP_EMBEDDING_TESTS = '0';
    try {
      expect(shouldSkipEmbeddingTests(true)).toBe(false);
    } finally {
      if (original !== undefined) process.env.SKIP_EMBEDDING_TESTS = original;
      else delete process.env.SKIP_EMBEDDING_TESTS;
    }
  });

  it('returns false when SKIP_EMBEDDING_TESTS=false (falsy override)', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    const original = process.env.SKIP_EMBEDDING_TESTS;
    process.env.SKIP_EMBEDDING_TESTS = 'false';
    try {
      expect(shouldSkipEmbeddingTests(true)).toBe(false);
    } finally {
      if (original !== undefined) process.env.SKIP_EMBEDDING_TESTS = original;
      else delete process.env.SKIP_EMBEDDING_TESTS;
    }
  });

  it('returns true when runtimeUsable=false even if modelAvailable=true', async () => {
    const { shouldSkipEmbeddingTests } = await import('./test-utils-pure.js');
    const original = process.env.SKIP_EMBEDDING_TESTS;
    delete process.env.SKIP_EMBEDDING_TESTS;
    try {
      expect(shouldSkipEmbeddingTests(true, false)).toBe(true);
    } finally {
      if (original !== undefined) process.env.SKIP_EMBEDDING_TESTS = original;
    }
  });
});

describe('daysAgo', () => {
  it('returns an ISO string in the past', async () => {
    const { daysAgo } = await import('./test-utils-pure.js');
    const result = daysAgo(7);
    expect(new Date(result).getTime()).toBeLessThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Structural: pure-pool files must not import from test-utils.ts (native)
// ---------------------------------------------------------------------------

describe('pool classification (structural guard)', () => {
  /**
   * Recursively collect all *.test.ts files under a directory.
   */
  function collectTestFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return collectTestFiles(full);
      if (e.isFile() && e.name.endsWith('.test.ts')) return [full];
      return [];
    });
  }

  it('no pure-pool test file imports from test-utils.ts (only test-utils-pure.ts allowed)', () => {
    const repoRoot = resolve(__dirname, '..');
    const workspaceSrc = readFileSync(join(repoRoot, 'vitest.workspace.ts'), 'utf-8');

    // Extract nativeFiles (exact paths) and integrationFiles (may include globs) from workspace config
    const nativeMatch = workspaceSrc.match(/const nativeFiles\s*=\s*\[([\s\S]*?)\];/);
    const integrationMatch = workspaceSrc.match(/const integrationFiles\s*=\s*\[([\s\S]*?)\];/);
    const extractPaths = (block: string) =>
      [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const nativePaths = nativeMatch ? extractPaths(nativeMatch[1]) : [];
    const integrationPaths = integrationMatch ? extractPaths(integrationMatch[1]) : [];
    const allExcluded = [...nativePaths, ...integrationPaths];

    // Convert patterns to matchers: globs like 'src/cli/**/*.test.ts' → prefix match
    const isExcluded = (relPath: string): boolean =>
      allExcluded.some((pattern) => {
        if (pattern.includes('**')) {
          // Convert glob to prefix: 'src/cli/**/*.test.ts' → 'src/cli/'
          const prefix = pattern.split('**')[0];
          return relPath.startsWith(prefix);
        }
        return relPath === pattern || relPath.endsWith('/' + pattern.replace(/^src\//, ''));
      });

    const srcDir = join(repoRoot, 'src');
    const allTestFiles = collectTestFiles(srcDir);
    const violations: string[] = [];

    for (const absPath of allTestFiles) {
      const relPath = absPath.replace(repoRoot + '/', '');
      if (relPath.includes('src/memory/embeddings/')) continue; // embedding pool
      if (isExcluded(relPath)) continue;

      const content = readFileSync(absPath, 'utf-8');
      // Flag imports that reference test-utils.js but NOT test-utils-pure.js
      if (/from ['"][^'"]*(?<!-pure)\/test-utils\.js['"]/.test(content) ||
          /from ['"]\.\.?\/test-utils\.js['"]/.test(content)) {
        violations.push(relPath);
      }
    }

    expect(violations, `Pure-pool files must import test-utils-pure.js, not test-utils.js.\nViolators:\n${violations.join('\n')}`).toEqual([]);
  });
});
