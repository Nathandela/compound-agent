/**
 * Tests for embed-chunks module.
 *
 * Written BEFORE implementation (TDD).
 *
 * Unit tests run without the embedding model.
 * Embedding tests are conditionally skipped when the model is unavailable.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelUsable } from '../embeddings/model.js';
import { isModelAvailable, unloadEmbedding } from '../embeddings/nomic.js';
import { getCachedChunkEmbedding } from '../storage/sqlite-knowledge/cache.js';
import { closeKnowledgeDb, openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { upsertChunks } from '../storage/sqlite-knowledge/sync.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import { shouldSkipEmbeddingTests } from '../../test-utils.js';
import { chunkContentHash } from './types.js';

import { embedChunks, getUnembeddedChunkCount } from './embed-chunks.js';

// ---------------------------------------------------------------------------
// Skip logic for embedding tests
// ---------------------------------------------------------------------------

const modelAvailable = isModelAvailable();
const modelUsability = modelAvailable ? await isModelUsable() : { usable: false as const };
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable, modelUsability.usable);

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

// ---------------------------------------------------------------------------
// Embedding tests (conditional skip)
// ---------------------------------------------------------------------------

describe('embedChunks', () => {
  afterAll(() => {
    unloadEmbedding();
  });

  it.skipIf(skipEmbedding)('embeds all unembedded chunks and returns correct stats', async () => {
    const chunks = [
      makeChunk('C1', 'TypeScript error handling patterns'),
      makeChunk('C2', 'Database connection pooling strategies'),
    ];
    upsertChunks(repoRoot, chunks);

    const result = await embedChunks(repoRoot);

    expect(result.chunksEmbedded).toBe(2);
    expect(result.chunksSkipped).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it.skipIf(skipEmbedding)('after embedChunks, getUnembeddedChunkCount returns 0', async () => {
    const chunks = [
      makeChunk('C1', 'Architecture design principles'),
      makeChunk('C2', 'Testing best practices'),
    ];
    upsertChunks(repoRoot, chunks);

    expect(getUnembeddedChunkCount(repoRoot)).toBe(2);
    await embedChunks(repoRoot);
    expect(getUnembeddedChunkCount(repoRoot)).toBe(0);
  });

  it.skipIf(skipEmbedding)('with onlyMissing:true skips already-embedded chunks', async () => {
    // Pre-embed C1 by upserting with an embedding
    const c1 = makeChunk('C1', 'Already embedded chunk');
    const embeddings = new Map<string, Float32Array>([
      ['C1', new Float32Array(768).fill(0.1)],
    ]);
    upsertChunks(repoRoot, [c1], embeddings);

    // Add C2 without embedding
    const c2 = makeChunk('C2', 'Newly added chunk without embedding');
    upsertChunks(repoRoot, [c2]);

    const result = await embedChunks(repoRoot, { onlyMissing: true });

    // Only C2 should have been embedded
    expect(result.chunksEmbedded).toBe(1);
    expect(result.chunksSkipped).toBe(0);
  });

  it.skipIf(skipEmbedding)('stored embedding is valid Float32Array of 768 dimensions', async () => {
    const chunk = makeChunk('C1', 'Validate embedding dimensions');
    upsertChunks(repoRoot, [chunk]);

    await embedChunks(repoRoot);

    const embedding = getCachedChunkEmbedding(repoRoot, 'C1');
    expect(embedding).not.toBeNull();
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding!.length).toBe(768);
    // Verify values are finite numbers
    for (const val of embedding!) {
      expect(Number.isFinite(val)).toBe(true);
    }
  });
});
