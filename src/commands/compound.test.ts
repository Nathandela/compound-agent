/**
 * Tests for compound CLI command.
 *
 * Tests the `ca compound` command that synthesizes CCT patterns from lessons.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CCT_PATTERNS_PATH } from '../compound/types.js';
import { appendLesson } from '../memory/storage/jsonl.js';
import { closeDb, rebuildIndex } from '../memory/storage/sqlite/index.js';
import { createQuickLesson, setupCliTestContext } from '../test-utils.js';

describe('compound command', () => {
  const { getTempDir, runCli } = setupCliTestContext();

  it('handles empty lesson store gracefully', () => {
    const { combined } = runCli('compound');
    expect(combined).toMatch(/0 patterns/i);
  });

  it('synthesizes patterns from lessons', async () => {
    // Add several similar lessons that should cluster together
    await appendLesson(getTempDir(), createQuickLesson('L001', 'Always use const instead of let', { tags: ['typescript', 'style'] }));
    await appendLesson(getTempDir(), createQuickLesson('L002', 'Prefer const over let for immutability', { tags: ['typescript', 'style'] }));
    await appendLesson(getTempDir(), createQuickLesson('L003', 'Use const by default, let only when needed', { tags: ['typescript', 'style'] }));
    // Add a dissimilar lesson
    await appendLesson(getTempDir(), createQuickLesson('L004', 'Run tests before committing', { tags: ['testing', 'workflow'] }));
    await rebuildIndex(getTempDir());
    closeDb();

    const { combined } = runCli('compound');
    expect(combined).toMatch(/synthesized/i);
    expect(combined).toMatch(/pattern/i);
  });

  it('outputs count of synthesized patterns', async () => {
    await appendLesson(getTempDir(), createQuickLesson('L001', 'lesson one', { tags: ['a'] }));
    await appendLesson(getTempDir(), createQuickLesson('L002', 'lesson two', { tags: ['a'] }));
    await rebuildIndex(getTempDir());
    closeDb();

    const { combined } = runCli('compound');
    // Output should contain a number followed by "pattern(s)"
    expect(combined).toMatch(/\d+ pattern/i);
  });

  it('creates cct-patterns.jsonl file', async () => {
    await appendLesson(getTempDir(), createQuickLesson('L001', 'lesson alpha', { tags: ['x'] }));
    await appendLesson(getTempDir(), createQuickLesson('L002', 'lesson beta', { tags: ['x'] }));
    await rebuildIndex(getTempDir());
    closeDb();

    runCli('compound');

    const filePath = join(getTempDir(), CCT_PATTERNS_PATH);
    const content = await readFile(filePath, 'utf-8');
    // File should contain valid JSONL
    const lines = content.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('shows help for compound command', () => {
    const { combined } = runCli('compound --help');
    expect(combined).toMatch(/synthesize|compound/i);
  });
});
