/**
 * Regression test: runUpdate() must process DOC_TEMPLATES.
 * Ensures --update installs split docs AND removes legacy HOW_TO_COMPOUND.md.
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
    // updated count includes the HOW_TO_COMPOUND removal
    expect(result.updated).toBeGreaterThanOrEqual(1);
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
