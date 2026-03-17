/**
 * Regression test: runUpdate() must process DOC_TEMPLATES and clean deprecated paths.
 * Ensures --update installs split docs, removes legacy HOW_TO_COMPOUND.md,
 * and cleans deprecated worktree files.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runUpdate } from './all.js';
import { DOC_TEMPLATES } from './templates/index.js';

const DOC_FILENAMES = Object.keys(DOC_TEMPLATES);

describe('runUpdate doc templates', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'update-docs-test-'));
    // Minimal existing install so runUpgrade detects it
    const lessonsDir = join(tempDir, '.claude', 'lessons');
    await mkdir(lessonsDir, { recursive: true });
    await writeFile(join(lessonsDir, 'index.jsonl'), '', 'utf-8');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('installs all split doc files when docs/compound/ does not exist', async () => {
    const result = await runUpdate(tempDir, false);

    for (const filename of DOC_FILENAMES) {
      expect(
        existsSync(join(tempDir, 'docs', 'compound', filename)),
        `Expected ${filename} to exist`,
      ).toBe(true);
    }
    expect(result.added).toBeGreaterThanOrEqual(DOC_FILENAMES.length);
  });

  it('removes legacy HOW_TO_COMPOUND.md and installs replacements', async () => {
    // Set up legacy doc
    const docDir = join(tempDir, 'docs', 'compound');
    await mkdir(docDir, { recursive: true });
    await writeFile(
      join(docDir, 'HOW_TO_COMPOUND.md'),
      '---\nversion: "1.0.0"\n---\nOld monolithic doc',
      'utf-8',
    );

    const result = await runUpdate(tempDir, false);

    // Legacy file removed
    expect(existsSync(join(docDir, 'HOW_TO_COMPOUND.md'))).toBe(false);
    // Split docs installed
    for (const filename of DOC_FILENAMES) {
      expect(
        existsSync(join(docDir, filename)),
        `Expected ${filename} to exist after migration`,
      ).toBe(true);
    }
    // HOW_TO_COMPOUND removal tracked in staleRemoved (dynamic cleanup)
    expect(result.staleRemoved.length).toBeGreaterThanOrEqual(1);
  });

  it('replaces {{VERSION}} and {{DATE}} placeholders in installed docs', async () => {
    await runUpdate(tempDir, false);

    const content = await readFile(
      join(tempDir, 'docs', 'compound', 'README.md'),
      'utf-8',
    );
    expect(content).not.toContain('{{VERSION}}');
    expect(content).not.toContain('{{DATE}}');
    expect(content).toMatch(/version: "\d+\.\d+\.\d+/);
  });

  it('dry-run does not create doc files', async () => {
    await runUpdate(tempDir, true);

    for (const filename of DOC_FILENAMES) {
      expect(existsSync(join(tempDir, 'docs', 'compound', filename))).toBe(false);
    }
  });
});

describe('runUpdate deprecated path cleanup', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'deprecated-paths-test-'));
    const lessonsDir = join(tempDir, '.claude', 'lessons');
    await mkdir(lessonsDir, { recursive: true });
    await writeFile(join(lessonsDir, 'index.jsonl'), '', 'utf-8');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes deprecated .claude worktree paths', async () => {
    const skillDir = join(tempDir, '.claude', 'skills', 'compound', 'set-worktree');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'old skill', 'utf-8');

    const cmdPath = join(tempDir, '.claude', 'commands', 'compound', 'set-worktree.md');
    await mkdir(join(tempDir, '.claude', 'commands', 'compound'), { recursive: true });
    await writeFile(cmdPath, 'old command', 'utf-8');

    const result = await runUpdate(tempDir, false);

    expect(existsSync(skillDir)).toBe(false);
    expect(existsSync(cmdPath)).toBe(false);
    expect(result.staleRemoved.length).toBeGreaterThanOrEqual(2);
  });

  it('removes deprecated .gemini worktree paths', async () => {
    const geminiSkill = join(tempDir, '.gemini', 'skills', 'compound-set-worktree');
    await mkdir(geminiSkill, { recursive: true });
    await writeFile(join(geminiSkill, 'SKILL.md'), 'old gemini skill', 'utf-8');

    const geminiCmd = join(tempDir, '.gemini', 'commands', 'compound', 'set-worktree.toml');
    await mkdir(join(tempDir, '.gemini', 'commands', 'compound'), { recursive: true });
    await writeFile(geminiCmd, 'old toml', 'utf-8');

    const result = await runUpdate(tempDir, false);

    expect(existsSync(geminiSkill)).toBe(false);
    expect(existsSync(geminiCmd)).toBe(false);
    expect(result.staleRemoved.length).toBeGreaterThanOrEqual(2);
  });

  it('no-ops when deprecated paths do not exist', async () => {
    const result = await runUpdate(tempDir, false);
    // Should still succeed; updated count comes from template changes only
    expect(result).toBeDefined();
  });

  it('dry-run counts but does not delete deprecated paths', async () => {
    const skillDir = join(tempDir, '.claude', 'skills', 'compound', 'set-worktree');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), 'old skill', 'utf-8');

    await runUpdate(tempDir, true);

    expect(existsSync(skillDir)).toBe(true);
  });
});
