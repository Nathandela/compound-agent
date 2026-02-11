import { describe, it, expect } from 'vitest';

import { createFullLesson, createQuickLesson, daysAgo } from '../../test-utils.js';

import {
  calculateScore,
  confirmationBoost,
  rankLessons,
  recencyBoost,
  severityBoost,
} from './ranking.js';
import type { ScoredLesson } from './vector.js';

describe('ranking', () => {
  describe('severityBoost', () => {
    it('returns 1.5 for high severity', () => {
      expect(severityBoost(createFullLesson('L1', 'test insight', 'high'))).toBe(1.5);
    });

    it('returns 1.0 for medium severity', () => {
      expect(severityBoost(createFullLesson('L1', 'test insight', 'medium'))).toBe(1.0);
    });

    it('returns 0.8 for low severity', () => {
      expect(severityBoost(createFullLesson('L1', 'test insight', 'low'))).toBe(0.8);
    });

    it('returns 1.0 for quick lessons (no severity)', () => {
      expect(severityBoost(createQuickLesson('L1', 'test insight'))).toBe(1.0);
    });
  });

  describe('recencyBoost', () => {
    it('returns 1.2 for lessons ≤30 days old', () => {
      expect(recencyBoost(createQuickLesson('L1', 'test insight', { created: daysAgo(0) }))).toBe(1.2);
      expect(recencyBoost(createQuickLesson('L1', 'test insight', { created: daysAgo(15) }))).toBe(1.2);
      expect(recencyBoost(createQuickLesson('L1', 'test insight', { created: daysAgo(30) }))).toBe(1.2);
    });

    it('returns 1.0 for lessons >30 days old', () => {
      expect(recencyBoost(createQuickLesson('L1', 'test insight', { created: daysAgo(31) }))).toBe(1.0);
      expect(recencyBoost(createQuickLesson('L1', 'test insight', { created: daysAgo(100) }))).toBe(1.0);
    });
  });

  describe('confirmationBoost', () => {
    it('returns 1.3 for confirmed lessons', () => {
      expect(confirmationBoost(createQuickLesson('L1', 'test insight', { confirmed: true }))).toBe(1.3);
    });

    it('returns 1.0 for unconfirmed lessons', () => {
      expect(confirmationBoost(createQuickLesson('L1', 'test insight', { confirmed: false }))).toBe(1.0);
    });
  });

  describe('calculateScore', () => {
    it('combines all boosts with vector similarity, clamped', () => {
      const lesson = createFullLesson('L1', 'test insight', 'high', { confirmed: true, created: daysAgo(5) });
      const vectorSimilarity = 0.9;

      // Raw boost: 1.5 * 1.2 * 1.3 = 2.34, clamped to MAX_COMBINED_BOOST (1.8)
      // Expected: 0.9 * 1.8 = 1.62
      const score = calculateScore(lesson, vectorSimilarity);
      expect(score).toBeCloseTo(1.62);
    });

    it('works with quick lessons', () => {
      const lesson = createQuickLesson('L1', 'test insight', { confirmed: false, created: daysAgo(50) });
      const vectorSimilarity = 0.8;

      // Expected: 0.8 * 1.0 (no severity) * 1.0 (old) * 1.0 (unconfirmed) = 0.8
      const score = calculateScore(lesson, vectorSimilarity);
      expect(score).toBeCloseTo(0.8);
    });

    it('does not clamp when combined boost is below threshold', () => {
      // medium severity (1.0) + recent (1.2) + confirmed (1.3) = 1.56, below 1.8
      const lesson = createQuickLesson('L1', 'test insight', { confirmed: true, created: daysAgo(5) });
      const score = calculateScore(lesson, 0.7);
      expect(score).toBeCloseTo(0.7 * 1.0 * 1.2 * 1.3);
    });

    it('clamps combined boost at MAX_COMBINED_BOOST for extreme cases', () => {
      // high severity (1.5) + recent (1.2) + confirmed (1.3) = 2.34 -> clamped to 1.8
      const maxBoosted = createFullLesson('L1', 'test insight', 'high', { confirmed: true, created: daysAgo(0) });
      const score = calculateScore(maxBoosted, 0.5);
      // 0.5 * 1.8 = 0.9, not 0.5 * 2.34 = 1.17
      expect(score).toBeCloseTo(0.9);
    });

    it('prevents moderate similarity + all boosts from outranking high similarity + no boosts', () => {
      // Moderate similarity (0.4) with all boosts maxed
      const boostedLesson = createFullLesson('L1', 'boosted', 'high', { confirmed: true, created: daysAgo(0) });
      const boostedScore = calculateScore(boostedLesson, 0.4);

      // Excellent similarity (0.9) with no boosts
      const unboostedLesson = createFullLesson('L2', 'unboosted', 'medium', { confirmed: false, created: daysAgo(60) });
      const unboostedScore = calculateScore(unboostedLesson, 0.9);

      // With clamp: 0.4 * 1.8 = 0.72 < 0.9. Unboosted wins.
      // Without clamp: 0.4 * 2.34 = 0.936 > 0.9. Boosted would win (bad).
      expect(unboostedScore).toBeGreaterThan(boostedScore);
    });

    it('allows fully-boosted lesson to outrank unboosted at sufficient similarity', () => {
      // At 0.6 similarity with full boost: 0.6 * 1.8 = 1.08
      const boosted = createFullLesson('L1', 'boosted', 'high', { confirmed: true, created: daysAgo(0) });
      const boostedScore = calculateScore(boosted, 0.6);

      // 0.95 similarity with no boosts: 0.95
      const unboosted = createFullLesson('L2', 'unboosted', 'medium', { confirmed: false, created: daysAgo(60) });
      const unboostedScore = calculateScore(unboosted, 0.95);

      // Confirmed + high severity + recent lesson with decent similarity should still win
      expect(boostedScore).toBeGreaterThan(unboostedScore);
    });
  });

  describe('rankLessons', () => {
    it('sorts by combined score descending', () => {
      const lessons: ScoredLesson[] = [
        { lesson: createFullLesson('L1', 'test insight', 'low'), score: 0.9 },
        { lesson: createFullLesson('L2', 'test insight', 'high'), score: 0.7 },
        { lesson: createFullLesson('L3', 'test insight', 'medium'), score: 0.8 },
      ];

      const ranked = rankLessons(lessons);

      // L2 (high severity) should rank higher despite lower vector score
      // L2: 0.7 * 1.5 = 1.05 base (plus recency/confirmation)
      // L3: 0.8 * 1.0 = 0.8 base
      // L1: 0.9 * 0.8 = 0.72 base
      expect(ranked[0]!.lesson.id).toBe('L2');
    });

    it('handles empty array', () => {
      const ranked = rankLessons([]);
      expect(ranked).toEqual([]);
    });

    it('preserves lesson objects', () => {
      const lesson = createQuickLesson('L1', 'test insight', { confirmed: true });
      const ranked = rankLessons([{ lesson, score: 0.5 }]);
      expect(ranked[0]!.lesson).toBe(lesson);
    });

    it('returns new array sorted by finalScore', () => {
      const lessons: ScoredLesson[] = [
        { lesson: createQuickLesson('L1', 'test insight', { confirmed: false }), score: 0.9 },
        { lesson: createQuickLesson('L2', 'test insight', { confirmed: true }), score: 0.9 },
      ];

      const ranked = rankLessons(lessons);

      // L2 should be first due to confirmation boost
      expect(ranked[0]!.lesson.id).toBe('L2');
      expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore!);
    });

    it('always computes finalScore for all ranked lessons', () => {
      // Note: The sort comparator in rankLessons has a defensive ?? 0 fallback
      // for finalScore, but this branch is unreachable because the map() always
      // computes finalScore before sort() is called. This test verifies that
      // finalScore is always defined, documenting why line 84's ?? 0 is never hit.
      const lessons: ScoredLesson[] = [
        { lesson: createQuickLesson('L1', 'test insight'), score: 0.5 },
        { lesson: createQuickLesson('L2', 'test insight'), score: 0.3 },
        { lesson: createQuickLesson('L3', 'test insight'), score: 0.8 },
      ];

      const ranked = rankLessons(lessons);

      // All finalScore values should be defined (never undefined)
      for (const item of ranked) {
        expect(item.finalScore).toBeDefined();
        expect(typeof item.finalScore).toBe('number');
      }
    });
  });
});
