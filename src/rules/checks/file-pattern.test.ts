/**
 * Tests for file-pattern rule check.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFilePatternCheck } from './file-pattern.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '__test-file-pattern-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runFilePatternCheck', () => {
  it('finds pattern matches in files (violation when mustMatch is false/undefined)', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'console.log("hello");\nconst x = 1;\n');
    writeFileSync(join(tmpDir, 'b.ts'), 'const y = 2;\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('a.ts');
    expect(violations[0]!.line).toBe(1);
    expect(violations[0]!.message).toContain('console\\.log');
  });

  it('returns no violations when pattern not found', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'const x = 1;\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });

    expect(violations).toHaveLength(0);
  });

  it('finds multiple violations in same file', () => {
    writeFileSync(
      join(tmpDir, 'a.ts'),
      'console.log("one");\nconst x = 1;\nconsole.log("two");\n',
    );

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });

    expect(violations).toHaveLength(2);
    expect(violations[0]!.line).toBe(1);
    expect(violations[1]!.line).toBe(3);
  });

  it('respects glob filter', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'console.log("hello");\n');
    writeFileSync(join(tmpDir, 'b.js'), 'console.log("hello");\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });

    // Only .ts file should match
    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('a.ts');
  });

  it('handles mustMatch=true (violation when pattern NOT found)', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'const x = 1;\n');
    writeFileSync(join(tmpDir, 'b.ts'), '// Copyright 2024\nconst y = 2;\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'Copyright',
      mustMatch: true,
    });

    // a.ts is missing Copyright
    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('a.ts');
    expect(violations[0]!.message).toContain('missing');
  });

  it('handles subdirectories', () => {
    mkdirSync(join(tmpDir, 'sub'), { recursive: true });
    writeFileSync(join(tmpDir, 'sub', 'deep.ts'), 'console.log("deep");\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'console\\.log',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toContain('deep.ts');
  });

  it('returns empty when no files match glob', () => {
    writeFileSync(join(tmpDir, 'a.py'), 'print("hello")\n');

    const violations = runFilePatternCheck(tmpDir, {
      type: 'file-pattern',
      glob: '**/*.ts',
      pattern: 'print',
    });

    expect(violations).toHaveLength(0);
  });
});
