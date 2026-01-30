import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { isNovel } from './quality.js';
import { appendLesson } from '../storage/jsonl.js';
import { rebuildIndex, closeDb } from '../storage/sqlite.js';
import type { QuickLesson } from '../types.js';

describe('quality filters', () => {
  let tempDir: string;

  const createLesson = (id: string, insight: string): QuickLesson => ({
    id,
    type: 'quick',
    trigger: `trigger for ${insight}`,
    insight,
    tags: [],
    source: 'manual',
    context: { tool: 'test', intent: 'testing' },
    created: new Date().toISOString(),
    confirmed: true,
    supersedes: [],
    related: [],
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'learning-agent-quality-'));
  });

  afterEach(async () => {
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('isNovel', () => {
    it('returns true for empty database', async () => {
      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(true);
    });

    it('returns true for new unique insight', async () => {
      await appendLesson(tempDir, createLesson('L001', 'Use Polars for CSV processing'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Always run tests before committing');
      expect(result.novel).toBe(true);
    });

    it('returns false for exact duplicate insight', async () => {
      await appendLesson(tempDir, createLesson('L001', 'Use Polars for large files'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
      expect(result.reason).toContain('similar');
      expect(result.existingId).toBe('L001');
    });

    it('returns false for highly similar insight', async () => {
      await appendLesson(tempDir, createLesson('L001', 'Use Polars for large CSV files'));
      await rebuildIndex(tempDir);
      closeDb();

      // Very similar - shares most words
      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
    });

    it('allows configurable similarity threshold', async () => {
      await appendLesson(tempDir, createLesson('L001', 'Use Polars for data'));
      await rebuildIndex(tempDir);
      closeDb();

      // With very low threshold, most things should be considered novel
      const result = await isNovel(tempDir, 'Use Polars', { threshold: 0.99 });
      expect(result.novel).toBe(true);
    });

    it('returns existing lesson id when duplicate found', async () => {
      await appendLesson(tempDir, createLesson('L123', 'Always test your code'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Always test your code');
      expect(result.existingId).toBe('L123');
    });
  });
});
