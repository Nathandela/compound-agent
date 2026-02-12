/**
 * Tests for file-size rule check.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFileSizeCheck } from './file-size.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(import.meta.dirname, '__test-file-size-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runFileSizeCheck', () => {
  it('flags files exceeding maxLines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    writeFileSync(join(tmpDir, 'big.ts'), lines);

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('big.ts');
    expect(violations[0]!.message).toContain('10');
    expect(violations[0]!.message).toContain('5');
  });

  it('passes files within limit', () => {
    writeFileSync(join(tmpDir, 'small.ts'), 'line 1\nline 2\n');

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(0);
  });

  it('passes files exactly at limit', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    writeFileSync(join(tmpDir, 'exact.ts'), lines);

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(0);
  });

  it('respects glob filter', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    writeFileSync(join(tmpDir, 'big.ts'), lines);
    writeFileSync(join(tmpDir, 'big.js'), lines);

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe('big.ts');
  });

  it('returns empty when no files match glob', () => {
    writeFileSync(join(tmpDir, 'a.py'), 'x\n'.repeat(100));

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(0);
  });

  it('handles empty files', () => {
    writeFileSync(join(tmpDir, 'empty.ts'), '');

    const violations = runFileSizeCheck(tmpDir, {
      type: 'file-size',
      glob: '**/*.ts',
      maxLines: 5,
    });

    expect(violations).toHaveLength(0);
  });
});
