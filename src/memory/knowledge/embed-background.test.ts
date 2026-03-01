/**
 * Tests for background embedding module.
 *
 * Written BEFORE implementation (TDD).
 *
 * Unit tests for spawnBackgroundEmbed use mocks to avoid model/DB dependencies.
 * Integration tests for runBackgroundEmbed mock only embedChunks and the
 * embedding module to avoid loading the actual model.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeKnowledgeDb, openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { upsertChunks } from '../storage/sqlite-knowledge/sync.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import { readEmbedStatus } from './embed-status.js';
import { acquireEmbedLock, isEmbedLocked } from './embed-lock.js';
import { chunkContentHash } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./embed-chunks.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./embed-chunks.js')>();
  return {
    ...actual,
    embedChunks: vi.fn().mockResolvedValue({ chunksEmbedded: 5, chunksSkipped: 0, durationMs: 100 }),
  };
});

vi.mock('../embeddings/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../embeddings/index.js')>();
  return {
    ...actual,
    isModelAvailable: vi.fn().mockReturnValue(true),
    unloadEmbedding: vi.fn(),
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn().mockReturnValue({ unref: vi.fn(), pid: 12345 }),
  };
});

// Import after mocks are set up
import { spawn } from 'node:child_process';
import { isModelAvailable } from '../embeddings/index.js';
import { embedChunks } from './embed-chunks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let repoRoot: string;

function makeChunk(id: string, text: string): KnowledgeChunk {
  return {
    id,
    filePath: 'test.md',
    startLine: 1,
    endLine: 10,
    contentHash: chunkContentHash(text),
    text,
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'embed-bg-test-'));
  openKnowledgeDb(repoRoot);

  // Reset mock return values (vi.mock factory runs once; reset between tests)
  vi.mocked(isModelAvailable).mockReturnValue(true);
  vi.mocked(embedChunks).mockResolvedValue({ chunksEmbedded: 5, chunksSkipped: 0, durationMs: 100 });
});

afterEach(async () => {
  closeKnowledgeDb();
  await rm(repoRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// spawnBackgroundEmbed: unit tests
// ---------------------------------------------------------------------------

describe('spawnBackgroundEmbed', () => {
  it('returns spawned:false when lock is held', async () => {
    const { spawnBackgroundEmbed } = await import('./embed-background.js');

    // Hold the lock manually
    const lock = acquireEmbedLock(repoRoot);
    expect(lock.acquired).toBe(true);

    // Insert chunks so count > 0
    upsertChunks(repoRoot, [makeChunk('C1', 'test chunk')]);

    const result = spawnBackgroundEmbed(repoRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toBe('Embedding already in progress');

    if (lock.acquired) lock.release();
  });

  it('returns spawned:false when unembedded count is 0', async () => {
    const { spawnBackgroundEmbed } = await import('./embed-background.js');

    // No chunks in DB means count is 0
    const result = spawnBackgroundEmbed(repoRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toBe('All chunks already embedded');
  });

  it('returns spawned:false when model is not available', async () => {
    const { spawnBackgroundEmbed } = await import('./embed-background.js');

    // Make model unavailable
    vi.mocked(isModelAvailable).mockReturnValue(false);

    // Insert chunks so count > 0
    upsertChunks(repoRoot, [makeChunk('C1', 'test chunk')]);

    const result = spawnBackgroundEmbed(repoRoot);
    expect(result.spawned).toBe(false);
    expect(result.reason).toBe('Model not available');
  });

  it('spawns npx ca embed-worker and returns pid on happy path', async () => {
    const { spawnBackgroundEmbed } = await import('./embed-background.js');

    // Insert chunks so count > 0
    upsertChunks(repoRoot, [makeChunk('C1', 'test chunk')]);

    const result = spawnBackgroundEmbed(repoRoot);
    expect(result.spawned).toBe(true);
    expect(result.pid).toBe(12345);

    // Verify spawn was called with correct args
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['ca', 'embed-worker', repoRoot],
      { detached: true, stdio: 'ignore' },
    );
  });
});

// ---------------------------------------------------------------------------
// runBackgroundEmbed: integration tests (with mocked embedChunks)
// ---------------------------------------------------------------------------

describe('runBackgroundEmbed', () => {
  it('writes running then completed status and releases lock', async () => {
    const { runBackgroundEmbed } = await import('./embed-background.js');

    // Insert some chunks so there's work to do
    upsertChunks(repoRoot, [
      makeChunk('C1', 'chunk one'),
      makeChunk('C2', 'chunk two'),
    ]);

    await runBackgroundEmbed(repoRoot);

    // Status should be completed
    const status = readEmbedStatus(repoRoot);
    expect(status).not.toBeNull();
    expect(status!.state).toBe('completed');
    expect(status!.chunksEmbedded).toBe(5); // from mock
    expect(status!.completedAt).toBeDefined();
    expect(status!.durationMs).toBeDefined();

    // Lock should be released
    expect(isEmbedLocked(repoRoot)).toBe(false);
  });

  it('writes failed status and releases lock on error', async () => {
    vi.mocked(embedChunks).mockRejectedValueOnce(new Error('Embedding exploded'));

    const { runBackgroundEmbed } = await import('./embed-background.js');

    await runBackgroundEmbed(repoRoot);

    const status = readEmbedStatus(repoRoot);
    expect(status).not.toBeNull();
    expect(status!.state).toBe('failed');
    expect(status!.error).toBe('Embedding exploded');
    expect(status!.durationMs).toBeDefined();

    // Lock should be released
    expect(isEmbedLocked(repoRoot)).toBe(false);
  });

  it('lock is released after run completes', async () => {
    const { runBackgroundEmbed } = await import('./embed-background.js');

    upsertChunks(repoRoot, [makeChunk('C1', 'some text')]);

    // Before run, no lock
    expect(isEmbedLocked(repoRoot)).toBe(false);

    await runBackgroundEmbed(repoRoot);

    // After run, lock released
    expect(isEmbedLocked(repoRoot)).toBe(false);

    // Can acquire lock again (proves it was properly released)
    const lock = acquireEmbedLock(repoRoot);
    expect(lock.acquired).toBe(true);
    if (lock.acquired) lock.release();
  });
});
