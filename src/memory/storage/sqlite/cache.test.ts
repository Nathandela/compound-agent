/**
 * Tests for getCachedEmbeddingsBulk - bulk embedding cache read.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appendLesson } from '../jsonl.js';
import { createQuickLesson } from '../../../test-utils.js';

import { closeDb } from './connection.js';
import { rebuildIndex } from './sync.js';
import {
  contentHash,
  getCachedEmbeddingsBulk,
  setCachedEmbedding,
} from './cache.js';

describe('getCachedEmbeddingsBulk', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-bulk-cache-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty map when no embeddings are cached', async () => {
    // Create lessons but do NOT cache any embeddings
    await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
    await appendLesson(tempDir, createQuickLesson('L002', 'lesson two'));
    await rebuildIndex(tempDir);

    const result = getCachedEmbeddingsBulk(tempDir);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns all cached embeddings as a Map', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
    await appendLesson(tempDir, createQuickLesson('L002', 'lesson two'));
    await appendLesson(tempDir, createQuickLesson('L003', 'lesson three'));
    await rebuildIndex(tempDir);

    // Cache embeddings for L001 and L002, but not L003
    const hash1 = contentHash('trigger for lesson one', 'lesson one');
    const hash2 = contentHash('trigger for lesson two', 'lesson two');
    setCachedEmbedding(tempDir, 'L001', new Float32Array([0.1, 0.2, 0.3]), hash1);
    setCachedEmbedding(tempDir, 'L002', new Float32Array([0.4, 0.5, 0.6]), hash2);

    const result = getCachedEmbeddingsBulk(tempDir);

    expect(result.size).toBe(2);
    expect(result.has('L001')).toBe(true);
    expect(result.has('L002')).toBe(true);
    expect(result.has('L003')).toBe(false);
  });

  it('includes hash for cache validation', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
    await rebuildIndex(tempDir);

    const hash = contentHash('trigger for lesson one', 'lesson one');
    setCachedEmbedding(tempDir, 'L001', new Float32Array([0.1, 0.2, 0.3]), hash);

    const result = getCachedEmbeddingsBulk(tempDir);
    const entry = result.get('L001');

    expect(entry).toBeDefined();
    expect(entry!.hash).toBe(hash);
  });

  it('returns correct vectors', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
    await rebuildIndex(tempDir);

    const vec = [0.1, 0.2, 0.3];
    const hash = contentHash('trigger for lesson one', 'lesson one');
    setCachedEmbedding(tempDir, 'L001', new Float32Array(vec), hash);

    const result = getCachedEmbeddingsBulk(tempDir);
    const entry = result.get('L001');

    expect(entry).toBeDefined();
    expect(entry!.vector).toHaveLength(3);
    expect(entry!.vector[0]).toBeCloseTo(0.1);
    expect(entry!.vector[1]).toBeCloseTo(0.2);
    expect(entry!.vector[2]).toBeCloseTo(0.3);
  });

  it('returns empty map when database has no lessons', async () => {
    // Trigger DB creation but with no lessons
    await rebuildIndex(tempDir);

    const result = getCachedEmbeddingsBulk(tempDir);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
