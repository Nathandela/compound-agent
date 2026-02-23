/**
 * Tests for the postinstall script (patchPnpmConfig function).
 *
 * TDD: Tests cover all edge cases for consumer package.json patching.
 * Run with: node --test scripts/postinstall.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { patchPnpmConfig } from './postinstall.mjs';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ca-postinstall-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('patchPnpmConfig', () => {

  it('returns null for non-pnpm project (no lockfile, no packageManager)', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));
    const result = patchPnpmConfig(tempDir);
    assert.equal(result, null);
  });

  it('returns null when no package.json exists', () => {
    const result = patchPnpmConfig(tempDir);
    assert.equal(result, null);
  });

  it('patches package.json when pnpm-lock.yaml exists and config is missing', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = patchPnpmConfig(tempDir);
    assert.notEqual(result, null);
    assert.deepEqual(result.added, ['better-sqlite3', 'node-llama-cpp']);
    // Verify file was actually written
    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    assert.deepEqual(pkg.pnpm.onlyBuiltDependencies, ['better-sqlite3', 'node-llama-cpp']);
  });

  it('patches when pnpm detected via packageManager field', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test',
      packageManager: 'pnpm@10.0.0',
    }));
    const result = patchPnpmConfig(tempDir);
    assert.notEqual(result, null);
    assert.deepEqual(result.added, ['better-sqlite3', 'node-llama-cpp']);
  });

  it('returns null when already fully configured', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test',
      pnpm: { onlyBuiltDependencies: ['better-sqlite3', 'node-llama-cpp'] },
    }));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = patchPnpmConfig(tempDir);
    assert.equal(result, null);
  });

  it('adds only missing dependencies when partially configured', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test',
      pnpm: { onlyBuiltDependencies: ['better-sqlite3'] },
    }));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = patchPnpmConfig(tempDir);
    assert.notEqual(result, null);
    assert.deepEqual(result.added, ['node-llama-cpp']);
    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    assert.deepEqual(pkg.pnpm.onlyBuiltDependencies, ['better-sqlite3', 'node-llama-cpp']);
  });

  it('is idempotent: running twice produces same result', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');

    patchPnpmConfig(tempDir);
    const contentAfterFirst = readFileSync(join(tempDir, 'package.json'), 'utf-8');

    const secondResult = patchPnpmConfig(tempDir);
    const contentAfterSecond = readFileSync(join(tempDir, 'package.json'), 'utf-8');

    assert.equal(secondResult, null); // No-op second time
    assert.equal(contentAfterFirst, contentAfterSecond);
  });

  it('returns null for malformed JSON', () => {
    writeFileSync(join(tempDir, 'package.json'), '{ invalid json }}}');
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = patchPnpmConfig(tempDir);
    assert.equal(result, null);
  });

  it('preserves existing package.json fields', () => {
    const original = { name: 'test', version: '1.0.0', scripts: { test: 'vitest' } };
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify(original, null, 2));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');

    patchPnpmConfig(tempDir);
    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    assert.equal(pkg.name, 'test');
    assert.equal(pkg.version, '1.0.0');
    assert.equal(pkg.scripts.test, 'vitest');
  });

  it('preserves indentation style (4 spaces)', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }, null, 4));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');

    patchPnpmConfig(tempDir);
    const content = readFileSync(join(tempDir, 'package.json'), 'utf-8');
    // Should use 4-space indent, not 2-space
    assert.ok(content.includes('    "name"'), 'Expected 4-space indentation');
  });

  it('preserves tab indentation', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }, null, '\t'));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');

    patchPnpmConfig(tempDir);
    const content = readFileSync(join(tempDir, 'package.json'), 'utf-8');
    assert.ok(content.includes('\t"name"'), 'Expected tab indentation');
  });

  it('handles UTF-8 BOM prefix', () => {
    const json = JSON.stringify({ name: 'test' });
    writeFileSync(join(tempDir, 'package.json'), '\uFEFF' + json, 'utf-8');
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const result = patchPnpmConfig(tempDir);
    assert.notEqual(result, null);
    assert.deepEqual(result.added, ['better-sqlite3', 'node-llama-cpp']);
  });

  it('preserves existing pnpm overrides when adding onlyBuiltDependencies', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test',
      pnpm: { overrides: { tar: '>=7.0.0' } },
    }));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');

    patchPnpmConfig(tempDir);
    const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
    assert.deepEqual(pkg.pnpm.overrides, { tar: '>=7.0.0' });
    assert.deepEqual(pkg.pnpm.onlyBuiltDependencies, ['better-sqlite3', 'node-llama-cpp']);
  });

  it('ignores yarn projects', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test',
      packageManager: 'yarn@4.0.0',
    }));
    const result = patchPnpmConfig(tempDir);
    assert.equal(result, null);
  });
});
