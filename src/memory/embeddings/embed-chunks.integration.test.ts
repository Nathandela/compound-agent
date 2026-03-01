/**
 * Embedding-dependent tests for embed-chunks module.
 *
 * This file exists to keep embedding tests in the singleFork pool
 * (src/memory/embeddings/**), which provides safe native memory isolation.
 * Running these in the thread pool causes SIGABRT during worker cleanup
 * because node-llama-cpp allocates native memory that cannot be safely
 * freed across threads.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isModelAvailable, unloadEmbedding } from './nomic.js';
import { getCachedChunkEmbedding } from '../storage/sqlite-knowledge/cache.js';
import { closeKnowledgeDb, openKnowledgeDb } from '../storage/sqlite-knowledge/connection.js';
import { upsertChunks } from '../storage/sqlite-knowledge/sync.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';
import { shouldSkipEmbeddingTests } from '../../test-utils.js';
import { chunkContentHash } from '../knowledge/types.js';
import { embedChunks, getUnembeddedChunkCount } from '../knowledge/embed-chunks.js';

// ---------------------------------------------------------------------------
// Skip logic
// ---------------------------------------------------------------------------

const modelAvailable = isModelAvailable();
const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);

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
  repoRoot = await mkdtemp(join(tmpdir(), 'embed-chunks-int-'));
  openKnowledgeDb(repoRoot);
});

afterEach(async () => {
  closeKnowledgeDb();
  await rm(repoRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Embedding tests
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

    // Only C2 should have been embedded; C1 was already embedded and skipped
    expect(result.chunksEmbedded).toBe(1);
    expect(result.chunksSkipped).toBe(1);
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
