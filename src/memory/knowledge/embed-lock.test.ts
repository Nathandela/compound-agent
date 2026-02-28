/**
 * Tests for PID-based embed lock file.
 *
 * Written BEFORE implementation (TDD).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireEmbedLock, isEmbedLocked } from './embed-lock.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'embed-lock-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// acquireEmbedLock: basic acquire
// ---------------------------------------------------------------------------

describe('acquireEmbedLock', () => {
  it('creates lock file with current PID', () => {
    const result = acquireEmbedLock(tempDir);

    expect(result.acquired).toBe(true);

    const lockPath = join(tempDir, '.claude', '.cache', 'embed.lock');
    expect(existsSync(lockPath)).toBe(true);

    const content = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);
    expect(typeof content.startedAt).toBe('string');
    // Verify it's a valid ISO timestamp
    expect(new Date(content.startedAt).toISOString()).toBe(content.startedAt);

    // Clean up
    if (result.acquired) result.release();
  });

  it('returns acquired: false with holder PID on double acquire', () => {
    const first = acquireEmbedLock(tempDir);
    expect(first.acquired).toBe(true);

    const second = acquireEmbedLock(tempDir);
    expect(second.acquired).toBe(false);
    if (!second.acquired) {
      expect(second.holder).toBe(process.pid);
    }

    // Clean up
    if (first.acquired) first.release();
  });

  it('release() removes lock file', () => {
    const result = acquireEmbedLock(tempDir);
    expect(result.acquired).toBe(true);

    if (result.acquired) result.release();

    const lockPath = join(tempDir, '.claude', '.cache', 'embed.lock');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('allows re-acquire after release', () => {
    const first = acquireEmbedLock(tempDir);
    expect(first.acquired).toBe(true);
    if (first.acquired) first.release();

    const second = acquireEmbedLock(tempDir);
    expect(second.acquired).toBe(true);

    if (second.acquired) second.release();
  });

  it('overrides stale lock from dead PID', () => {
    // Write a lock file with a PID that does not exist
    const lockDir = join(tempDir, '.claude', '.cache');
    mkdirSync(lockDir, { recursive: true });
    const lockPath = join(lockDir, 'embed.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));

    const result = acquireEmbedLock(tempDir);
    expect(result.acquired).toBe(true);

    // Lock file should now have current PID
    const content = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(content.pid).toBe(process.pid);

    if (result.acquired) result.release();
  });

  it('creates lock file directory if missing', () => {
    const lockDir = join(tempDir, '.claude', '.cache');
    expect(existsSync(lockDir)).toBe(false);

    const result = acquireEmbedLock(tempDir);
    expect(result.acquired).toBe(true);
    expect(existsSync(lockDir)).toBe(true);

    if (result.acquired) result.release();
  });
});

// ---------------------------------------------------------------------------
// isEmbedLocked
// ---------------------------------------------------------------------------

describe('isEmbedLocked', () => {
  it('returns true when locked by live process', () => {
    const result = acquireEmbedLock(tempDir);
    expect(result.acquired).toBe(true);

    expect(isEmbedLocked(tempDir)).toBe(true);

    if (result.acquired) result.release();
  });

  it('returns false when not locked', () => {
    expect(isEmbedLocked(tempDir)).toBe(false);
  });

  it('returns false when lock is stale (dead PID)', () => {
    const lockDir = join(tempDir, '.claude', '.cache');
    mkdirSync(lockDir, { recursive: true });
    const lockPath = join(lockDir, 'embed.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }));

    expect(isEmbedLocked(tempDir)).toBe(false);
  });
});
