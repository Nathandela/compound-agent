/**
 * Tests for upgradeDocVersion in upgrade module.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { upgradeDocVersion } from './upgrade.js';

describe('upgradeDocVersion', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'upgrade-doc-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('updates the version line in an existing doc', async () => {
    const docsDir = join(tempDir, 'docs', 'compound');
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      join(docsDir, 'README.md'),
      '---\nversion: "1.0.0"\nlast-updated: "2026-01-01"\n---\n\n# Compound Agent\n',
      'utf-8'
    );

    const updated = await upgradeDocVersion(tempDir, '2.0.0');

    expect(updated).toBe(true);
    const content = await readFile(join(docsDir, 'README.md'), 'utf-8');
    expect(content).toContain('version: "2.0.0"');
    expect(content).not.toContain('version: "1.0.0"');
  });

  it('returns false when doc does not exist', async () => {
    const updated = await upgradeDocVersion(tempDir, '2.0.0');

    expect(updated).toBe(false);
  });

  it('returns false when version is already current', async () => {
    const docsDir = join(tempDir, 'docs', 'compound');
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      join(docsDir, 'README.md'),
      '---\nversion: "2.0.0"\nlast-updated: "2026-02-20"\n---\n\n# Compound Agent\n',
      'utf-8'
    );

    const updated = await upgradeDocVersion(tempDir, '2.0.0');

    expect(updated).toBe(false);
  });

  it('preserves other content in the file', async () => {
    const docsDir = join(tempDir, 'docs', 'compound');
    await mkdir(docsDir, { recursive: true });
    const original = '---\nversion: "1.0.0"\nlast-updated: "2026-01-01"\nsummary: "Test"\n---\n\n# Compound Agent\n\nBody content here.\n';
    await writeFile(join(docsDir, 'README.md'), original, 'utf-8');

    await upgradeDocVersion(tempDir, '2.0.0');

    const content = await readFile(join(docsDir, 'README.md'), 'utf-8');
    expect(content).toContain('summary: "Test"');
    expect(content).toContain('Body content here.');
    expect(content).toContain('# Compound Agent');
  });
});
