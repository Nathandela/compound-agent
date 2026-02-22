/**
 * Tests for knowledge chunk embedding cache operations.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { openKnowledgeDb, closeKnowledgeDb } from './connection.js';
import {
  getCachedChunkEmbedding,
  setCachedChunkEmbedding,
  chunkContentHash,
  collectCachedChunkEmbeddings,
} from './cache.js';

/** Insert a test chunk directly into the DB */
function insertChunk(repo: string, id: string, text: string): void {
  const db = openKnowledgeDb(repo);
  db.prepare(
    `INSERT INTO chunks (id, file_path, start_line, end_line, content_hash, text, updated_at)
     VALUES (?, 'test.md', 1, 10, ?, ?, '2026-01-01T00:00:00Z')`
  ).run(id, chunkContentHash(text), text);
}

describe('chunkContentHash', () => {
  it('returns a hex string', () => {
    const hash = chunkContentHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different hashes for different text', () => {
    const h1 = chunkContentHash('hello');
    const h2 = chunkContentHash('world');
    expect(h1).not.toBe(h2);
  });

  it('returns same hash for same text', () => {
    const h1 = chunkContentHash('hello');
    const h2 = chunkContentHash('hello');
    expect(h1).toBe(h2);
  });
});

describe('getCachedChunkEmbedding / setCachedChunkEmbedding', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-cache-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('returns null when no embedding is cached', () => {
    insertChunk(repo, 'C001', 'test content');
    const result = getCachedChunkEmbedding(repo, 'C001');
    expect(result).toBeNull();
  });

  it('returns null for non-existent chunk', () => {
    const result = getCachedChunkEmbedding(repo, 'NONEXISTENT');
    expect(result).toBeNull();
  });

  it('stores and retrieves embedding as Float32Array', () => {
    insertChunk(repo, 'C001', 'test content');
    const hash = chunkContentHash('test content');
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);

    setCachedChunkEmbedding(repo, 'C001', embedding, hash);
    const result = getCachedChunkEmbedding(repo, 'C001');

    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result![0]).toBeCloseTo(0.1);
    expect(result![1]).toBeCloseTo(0.2);
  });

  it('returns null when expectedHash does not match', () => {
    insertChunk(repo, 'C001', 'test content');
    const hash = chunkContentHash('test content');
    const embedding = new Float32Array([0.1, 0.2, 0.3]);

    setCachedChunkEmbedding(repo, 'C001', embedding, hash);
    const result = getCachedChunkEmbedding(repo, 'C001', 'wrong-hash');
    expect(result).toBeNull();
  });

  it('returns embedding when expectedHash matches', () => {
    insertChunk(repo, 'C001', 'test content');
    const hash = chunkContentHash('test content');
    const embedding = new Float32Array([0.5, 0.6]);

    setCachedChunkEmbedding(repo, 'C001', embedding, hash);
    const result = getCachedChunkEmbedding(repo, 'C001', hash);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
  });

  it('UPDATE-only: does not insert new rows', () => {
    const embedding = new Float32Array([0.1, 0.2]);

    // No chunk row exists, so this should be a no-op
    setCachedChunkEmbedding(repo, 'NONEXISTENT', embedding, 'somehash');
    const result = getCachedChunkEmbedding(repo, 'NONEXISTENT');
    expect(result).toBeNull();
  });
});

describe('collectCachedChunkEmbeddings', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), 'knowledge-collect-'));
    openKnowledgeDb(repo);
  });

  afterEach(async () => {
    closeKnowledgeDb();
    await rm(repo, { recursive: true, force: true });
  });

  it('returns empty map when no embeddings cached', () => {
    const db = openKnowledgeDb(repo);
    insertChunk(repo, 'C001', 'test content');
    const cache = collectCachedChunkEmbeddings(db);
    expect(cache.size).toBe(0);
  });

  it('collects all cached embeddings', () => {
    const db = openKnowledgeDb(repo);
    insertChunk(repo, 'C001', 'content one');
    insertChunk(repo, 'C002', 'content two');

    setCachedChunkEmbedding(repo, 'C001', new Float32Array([0.1]), chunkContentHash('content one'));
    setCachedChunkEmbedding(repo, 'C002', new Float32Array([0.2]), chunkContentHash('content two'));

    const cache = collectCachedChunkEmbeddings(db);
    expect(cache.size).toBe(2);
    expect(cache.has('C001')).toBe(true);
    expect(cache.has('C002')).toBe(true);
  });
});
