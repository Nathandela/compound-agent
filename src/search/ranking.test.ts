import { describe, it, expect } from 'vitest';
import {
  severityBoost,
  recencyBoost,
  confirmationBoost,
  calculateScore,
  rankLessons,
} from './ranking.js';
import type { QuickLesson, FullLesson, Lesson } from '../types.js';
import type { ScoredLesson } from './vector.js';

describe('ranking', () => {
  const now = new Date();
  const daysAgo = (days: number): string => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  const createQuickLesson = (
    id: string,
    options: { confirmed?: boolean; created?: string } = {}
  ): QuickLesson => ({
    id,
    type: 'quick',
    trigger: 'test trigger',
    insight: 'test insight',
    tags: [],
    source: 'manual',
    context: { tool: 'test', intent: 'test' },
    created: options.created ?? now.toISOString(),
    confirmed: options.confirmed ?? false,
    supersedes: [],
    related: [],
  });

  const createFullLesson = (
    id: string,
    severity: 'high' | 'medium' | 'low',
    options: { confirmed?: boolean; created?: string } = {}
  ): FullLesson => ({
    id,
    type: 'full',
    trigger: 'test trigger',
    insight: 'test insight',
    evidence: 'test evidence',
    severity,
    tags: [],
    source: 'manual',
    context: { tool: 'test', intent: 'test' },
    created: options.created ?? now.toISOString(),
    confirmed: options.confirmed ?? false,
    supersedes: [],
    related: [],
  });

  describe('severityBoost', () => {
    it('returns 1.5 for high severity', () => {
      expect(severityBoost(createFullLesson('L1', 'high'))).toBe(1.5);
    });

    it('returns 1.0 for medium severity', () => {
      expect(severityBoost(createFullLesson('L1', 'medium'))).toBe(1.0);
    });

    it('returns 0.8 for low severity', () => {
      expect(severityBoost(createFullLesson('L1', 'low'))).toBe(0.8);
    });

    it('returns 1.0 for quick lessons (no severity)', () => {
      expect(severityBoost(createQuickLesson('L1'))).toBe(1.0);
    });
  });

  describe('recencyBoost', () => {
    it('returns 1.2 for lessons ≤30 days old', () => {
      expect(recencyBoost(createQuickLesson('L1', { created: daysAgo(0) }))).toBe(1.2);
      expect(recencyBoost(createQuickLesson('L1', { created: daysAgo(15) }))).toBe(1.2);
      expect(recencyBoost(createQuickLesson('L1', { created: daysAgo(30) }))).toBe(1.2);
    });

    it('returns 1.0 for lessons >30 days old', () => {
      expect(recencyBoost(createQuickLesson('L1', { created: daysAgo(31) }))).toBe(1.0);
      expect(recencyBoost(createQuickLesson('L1', { created: daysAgo(100) }))).toBe(1.0);
    });
  });

  describe('confirmationBoost', () => {
    it('returns 1.3 for confirmed lessons', () => {
      expect(confirmationBoost(createQuickLesson('L1', { confirmed: true }))).toBe(1.3);
    });

    it('returns 1.0 for unconfirmed lessons', () => {
      expect(confirmationBoost(createQuickLesson('L1', { confirmed: false }))).toBe(1.0);
    });
  });

  describe('calculateScore', () => {
    it('combines all boosts with vector similarity', () => {
      const lesson = createFullLesson('L1', 'high', { confirmed: true, created: daysAgo(5) });
      const vectorSimilarity = 0.9;

      // Expected: 0.9 * 1.5 (high) * 1.2 (recent) * 1.3 (confirmed) = 2.106
      const score = calculateScore(lesson, vectorSimilarity);
      expect(score).toBeCloseTo(2.106);
    });

    it('works with quick lessons', () => {
      const lesson = createQuickLesson('L1', { confirmed: false, created: daysAgo(50) });
      const vectorSimilarity = 0.8;

      // Expected: 0.8 * 1.0 (no severity) * 1.0 (old) * 1.0 (unconfirmed) = 0.8
      const score = calculateScore(lesson, vectorSimilarity);
      expect(score).toBeCloseTo(0.8);
    });
  });

  describe('rankLessons', () => {
    it('sorts by combined score descending', () => {
      const lessons: ScoredLesson[] = [
        { lesson: createFullLesson('L1', 'low'), score: 0.9 },
        { lesson: createFullLesson('L2', 'high'), score: 0.7 },
        { lesson: createFullLesson('L3', 'medium'), score: 0.8 },
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
      const lesson = createQuickLesson('L1', { confirmed: true });
      const ranked = rankLessons([{ lesson, score: 0.5 }]);
      expect(ranked[0]!.lesson).toBe(lesson);
    });

    it('returns new array sorted by finalScore', () => {
      const lessons: ScoredLesson[] = [
        { lesson: createQuickLesson('L1', { confirmed: false }), score: 0.9 },
        { lesson: createQuickLesson('L2', { confirmed: true }), score: 0.9 },
      ];

      const ranked = rankLessons(lessons);

      // L2 should be first due to confirmation boost
      expect(ranked[0]!.lesson.id).toBe('L2');
      expect(ranked[0]!.finalScore).toBeGreaterThan(ranked[1]!.finalScore!);
    });
  });
});
