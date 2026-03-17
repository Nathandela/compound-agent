import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createQuickLesson } from '../../test-utils.js';

import {
  isActionable,
  isNovel,
  isSpecific,
  shouldPropose,
} from './quality.js';

vi.mock('../embeddings/model-info.js', () => ({
  isModelAvailable: vi.fn(() => true),
}));

vi.mock('../search/index.js', () => ({
  findSimilarLessons: vi.fn(async () => []),
}));

vi.mock('../storage/index.js', () => ({
  syncIfNeeded: vi.fn(async () => false),
}));

import { isModelAvailable } from '../embeddings/model-info.js';
import { findSimilarLessons } from '../search/index.js';

const mockIsModelAvailable = vi.mocked(isModelAvailable);
const mockFindSimilarLessons = vi.mocked(findSimilarLessons);

describe('quality filters', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-quality-'));
    mockIsModelAvailable.mockReturnValue(true);
    mockFindSimilarLessons.mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('isNovel', () => {
    it('returns novel: true when model unavailable', async () => {
      mockIsModelAvailable.mockReturnValue(false);

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(true);
      expect(mockFindSimilarLessons).not.toHaveBeenCalled();
    });

    it('returns novel: true when no similar lessons found', async () => {
      mockFindSimilarLessons.mockResolvedValue([]);

      const result = await isNovel(tempDir, 'Always run tests before committing');
      expect(result.novel).toBe(true);
    });

    it('returns novel: false when near-duplicate exists (>= 0.98)', async () => {
      const lesson = createQuickLesson('L001', 'Use Polars for large files');
      mockFindSimilarLessons.mockResolvedValue([
        { item: lesson, score: 0.99 },
      ]);

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
      expect(result.reason).toContain('Near-duplicate');
      expect(result.existingId).toBe('L001');
    });

    it('returns novel: true when similar but below threshold (0.80-0.97)', async () => {
      // findSimilarLessons is called with threshold=0.98, so items with
      // score 0.90 will NOT be returned (filtered out by findSimilarLessons)
      mockFindSimilarLessons.mockResolvedValue([]);

      const result = await isNovel(tempDir, 'Use Polars for CSV processing');
      expect(result.novel).toBe(true);
    });

    it('returns novel: true when findSimilarLessons throws', async () => {
      mockFindSimilarLessons.mockRejectedValue(new Error('DB error'));

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(true);
    });

    it('passes threshold to findSimilarLessons', async () => {
      await isNovel(tempDir, 'Use Polars for large files');

      expect(mockFindSimilarLessons).toHaveBeenCalledWith(
        tempDir,
        'Use Polars for large files',
        { threshold: 0.98 }
      );
    });

    it('allows configurable threshold', async () => {
      await isNovel(tempDir, 'Use Polars for large files', { threshold: 0.95 });

      expect(mockFindSimilarLessons).toHaveBeenCalledWith(
        tempDir,
        'Use Polars for large files',
        { threshold: 0.95 }
      );
    });

    it('treats exactly 0.98 as non-novel (boundary)', async () => {
      const lesson = createQuickLesson('L001', 'Use Polars for large files');
      mockFindSimilarLessons.mockResolvedValue([
        { item: lesson, score: 0.98 },
      ]);

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
      expect(result.existingId).toBe('L001');
    });

    it('treats just below 0.98 as novel (boundary)', async () => {
      // findSimilarLessons with threshold=0.98 won't return items below 0.98
      mockFindSimilarLessons.mockResolvedValue([]);

      const result = await isNovel(tempDir, 'Use Polars for CSV processing');
      expect(result.novel).toBe(true);
    });
  });

  describe('isSpecific', () => {
    it('returns true for specific actionable insight', () => {
      const result = isSpecific('Use Polars instead of pandas for files over 100MB');
      expect(result.specific).toBe(true);
    });

    it('returns false for insight that is too short', () => {
      const result = isSpecific('Be careful');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('too short');
    });

    it('returns false for vague "write better code" pattern', () => {
      const result = isSpecific('Remember to write better code next time');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for vague "be careful" pattern', () => {
      const result = isSpecific('Be careful when making changes to the database');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for vague "remember to check" pattern', () => {
      const result = isSpecific('Remember to check your work before committing');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for generic "always" advice', () => {
      const result = isSpecific('Always test your code');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for generic "never" advice', () => {
      const result = isSpecific('Never forget to review');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for "make sure" pattern', () => {
      const result = isSpecific('Make sure to double check everything');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for "try to" pattern without specifics', () => {
      const result = isSpecific('Try to be more careful');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns true for specific technical guidance', () => {
      const result = isSpecific('In this codebase, run pnpm test before committing');
      expect(result.specific).toBe(true);
    });

    it('returns true for insight with specific tool reference', () => {
      const result = isSpecific('Use vitest --watch for faster feedback during TDD');
      expect(result.specific).toBe(true);
    });

    it('returns true for insight with file path', () => {
      const result = isSpecific('The config in src/config.ts must be updated when adding new features');
      expect(result.specific).toBe(true);
    });

    it('requires minimum word count', () => {
      const result = isSpecific('Use pnpm');
      expect(result.specific).toBe(false);
      expect(result.reason).toContain('too short');
    });
  });

  describe('isActionable', () => {
    it('returns true for "use X instead of Y" pattern', () => {
      const result = isActionable('Use Polars instead of pandas for large datasets');
      expect(result.actionable).toBe(true);
    });

    it('returns true for "prefer X over Y" pattern', () => {
      const result = isActionable('Prefer async functions over callbacks in this codebase');
      expect(result.actionable).toBe(true);
    });

    it('returns true for "always X when Y" pattern', () => {
      const result = isActionable('Always validate input when accepting user data');
      expect(result.actionable).toBe(true);
    });

    it('returns true for "never X without Y" pattern', () => {
      const result = isActionable('Never deploy without running the full test suite');
      expect(result.actionable).toBe(true);
    });

    it('returns true for imperative commands', () => {
      const result = isActionable('Run pnpm lint before committing to catch style issues');
      expect(result.actionable).toBe(true);
    });

    it('returns true for "avoid X" pattern', () => {
      const result = isActionable('Avoid using any type in this TypeScript codebase');
      expect(result.actionable).toBe(true);
    });

    it('returns false for pure observation', () => {
      const result = isActionable('The database connection sometimes fails on cold starts');
      expect(result.actionable).toBe(false);
      expect(result.reason).toContain('action');
    });

    it('returns false for question-like insight', () => {
      const result = isActionable('Why does this test fail intermittently on CI');
      expect(result.actionable).toBe(false);
    });

    it('returns false for statement without action', () => {
      const result = isActionable('The configuration file is located in the root directory');
      expect(result.actionable).toBe(false);
    });

    it('returns true for "check X before Y" pattern', () => {
      const result = isActionable('Check the migration status before running database queries');
      expect(result.actionable).toBe(true);
    });
  });

  describe('shouldPropose', () => {
    it('returns true for novel, specific, actionable insight', async () => {
      const result = await shouldPropose(
        tempDir,
        'Use Polars instead of pandas for files over 100MB'
      );
      expect(result.shouldPropose).toBe(true);
    });

    it('returns true for specific+novel but non-actionable insight', async () => {
      // Actionability gate removed: capture aggressively, prune later
      const result = await shouldPropose(
        tempDir,
        'The database sometimes has connection issues in development'
      );
      expect(result.shouldPropose).toBe(true);
    });

    it('returns false for near-duplicate', async () => {
      const lesson = createQuickLesson('L001', 'Use Polars instead of pandas for files');
      mockFindSimilarLessons.mockResolvedValue([
        { item: lesson, score: 0.99 },
      ]);

      const result = await shouldPropose(tempDir, 'Use Polars instead of pandas for files');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('Near-duplicate');
    });

    it('returns true for moderately similar text', async () => {
      // Score 0.90 is below the 0.98 duplicate threshold, so findSimilarLessons
      // won't return it (threshold filters it out)
      mockFindSimilarLessons.mockResolvedValue([]);

      const result = await shouldPropose(
        tempDir,
        'Use Polars instead of pandas for large CSV files in production'
      );
      expect(result.shouldPropose).toBe(true);
    });

    it('returns false for vague insight', async () => {
      const result = await shouldPropose(tempDir, 'Be careful when editing the database');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for too short insight', async () => {
      const result = await shouldPropose(tempDir, 'Use pnpm');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('too short');
    });
  });
});
