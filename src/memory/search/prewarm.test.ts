import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import {
  closeDb,
  contentHash,
  getCachedEmbeddingsBulk,
  rebuildIndex,
  setCachedEmbedding,
} from '../storage/sqlite/index.js';
import { createQuickLesson } from '../../test-utils.js';

import { preWarmLessonEmbeddings } from './prewarm.js';

describe('preWarmLessonEmbeddings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-prewarm-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns early with zeros when model is unavailable', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'test lesson'));
    await rebuildIndex(tempDir);

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(false);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 0, skipped: 0 });
  });

  it('returns {embedded: 0, skipped: N} when all items already cached', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'lesson one'));
    await appendLesson(tempDir, createQuickLesson('L002', 'lesson two'));
    await rebuildIndex(tempDir);

    // Pre-cache embeddings with correct hashes
    const hash1 = contentHash('trigger for lesson one', 'lesson one');
    const hash2 = contentHash('trigger for lesson two', 'lesson two');
    setCachedEmbedding(tempDir, 'L001', new Float32Array([1, 0, 0]), hash1);
    setCachedEmbedding(tempDir, 'L002', new Float32Array([0, 1, 0]), hash2);

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);
    const embedMock = vi.fn();
    vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 0, skipped: 2 });
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('embeds items with missing cache entries', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'uncached lesson'));
    await rebuildIndex(tempDir);

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);
    const embedMock = vi.fn().mockResolvedValue(new Float32Array([1, 0, 0]));
    vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 1, skipped: 0 });
    expect(embedMock).toHaveBeenCalledWith('trigger for uncached lesson uncached lesson');

    // Verify it was cached in SQLite
    const cached = getCachedEmbeddingsBulk(tempDir);
    expect(cached.has('L001')).toBe(true);
  });

  it('embeds items with stale hashes', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'updated lesson'));
    await rebuildIndex(tempDir);

    // Cache with a stale hash
    setCachedEmbedding(tempDir, 'L001', new Float32Array([0.1, 0.1, 0.1]), 'stale_hash');

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);
    const embedMock = vi.fn().mockResolvedValue(new Float32Array([1, 0, 0]));
    vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 1, skipped: 0 });

    // Verify hash was updated
    const cached = getCachedEmbeddingsBulk(tempDir);
    const entry = cached.get('L001');
    expect(entry).toBeDefined();
    expect(entry!.hash).toBe(contentHash('trigger for updated lesson', 'updated lesson'));
  });

  it('does not see invalidated items (filtered by readAllFromSqlite)', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'valid lesson'));
    await appendLesson(tempDir, {
      ...createQuickLesson('L002', 'invalidated lesson'),
      invalidatedAt: '2026-01-15T10:30:00.000Z',
      invalidationReason: 'outdated',
    });
    await rebuildIndex(tempDir);

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);
    const embedMock = vi.fn().mockResolvedValue(new Float32Array([1, 0, 0]));
    vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

    const result = await preWarmLessonEmbeddings(tempDir);
    // Only the valid lesson should be processed
    expect(result).toEqual({ embedded: 1, skipped: 0 });
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedMock).toHaveBeenCalledWith('trigger for valid lesson valid lesson');
  });

  it('returns correct counts with mixed cached and uncached items', async () => {
    await appendLesson(tempDir, createQuickLesson('L001', 'already cached'));
    await appendLesson(tempDir, createQuickLesson('L002', 'needs embedding'));
    await appendLesson(tempDir, createQuickLesson('L003', 'also needs embedding'));
    await rebuildIndex(tempDir);

    // Only cache L001
    const hash1 = contentHash('trigger for already cached', 'already cached');
    setCachedEmbedding(tempDir, 'L001', new Float32Array([1, 0, 0]), hash1);

    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);
    const embedMock = vi.fn().mockResolvedValue(new Float32Array([0, 1, 0]));
    vi.spyOn(await import('../embeddings/nomic.js'), 'embedText').mockImplementation(embedMock);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 2, skipped: 1 });
    expect(embedMock).toHaveBeenCalledTimes(2);
  });

  it('returns zeros for empty database', async () => {
    vi.spyOn(await import('../embeddings/model-info.js'), 'isModelAvailable').mockReturnValue(true);

    const result = await preWarmLessonEmbeddings(tempDir);
    expect(result).toEqual({ embedded: 0, skipped: 0 });
  });
});
