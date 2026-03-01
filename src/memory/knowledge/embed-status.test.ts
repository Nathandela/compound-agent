/**
 * Tests for embedding status file module.
 *
 * Written BEFORE implementation (TDD).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeEmbedStatus, readEmbedStatus, type EmbedStatus } from './embed-status.js';

// ---------------------------------------------------------------------------
// Setup: temp directory per test
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'embed-status-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Roundtrip tests
// ---------------------------------------------------------------------------

describe('writeEmbedStatus / readEmbedStatus roundtrip', () => {
  it('roundtrips correctly for idle state', () => {
    const status: EmbedStatus = { state: 'idle' };
    writeEmbedStatus(tempDir, status);
    const result = readEmbedStatus(tempDir);
    expect(result).toEqual(status);
  });

  it('roundtrips correctly for running state', () => {
    const status: EmbedStatus = {
      state: 'running',
      startedAt: '2026-02-28T12:00:00.000Z',
    };
    writeEmbedStatus(tempDir, status);
    const result = readEmbedStatus(tempDir);
    expect(result).toEqual(status);
  });

  it('roundtrips correctly for completed state', () => {
    const status: EmbedStatus = {
      state: 'completed',
      chunksEmbedded: 100,
      completedAt: '2026-02-28T12:01:30.000Z',
      durationMs: 90000,
    };
    writeEmbedStatus(tempDir, status);
    const result = readEmbedStatus(tempDir);
    expect(result).toEqual(status);
  });

  it('roundtrips correctly for failed state with error', () => {
    const status: EmbedStatus = {
      state: 'failed',
      error: 'Out of memory',
      durationMs: 45000,
    };
    writeEmbedStatus(tempDir, status);
    const result = readEmbedStatus(tempDir);
    expect(result).toEqual(status);
  });
});

// ---------------------------------------------------------------------------
// Graceful read behavior
// ---------------------------------------------------------------------------

describe('readEmbedStatus graceful behavior', () => {
  it('returns null when file does not exist', () => {
    const result = readEmbedStatus(tempDir);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON content', () => {
    const statusPath = join(tempDir, '.claude', '.cache');
    mkdirSync(statusPath, { recursive: true });
    writeFileSync(join(statusPath, 'embed-status.json'), '{not valid json!!!', 'utf-8');
    const result = readEmbedStatus(tempDir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Directory creation
// ---------------------------------------------------------------------------

describe('writeEmbedStatus directory creation', () => {
  it('creates parent directory if missing', () => {
    const nested = join(tempDir, 'deep', 'nested', 'repo');
    const status: EmbedStatus = { state: 'idle' };
    // Should not throw even though .claude/.cache doesn't exist yet
    writeEmbedStatus(nested, status);
    const result = readEmbedStatus(nested);
    expect(result).toEqual(status);
  });
});
