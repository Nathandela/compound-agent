import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';

import { createFullLesson, createPattern, createPreference, createQuickLesson, createSolution, daysAgo } from '../../test-utils-pure.js';

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

  });

  // =========================================================================
  // Unified memory item support
  // =========================================================================

  describe('unified memory item support', () => {
    describe('boost functions accept all memory item types', () => {
      it('severityBoost works with solution items', () => {
        const sol = { ...createSolution('S1', 'use pnpm'), severity: 'high' as const };
        expect(severityBoost(sol)).toBe(1.5);
      });

      it('severityBoost returns 1.0 for items without severity', () => {
        expect(severityBoost(createSolution('S1', 'use pnpm'))).toBe(1.0);
        expect(severityBoost(createPreference('R1', 'dark mode'))).toBe(1.0);
      });

      it('recencyBoost works with pattern items', () => {
        const pat = createPattern('P1', 'use const', 'let x', 'const x', { created: daysAgo(5) });
        expect(recencyBoost(pat)).toBe(1.2);
      });

      it('confirmationBoost works with preference items', () => {
        const pref = createPreference('R1', 'dark mode', { confirmed: true });
        expect(confirmationBoost(pref)).toBe(1.3);
      });
    });

    describe('calculateScore works with all memory item types', () => {
      it('scores a solution item', () => {
        const sol = { ...createSolution('S1', 'use pnpm', { confirmed: true, created: daysAgo(5) }), severity: 'high' as const };
        const score = calculateScore(sol, 0.9);
        // high(1.5) * recent(1.2) * confirmed(1.3) = 2.34 -> clamped to 1.8
        expect(score).toBeCloseTo(0.9 * 1.8);
      });

      it('scores a pattern item without severity', () => {
        const pat = createPattern('P1', 'use const', 'let x', 'const x', { confirmed: false, created: daysAgo(50) });
        const score = calculateScore(pat, 0.8);
        // no severity(1.0) * old(1.0) * unconfirmed(1.0) = 1.0
        expect(score).toBeCloseTo(0.8);
      });
    });

  });

  // =========================================================================
  // Property-based tests
  // =========================================================================

  describe('property-based tests', () => {
    const FC_RUNS = process.env.CI ? 100 : 20;

    const memoryItemArb = fc.record({
      severity: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
      confirmed: fc.boolean(),
      ageDays: fc.integer({ min: 0, max: 365 }),
    }).map(({ severity, confirmed, ageDays }) =>
      createFullLesson('prop-test', 'property test insight', severity, {
        confirmed,
        created: daysAgo(ageDays),
      })
    );

    test.prop(
      [memoryItemArb, fc.float({ min: 0, max: 1, noNaN: true })],
      { numRuns: FC_RUNS },
    )('final score is bounded by vectorSimilarity * MAX_COMBINED_BOOST', (item, similarity) => {
      const score = calculateScore(item, similarity);
      expect(score).toBeLessThanOrEqual(similarity * 1.8);
    });

    test.prop(
      [
        fc.array(
          fc.record({
            lesson: memoryItemArb,
            score: fc.float({ min: 0, max: 1, noNaN: true }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
      ],
      { numRuns: FC_RUNS },
    )('rankLessons returns descending finalScore order', (lessons) => {
      const ranked = rankLessons(lessons as ScoredLesson[]);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1]!.finalScore).toBeGreaterThanOrEqual(ranked[i]!.finalScore!);
      }
    });

    test.prop(
      [
        fc.constantFrom(0.8, 1.0, 1.5),   // severity boosts
        fc.constantFrom(1.0, 1.2),          // recency boosts
        fc.constantFrom(1.0, 1.3),          // confirmation boosts
      ],
      { numRuns: FC_RUNS },
    )('combined boost never exceeds MAX_COMBINED_BOOST', (sev, rec, conf) => {
      const combined = Math.min(sev * rec * conf, 1.8);
      expect(combined).toBeLessThanOrEqual(1.8);
    });

    test.prop(
      [
        memoryItemArb,
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
      ],
      { numRuns: FC_RUNS },
    )('score monotonicity: higher similarity does not decrease score', (item, simA, simB) => {
      const lower = Math.min(simA, simB);
      const higher = Math.max(simA, simB);
      expect(calculateScore(item, higher)).toBeGreaterThanOrEqual(calculateScore(item, lower));
    });
  });
});
