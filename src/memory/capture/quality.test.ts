import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appendLesson } from '../storage/jsonl.js';
import {
  closeDb,
  getRetrievalStats,
  rebuildIndex,
} from '../storage/sqlite/index.js';
import { createQuickLesson } from '../../test-utils.js';

import {
  isActionable,
  isNovel,
  isSpecific,
  shouldPropose,
} from './quality.js';

describe('quality filters', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'compound-agent-quality-'));
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

    it('returns true when insight has no words longer than 3 chars', async () => {
      // All words are 3 chars or less, so no keywords extracted for search
      const result = await isNovel(tempDir, 'a b c d e');
      expect(result.novel).toBe(true);
    });

    it('returns true for new unique insight', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars for CSV processing'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Always run tests before committing');
      expect(result.novel).toBe(true);
    });

    it('returns false for exact duplicate insight', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars for large files'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
      expect(result.reason).toContain('similar');
      expect(result.existingId).toBe('L001');
    });

    it('returns false for highly similar insight', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars for large CSV files'));
      await rebuildIndex(tempDir);
      closeDb();

      // Very similar - shares most words
      const result = await isNovel(tempDir, 'Use Polars for large files');
      expect(result.novel).toBe(false);
    });

    it('allows configurable similarity threshold', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars for data'));
      await rebuildIndex(tempDir);
      closeDb();

      // With very low threshold, most things should be considered novel
      const result = await isNovel(tempDir, 'Use Polars', { threshold: 0.99 });
      expect(result.novel).toBe(true);
    });

    it('returns existing lesson id when duplicate found', async () => {
      await appendLesson(tempDir, createQuickLesson('L123', 'Always test your code'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'Always test your code');
      expect(result.existingId).toBe('L123');
    });

    it('catches identical strings via Jaccard similarity, not exact-match branch', async () => {
      // Identical strings have Jaccard similarity = 1.0, which >= 0.8 threshold.
      // This proves the exact-match branch (if it existed) would be dead code.
      await appendLesson(tempDir, createQuickLesson('L001', 'Use POLARS for data'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await isNovel(tempDir, 'use polars for data');
      expect(result.novel).toBe(false);
      expect(result.reason).toContain('similar'); // Jaccard branch, NOT "Exact duplicate found"
      expect(result.existingId).toBe('L001');
    });

    it('does not increment retrieval counts during novelty checks', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars for large files'));
      await rebuildIndex(tempDir);
      closeDb();

      await isNovel(tempDir, 'Use Polars for large files');

      const stats = getRetrievalStats(tempDir);
      const l001 = stats.find((s) => s.id === 'L001');
      expect(l001?.count).toBe(0);
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

    it('returns false for duplicate insight', async () => {
      await appendLesson(tempDir, createQuickLesson('L001', 'Use Polars instead of pandas for files'));
      await rebuildIndex(tempDir);
      closeDb();

      const result = await shouldPropose(tempDir, 'Use Polars instead of pandas for files');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('returns false for vague insight', async () => {
      const result = await shouldPropose(tempDir, 'Be careful when editing the database');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('vague');
    });

    it('returns false for non-actionable insight', async () => {
      const result = await shouldPropose(
        tempDir,
        'The database sometimes has connection issues in development'
      );
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('action');
    });

    it('returns false for too short insight', async () => {
      const result = await shouldPropose(tempDir, 'Use pnpm');
      expect(result.shouldPropose).toBe(false);
      expect(result.reason).toContain('too short');
    });
  });
});
