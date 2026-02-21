/**
 * Tests for installDocTemplates primitive.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installDocTemplates } from './primitives.js';

describe('installDocTemplates', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'doc-templates-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates docs/compound/HOW_TO_COMPOUND.md when it does not exist', async () => {
    const created = await installDocTemplates(tempDir);

    expect(created).toBe(true);
    const filePath = join(tempDir, 'docs', 'compound', 'HOW_TO_COMPOUND.md');
    expect(existsSync(filePath)).toBe(true);
  });

  it('creates the docs/compound/ directory if missing', async () => {
    await installDocTemplates(tempDir);

    expect(existsSync(join(tempDir, 'docs', 'compound'))).toBe(true);
  });

  it('does not overwrite existing file (idempotent)', async () => {
    const docsDir = join(tempDir, 'docs', 'compound');
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, 'HOW_TO_COMPOUND.md'), 'user content', 'utf-8');

    const created = await installDocTemplates(tempDir);

    expect(created).toBe(false);
    const content = await readFile(join(docsDir, 'HOW_TO_COMPOUND.md'), 'utf-8');
    expect(content).toBe('user content');
  });

  it('replaces the {{VERSION}} placeholder with the actual package version', async () => {
    await installDocTemplates(tempDir);

    const content = await readFile(
      join(tempDir, 'docs', 'compound', 'HOW_TO_COMPOUND.md'),
      'utf-8'
    );
    expect(content).not.toContain('{{VERSION}}');
    // Version should be a semver string
    expect(content).toMatch(/version: "\d+\.\d+\.\d+/);
  });

  it('written file starts with YAML frontmatter', async () => {
    await installDocTemplates(tempDir);

    const content = await readFile(
      join(tempDir, 'docs', 'compound', 'HOW_TO_COMPOUND.md'),
      'utf-8'
    );
    expect(content).toMatch(/^---\n/);
  });
});
