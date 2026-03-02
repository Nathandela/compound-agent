/**
 * Tests for .gitignore injection module.
 *
 * Follows TDD: Tests written BEFORE implementation.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureGitignore, type GitignoreResult } from './gitignore.js';

/** Required patterns that must be in .gitignore. */
const REQUIRED_PATTERNS = ['node_modules/', '.claude/.cache/', '.claude/.ca-*.json'];

describe('ensureGitignore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-gitignore-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // No .gitignore exists
  // ============================================================================

  it('creates .gitignore when none exists', async () => {
    const result = await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.claude/.cache/');
    expect(content).toContain('.claude/.ca-*.json');
    expect(result.added.length).toBeGreaterThan(0);
  });

  it('includes section comment in newly created .gitignore', async () => {
    await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('# compound-agent');
  });

  // ============================================================================
  // .gitignore exists but missing patterns
  // ============================================================================

  it('appends missing patterns to existing .gitignore', async () => {
    await writeFile(join(tempDir, '.gitignore'), 'dist/\n', 'utf-8');

    const result = await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('dist/');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.claude/.cache/');
    expect(content).toContain('.claude/.ca-*.json');
    expect(result.added).toContain('node_modules/');
    expect(result.added).toContain('.claude/.cache/');
    expect(result.added).toContain('.claude/.ca-*.json');
  });

  it('appends under section comment when adding to existing .gitignore', async () => {
    await writeFile(join(tempDir, '.gitignore'), 'dist/\n', 'utf-8');

    await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    const sectionIdx = content.indexOf('# compound-agent');
    const nodeModulesIdx = content.indexOf('node_modules/');
    // Section comment should appear before the injected patterns
    expect(sectionIdx).toBeGreaterThan(-1);
    expect(nodeModulesIdx).toBeGreaterThan(sectionIdx);
  });

  it('appends only missing patterns when some already exist', async () => {
    await writeFile(join(tempDir, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');

    const result = await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.claude/.cache/');
    // node_modules/ was already present, should not be in added
    expect(result.added).not.toContain('node_modules/');
    expect(result.added).toContain('.claude/.cache/');
  });

  // ============================================================================
  // .gitignore already has all patterns
  // ============================================================================

  it('returns empty added array when all patterns exist', async () => {
    await writeFile(
      join(tempDir, '.gitignore'),
      'node_modules/\n.claude/.cache/\n.claude/.ca-*.json\ndist/\n',
      'utf-8'
    );

    const result = await ensureGitignore(tempDir);

    expect(result.added).toEqual([]);
  });

  it('does not duplicate patterns on repeated calls', async () => {
    await ensureGitignore(tempDir);
    await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    const nodeModulesCount = (content.match(/node_modules\//g) || []).length;
    expect(nodeModulesCount).toBe(1);
  });

  // ============================================================================
  // Edge cases
  // ============================================================================

  it('handles empty .gitignore file', async () => {
    await writeFile(join(tempDir, '.gitignore'), '', 'utf-8');

    const result = await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    for (const pattern of REQUIRED_PATTERNS) {
      expect(content).toContain(pattern);
    }
    expect(result.added.length).toBe(REQUIRED_PATTERNS.length);
  });

  it('does not modify unrelated lines in existing .gitignore', async () => {
    const original = '# My project\ndist/\n*.log\n.env\n';
    await writeFile(join(tempDir, '.gitignore'), original, 'utf-8');

    await ensureGitignore(tempDir);

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('# My project');
    expect(content).toContain('dist/');
    expect(content).toContain('*.log');
    expect(content).toContain('.env');
  });

  // ============================================================================
  // Return type
  // ============================================================================

  it('returns GitignoreResult with added array', async () => {
    const result = await ensureGitignore(tempDir);

    expect(result).toHaveProperty('added');
    expect(Array.isArray(result.added)).toBe(true);
  });
});
