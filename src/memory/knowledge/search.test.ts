/**
 * Tests for knowledge search (vector + hybrid).
 *
 * Uses in-memory SQLite database; skips embedding-dependent tests
 * when model is unavailable.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeKnowledgeDb, openKnowledgeDb, upsertChunks } from '../storage/sqlite-knowledge/index.js';
import type { KnowledgeChunk } from '../storage/sqlite-knowledge/types.js';

import { searchKnowledge, searchKnowledgeVector } from './search.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testRepo: string;

function makeChunk(id: string, filePath: string, text: string, startLine = 1, endLine = 10): KnowledgeChunk {
  return {
    id,
    filePath,
    startLine,
    endLine,
    contentHash: `hash-${id}`,
    text,
    updatedAt: new Date().toISOString(),
  };
}

function seedChunks(chunks: KnowledgeChunk[], embeddings?: Map<string, Float32Array>): void {
  openKnowledgeDb(testRepo);
  upsertChunks(testRepo, chunks, embeddings);
}

beforeEach(async () => {
  testRepo = await mkdtemp(join(tmpdir(), 'knowledge-search-test-'));
});

afterEach(async () => {
  closeKnowledgeDb();
  vi.restoreAllMocks();
  await rm(testRepo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// searchKnowledgeVector
// ---------------------------------------------------------------------------

describe('searchKnowledgeVector', () => {
  it('returns empty when DB has no chunks', async () => {
    openKnowledgeDb(testRepo);
    const results = await searchKnowledgeVector(testRepo, 'anything');
    expect(results).toEqual([]);
  });

  it('returns empty when no chunks have embeddings', async () => {
    seedChunks([makeChunk('C1', 'docs/a.md', 'some text about architecture')]);
    // No embeddings stored -- should return empty
    const results = await searchKnowledgeVector(testRepo, 'architecture');
    expect(results).toEqual([]);
  });

  it('returns scored chunks sorted by cosine similarity', async () => {
    // Create fake embeddings (3-dim for simplicity)
    const queryLike = new Float32Array([1, 0, 0]);
    const closeEmb = new Float32Array([0.9, 0.1, 0]);
    const farEmb = new Float32Array([0, 0, 1]);

    const chunks = [
      makeChunk('C1', 'docs/a.md', 'close match text'),
      makeChunk('C2', 'docs/b.md', 'far match text'),
    ];
    const embeddingMap = new Map<string, Float32Array>([
      ['C1', closeEmb],
      ['C2', farEmb],
    ]);
    seedChunks(chunks, embeddingMap);

    // Mock embedText to return queryLike vector
    const embeddings = await import('../embeddings/nomic.js');
    vi.spyOn(embeddings, 'embedText').mockResolvedValue(queryLike);

    const results = await searchKnowledgeVector(testRepo, 'close');
    expect(results.length).toBe(2);
    // C1 should rank higher (closer to query vector)
    expect(results[0]!.item.id).toBe('C1');
    expect(results[1]!.item.id).toBe('C2');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('respects limit option', async () => {
    const queryLike = new Float32Array([1, 0, 0]);
    const chunks = [
      makeChunk('C1', 'docs/a.md', 'text 1'),
      makeChunk('C2', 'docs/b.md', 'text 2'),
      makeChunk('C3', 'docs/c.md', 'text 3'),
    ];
    const embeddingMap = new Map<string, Float32Array>([
      ['C1', new Float32Array([0.9, 0.1, 0])],
      ['C2', new Float32Array([0.8, 0.2, 0])],
      ['C3', new Float32Array([0.7, 0.3, 0])],
    ]);
    seedChunks(chunks, embeddingMap);

    const embeddings = await import('../embeddings/nomic.js');
    vi.spyOn(embeddings, 'embedText').mockResolvedValue(queryLike);

    const results = await searchKnowledgeVector(testRepo, 'test', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns GenericScoredItem<KnowledgeChunk> shape', async () => {
    const queryLike = new Float32Array([1, 0, 0]);
    const chunks = [makeChunk('C1', 'docs/a.md', 'text about architecture', 5, 20)];
    const embeddingMap = new Map<string, Float32Array>([
      ['C1', new Float32Array([0.9, 0.1, 0])],
    ]);
    seedChunks(chunks, embeddingMap);

    const embeddings = await import('../embeddings/nomic.js');
    vi.spyOn(embeddings, 'embedText').mockResolvedValue(queryLike);

    const results = await searchKnowledgeVector(testRepo, 'architecture');
    expect(results[0]).toHaveProperty('item');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]!.item).toHaveProperty('id', 'C1');
    expect(results[0]!.item).toHaveProperty('filePath', 'docs/a.md');
    expect(results[0]!.item).toHaveProperty('startLine', 5);
    expect(results[0]!.item).toHaveProperty('endLine', 20);
  });
});

// ---------------------------------------------------------------------------
// searchKnowledge (hybrid)
// ---------------------------------------------------------------------------

describe('searchKnowledge', () => {
  it('returns empty when DB has no chunks', async () => {
    openKnowledgeDb(testRepo);

    // Mock isModelUsable to avoid loading real model
    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({
      usable: false,
      reason: 'test',
      action: 'test',
    });

    const results = await searchKnowledge(testRepo, 'anything');
    expect(results).toEqual([]);
  });

  it('falls back to FTS-only when model is not usable', async () => {
    const chunks = [
      makeChunk('C1', 'docs/a.md', 'architecture patterns for TypeScript'),
      makeChunk('C2', 'docs/b.md', 'database connection pooling'),
    ];
    seedChunks(chunks);

    // Mock isModelUsable to return false
    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({
      usable: false,
      reason: 'test',
      action: 'test',
    });

    const results = await searchKnowledge(testRepo, 'architecture');
    // Should find C1 via FTS
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.item.id).toBe('C1');
  });

  it('uses hybrid merge when model is usable', async () => {
    const queryLike = new Float32Array([1, 0, 0]);
    const chunks = [
      makeChunk('C1', 'docs/a.md', 'architecture patterns overview'),
      makeChunk('C2', 'docs/b.md', 'connection pooling database'),
    ];
    const embeddingMap = new Map<string, Float32Array>([
      ['C1', new Float32Array([0.9, 0.1, 0])],
      ['C2', new Float32Array([0, 0, 1])],
    ]);
    seedChunks(chunks, embeddingMap);

    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({ usable: true });

    const embeddings = await import('../embeddings/nomic.js');
    vi.spyOn(embeddings, 'embedText').mockResolvedValue(queryLike);

    const results = await searchKnowledge(testRepo, 'architecture');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // C1 should rank high (matches both vector and keyword)
    expect(results[0]!.item.id).toBe('C1');
  });

  it('returns keyword results when model is usable but no embeddings stored', async () => {
    const chunks = [
      makeChunk('C1', 'docs/a.md', 'architecture patterns for TypeScript'),
      makeChunk('C2', 'docs/b.md', 'database connection pooling'),
    ];
    // Seed chunks WITHOUT embeddings
    seedChunks(chunks);

    // Model reports usable, but chunks have no embedding vectors
    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({ usable: true });

    const embeddings = await import('../embeddings/nomic.js');
    vi.spyOn(embeddings, 'embedText').mockResolvedValue(new Float32Array([1, 0, 0]));

    const results = await searchKnowledge(testRepo, 'architecture');
    // Should NOT be empty -- falls back to keyword results
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.item.id).toBe('C1');
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('respects limit option', async () => {
    const chunks = [
      makeChunk('C1', 'docs/a.md', 'TypeScript patterns best practices'),
      makeChunk('C2', 'docs/b.md', 'TypeScript type inference engine'),
      makeChunk('C3', 'docs/c.md', 'TypeScript compiler architecture'),
    ];
    seedChunks(chunks);

    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({
      usable: false,
      reason: 'test',
      action: 'test',
    });

    const results = await searchKnowledge(testRepo, 'TypeScript', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('returns GenericScoredItem<KnowledgeChunk> with scores', async () => {
    const chunks = [makeChunk('C1', 'docs/a.md', 'architecture patterns overview')];
    seedChunks(chunks);

    const model = await import('../embeddings/model.js');
    vi.spyOn(model, 'isModelUsable').mockResolvedValue({
      usable: false,
      reason: 'test',
      action: 'test',
    });

    const results = await searchKnowledge(testRepo, 'architecture');
    expect(results[0]).toHaveProperty('item');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]!.score).toBeGreaterThan(0);
  });
});
