import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readConfig,
  writeConfig,
  getExternalReviewers,
  enableReviewer,
  disableReviewer,
  CONFIG_FILENAME,
  VALID_REVIEWERS,
  VALID_LOOP_REVIEWERS,
} from './index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `ca-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(tempDir, '.claude'), { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('CONFIG_FILENAME', () => {
  it('is compound-agent.json', () => {
    expect(CONFIG_FILENAME).toBe('compound-agent.json');
  });
});

describe('VALID_REVIEWERS', () => {
  it('includes gemini and codex', () => {
    expect(VALID_REVIEWERS).toContain('gemini');
    expect(VALID_REVIEWERS).toContain('codex');
  });
});

describe('VALID_LOOP_REVIEWERS', () => {
  it('includes claude-sonnet, claude-opus, gemini, codex', () => {
    expect(VALID_LOOP_REVIEWERS).toContain('claude-sonnet');
    expect(VALID_LOOP_REVIEWERS).toContain('claude-opus');
    expect(VALID_LOOP_REVIEWERS).toContain('gemini');
    expect(VALID_LOOP_REVIEWERS).toContain('codex');
  });

  it('has exactly 4 entries', () => {
    expect(VALID_LOOP_REVIEWERS).toHaveLength(4);
  });
});

describe('readConfig', () => {
  it('returns empty config when file does not exist', async () => {
    const config = await readConfig(tempDir);
    expect(config).toEqual({});
  });

  it('reads existing config file', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: ['gemini'] }), 'utf-8');

    const config = await readConfig(tempDir);
    expect(config.externalReviewers).toEqual(['gemini']);
  });

  it('returns empty config for malformed JSON', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, 'not-json', 'utf-8');

    const config = await readConfig(tempDir);
    expect(config).toEqual({});
  });

  it('returns empty config when file contains a non-object', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, '"just a string"', 'utf-8');

    const config = await readConfig(tempDir);
    expect(config).toEqual({});
  });
});

describe('writeConfig', () => {
  it('creates config file in .claude/', async () => {
    await writeConfig(tempDir, { externalReviewers: ['gemini'] });

    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    expect(existsSync(configPath)).toBe(true);

    const content = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(content.externalReviewers).toEqual(['gemini']);
  });

  it('overwrites existing config', async () => {
    await writeConfig(tempDir, { externalReviewers: ['gemini'] });
    await writeConfig(tempDir, { externalReviewers: ['codex'] });

    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    const content = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(content.externalReviewers).toEqual(['codex']);
  });

  it('creates .claude/ directory if missing', async () => {
    const freshDir = join(tmpdir(), `ca-config-fresh-${Date.now()}`);
    try {
      await mkdir(freshDir, { recursive: true });
      await writeConfig(freshDir, { externalReviewers: [] });
      expect(existsSync(join(freshDir, '.claude', CONFIG_FILENAME))).toBe(true);
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });
});

describe('getExternalReviewers', () => {
  it('returns empty array when no config', async () => {
    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual([]);
  });

  it('returns configured reviewers', async () => {
    await writeConfig(tempDir, { externalReviewers: ['gemini', 'codex'] });
    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['gemini', 'codex']);
  });

  it('filters out invalid reviewer names', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: ['gemini', 'invalid-tool', 'codex'] }), 'utf-8');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['gemini', 'codex']);
  });

  it('returns empty array when externalReviewers is a string (malformed)', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: 'gemini' }), 'utf-8');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual([]);
  });

  it('returns empty array when externalReviewers is a number (malformed)', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: 42 }), 'utf-8');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual([]);
  });

  it('returns empty array when externalReviewers is null', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: null }), 'utf-8');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual([]);
  });
});

describe('enableReviewer', () => {
  it('handles malformed externalReviewers (string) without corrupting', async () => {
    const configPath = join(tempDir, '.claude', CONFIG_FILENAME);
    await writeFile(configPath, JSON.stringify({ externalReviewers: 'gemini' }), 'utf-8');

    await enableReviewer(tempDir, 'codex');
    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['codex']);
  });

  it('adds reviewer to empty config', async () => {
    const result = await enableReviewer(tempDir, 'gemini');
    expect(result).toBe(true);

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['gemini']);
  });

  it('returns false when reviewer already enabled', async () => {
    await enableReviewer(tempDir, 'gemini');
    const result = await enableReviewer(tempDir, 'gemini');
    expect(result).toBe(false);
  });

  it('adds second reviewer without removing first', async () => {
    await enableReviewer(tempDir, 'gemini');
    await enableReviewer(tempDir, 'codex');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['gemini', 'codex']);
  });

  it('rejects invalid reviewer name', async () => {
    await expect(enableReviewer(tempDir, 'invalid')).rejects.toThrow(/invalid reviewer/i);
  });
});

describe('disableReviewer', () => {
  it('removes an enabled reviewer', async () => {
    await enableReviewer(tempDir, 'gemini');
    const result = await disableReviewer(tempDir, 'gemini');
    expect(result).toBe(true);

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual([]);
  });

  it('returns false when reviewer not enabled', async () => {
    const result = await disableReviewer(tempDir, 'gemini');
    expect(result).toBe(false);
  });

  it('only removes the specified reviewer', async () => {
    await enableReviewer(tempDir, 'gemini');
    await enableReviewer(tempDir, 'codex');
    await disableReviewer(tempDir, 'gemini');

    const reviewers = await getExternalReviewers(tempDir);
    expect(reviewers).toEqual(['codex']);
  });
});
