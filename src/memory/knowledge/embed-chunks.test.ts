/**
 * Unit tests for embed-chunks module (no embedding model needed).
 *
 * Written BEFORE implementation (TDD).
 *
 * Embedding-dependent tests live in src/memory/embeddings/embed-chunks.integration.test.ts
 * so they run in the singleFork pool (safe native memory isolation).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeKnowledgeDb, openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { upsertChunks } from '../storage/sqlite-knowledge/sync.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import { chunkContentHash } from './types.js';

import { getUnembeddedChunkCount } from './embed-chunks.js';

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
  repoRoot = await mkdtemp(join(tmpdir(), 'embed-chunks-test-'));
  openKnowledgeDb(repoRoot);
});

afterEach(async () => {
  closeKnowledgeDb();
  await rm(repoRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit tests (no model needed)
// ---------------------------------------------------------------------------

describe('getUnembeddedChunkCount', () => {
  it('returns 0 for empty DB', () => {
    const count = getUnembeddedChunkCount(repoRoot);
    expect(count).toBe(0);
  });

  it('returns correct count after upserting chunks without embeddings', () => {
    const chunks = [
      makeChunk('C1', 'first chunk text'),
      makeChunk('C2', 'second chunk text'),
      makeChunk('C3', 'third chunk text'),
    ];
    upsertChunks(repoRoot, chunks);

    const count = getUnembeddedChunkCount(repoRoot);
    expect(count).toBe(3);
  });

  it('returns 0 when all chunks have embeddings', () => {
    const chunks = [
      makeChunk('C1', 'first chunk text'),
      makeChunk('C2', 'second chunk text'),
    ];
    const embeddings = new Map<string, Float32Array>([
      ['C1', new Float32Array([0.1, 0.2, 0.3])],
      ['C2', new Float32Array([0.4, 0.5, 0.6])],
    ]);
    upsertChunks(repoRoot, chunks, embeddings);

    const count = getUnembeddedChunkCount(repoRoot);
    expect(count).toBe(0);
  });
});

