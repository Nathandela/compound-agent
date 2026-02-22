/**
 * Tests for post-commit hook installation.
 *
 * Mirrors the pre-commit hook test patterns from setup.test.ts.
 * TDD Phase 1: Tests written BEFORE implementation.
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';

import { installPostCommitHook } from './hooks.js';
import {
  POST_COMMIT_HOOK_MARKER,
  POST_COMMIT_HOOK_TEMPLATE,
  COMPOUND_AGENT_POST_COMMIT_BLOCK,
} from './templates.js';

describe('installPostCommitHook', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'post-commit-hook-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('installs new hook file when none exists', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('installed');
    const hookPath = join(hooksDir, 'post-commit');
    expect(existsSync(hookPath)).toBe(true);
    const content = await readFile(hookPath, 'utf-8');
    expect(content).toBe(POST_COMMIT_HOOK_TEMPLATE);
  });

  it('returns already_installed when marker present', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, 'post-commit'), POST_COMMIT_HOOK_TEMPLATE, 'utf-8');

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('already_installed');
  });

  it('appends to existing hook file without marker', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });
    const existingHook = '#!/bin/sh\necho "existing post-commit"\n';
    await writeFile(join(hooksDir, 'post-commit'), existingHook, 'utf-8');

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('appended');
    const content = await readFile(join(hooksDir, 'post-commit'), 'utf-8');
    expect(content).toContain('existing post-commit');
    expect(content).toContain(POST_COMMIT_HOOK_MARKER);
  });

  it('inserts before exit statement in existing hook', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });
    const existingHook = '#!/bin/sh\necho "do stuff"\nexit 0\n';
    await writeFile(join(hooksDir, 'post-commit'), existingHook, 'utf-8');

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('appended');
    const content = await readFile(join(hooksDir, 'post-commit'), 'utf-8');
    // Our block should appear before exit 0
    const markerIndex = content.indexOf(POST_COMMIT_HOOK_MARKER);
    const exitIndex = content.indexOf('exit 0');
    expect(markerIndex).toBeGreaterThan(-1);
    expect(exitIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeLessThan(exitIndex);
  });

  it('returns not_git_repo when no .git directory', async () => {
    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('not_git_repo');
  });

  it('hook file is executable (mode 755)', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });

    await installPostCommitHook(tempDir);

    const hookPath = join(hooksDir, 'post-commit');
    const stats = statSync(hookPath);
    // Check executable bit is set (at least 0o755)
    expect(stats.mode & 0o755).toBe(0o755);
  });

  it('hook content checks git diff-tree for docs/ changes', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });

    await installPostCommitHook(tempDir);

    const content = await readFile(join(hooksDir, 'post-commit'), 'utf-8');
    expect(content).toContain('git diff-tree');
    expect(content).toContain('docs/');
  });

  it('hook runs indexing in background (& suffix)', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });

    await installPostCommitHook(tempDir);

    const content = await readFile(join(hooksDir, 'post-commit'), 'utf-8');
    // Should have backgrounded command (ends with &)
    expect(content).toMatch(/&\s*$/m);
  });

  it('hook is non-blocking with stderr suppression', async () => {
    const hooksDir = join(tempDir, '.git', 'hooks');
    await mkdir(hooksDir, { recursive: true });

    await installPostCommitHook(tempDir);

    const content = await readFile(join(hooksDir, 'post-commit'), 'utf-8');
    expect(content).toContain('2>/dev/null');
  });

  it('returns not_git_repo when .git/hooks directory missing', async () => {
    // Create .git but not .git/hooks - getGitHooksDir returns null
    await mkdir(join(tempDir, '.git'), { recursive: true });

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('not_git_repo');
  });

  it('respects core.hooksPath configuration', async () => {
    const customHooksDir = join(tempDir, 'custom-hooks');
    await mkdir(customHooksDir, { recursive: true });
    await mkdir(join(tempDir, '.git'), { recursive: true });
    await writeFile(
      join(tempDir, '.git', 'config'),
      '[core]\n\thooksPath = custom-hooks\n',
      'utf-8'
    );

    const result = await installPostCommitHook(tempDir);

    expect(result.status).toBe('installed');
    expect(existsSync(join(customHooksDir, 'post-commit'))).toBe(true);
  });
});
