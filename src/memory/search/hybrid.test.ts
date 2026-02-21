/**
 * Tests for hybrid search: BM25 normalizer and hybrid merge.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { createQuickLesson } from '../../test-utils.js';
import type { ScoredLesson } from './vector.js';

import {
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_VECTOR_WEIGHT,
  CANDIDATE_MULTIPLIER,
  mergeHybridResults,
  normalizeBm25Rank,
  type ScoredKeywordResult,
} from './hybrid.js';

// ---------------------------------------------------------------------------
// Task 1: normalizeBm25Rank
// ---------------------------------------------------------------------------

describe('normalizeBm25Rank', () => {
  it('returns ~0.909 for rank -10 (highly relevant)', () => {
    const score = normalizeBm25Rank(-10);
    expect(score).toBeCloseTo(10 / 11, 5);
  });

  it('returns 0.5 for rank -1 (moderately relevant)', () => {
    expect(normalizeBm25Rank(-1)).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for rank 0 (no match)', () => {
    expect(normalizeBm25Rank(0)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(normalizeBm25Rank(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(normalizeBm25Rank(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(normalizeBm25Rank(-Infinity)).toBe(0);
  });

  // Property-based tests
  describe('properties', () => {
    it('output always in [0, 1] for any finite input', () => {
      fc.assert(
        fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (rank) => {
          const score = normalizeBm25Rank(rank);
          return score >= 0 && score <= 1;
        })
      );
    });

    it('returns 0 for NaN, Infinity, -Infinity', () => {
      for (const val of [NaN, Infinity, -Infinity]) {
        expect(normalizeBm25Rank(val)).toBe(0);
      }
    });

    it('monotonicity: larger absolute value => higher score', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          (a, b) => {
            // Using absolute values directly avoids subnormal float issues near -0
            if (a > b) {
              return normalizeBm25Rank(-a) >= normalizeBm25Rank(-b);
            }
            return true;
          }
        )
      );
    });

    it('symmetry: f(x) === f(-x) for all finite x', () => {
      fc.assert(
        fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (x) => {
          return normalizeBm25Rank(x) === normalizeBm25Rank(-x);
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Task 2: mergeHybridResults
// ---------------------------------------------------------------------------

describe('mergeHybridResults', () => {
  // Helpers
  function vectorResult(id: string, score: number): ScoredLesson {
    return { lesson: createQuickLesson(id, `insight for ${id}`), score };
  }

  function keywordResult(id: string, score: number): ScoredKeywordResult {
    return { lesson: createQuickLesson(id, `insight for ${id}`), score };
  }

  it('returns empty when both inputs are empty', () => {
    expect(mergeHybridResults([], [])).toEqual([]);
  });

  it('returns vector items with weighted scores when keyword is empty', () => {
    const vec = [vectorResult('L001', 0.8)];
    const result = mergeHybridResults(vec, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.lesson.id).toBe('L001');
    expect(result[0]!.score).toBeCloseTo(DEFAULT_VECTOR_WEIGHT * 0.8, 5);
  });

  it('returns keyword items with weighted scores when vector is empty', () => {
    const kw = [keywordResult('L001', 0.9)];
    const result = mergeHybridResults([], kw);
    expect(result).toHaveLength(1);
    expect(result[0]!.lesson.id).toBe('L001');
    expect(result[0]!.score).toBeCloseTo(DEFAULT_TEXT_WEIGHT * 0.9, 5);
  });

  it('overlapping item gets blended score', () => {
    const vec = [vectorResult('L001', 0.85)];
    const kw = [keywordResult('L001', 0.91)];
    const result = mergeHybridResults(vec, kw);
    expect(result).toHaveLength(1);
    const expected = DEFAULT_VECTOR_WEIGHT * 0.85 + DEFAULT_TEXT_WEIGHT * 0.91;
    expect(result[0]!.score).toBeCloseTo(expected, 5);
  });

  it('sorts results descending by blended score', () => {
    const vec = [vectorResult('A', 0.85), vectorResult('B', 0.62)];
    const kw = [keywordResult('B', 0.91), keywordResult('C', 0.70)];
    const result = mergeHybridResults(vec, kw);

    // B should rank highest (both sources)
    expect(result[0]!.lesson.id).toBe('B');
    // Verify descending order
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.score).toBeLessThanOrEqual(result[i - 1]!.score);
    }
  });

  it('custom weights auto-normalize', () => {
    const vec = [vectorResult('L001', 0.8)];
    const kw = [keywordResult('L001', 0.6)];

    const result1 = mergeHybridResults(vec, kw, { vectorWeight: 2, textWeight: 6 });
    const result2 = mergeHybridResults(vec, kw, { vectorWeight: 0.25, textWeight: 0.75 });

    expect(result1[0]!.score).toBeCloseTo(result2[0]!.score, 5);
  });

  it('respects limit option', () => {
    const vec = [vectorResult('A', 0.9), vectorResult('B', 0.8), vectorResult('C', 0.7)];
    const result = mergeHybridResults(vec, [], { limit: 2 });
    expect(result).toHaveLength(2);
  });

  // Property-based tests
  describe('properties', () => {
    it('output scores in [0, 1] when input scores in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => vectorResult(`V${i}`, s));
            const kw = kwScores.map((s, i) => keywordResult(`K${i}`, s));
            const result = mergeHybridResults(vec, kw);
            return result.every((r) => r.score >= 0 && r.score <= 1);
          }
        )
      );
    });

    it('output sorted descending', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => vectorResult(`V${i}`, s));
            const kw = kwScores.map((s, i) => keywordResult(`K${i}`, s));
            const result = mergeHybridResults(vec, kw);
            for (let i = 1; i < result.length; i++) {
              if (result[i]!.score > result[i - 1]!.score) return false;
            }
            return true;
          }
        )
      );
    });

    it('no duplicate lesson IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => vectorResult(`V${i}`, s));
            const kw = kwScores.map((s, i) => keywordResult(`K${i}`, s));
            const result = mergeHybridResults(vec, kw);
            const ids = result.map((r) => r.lesson.id);
            return ids.length === new Set(ids).size;
          }
        )
      );
    });

    it('output IDs subset of union(vector IDs, keyword IDs)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => vectorResult(`V${i}`, s));
            const kw = kwScores.map((s, i) => keywordResult(`K${i}`, s));
            const result = mergeHybridResults(vec, kw);
            const inputIds = new Set([
              ...vec.map((v) => v.lesson.id),
              ...kw.map((k) => k.lesson.id),
            ]);
            return result.every((r) => inputIds.has(r.lesson.id));
          }
        )
      );
    });

    it('weight normalization: (2, 6) produces same result as (0.25, 0.75)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (vecScore, kwScore) => {
            const vec = [vectorResult('L001', vecScore)];
            const kw = [keywordResult('L001', kwScore)];
            const r1 = mergeHybridResults(vec, kw, { vectorWeight: 2, textWeight: 6 });
            const r2 = mergeHybridResults(vec, kw, { vectorWeight: 0.25, textWeight: 0.75 });
            return Math.abs((r1[0]?.score ?? 0) - (r2[0]?.score ?? 0)) < 1e-10;
          }
        )
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('hybrid constants', () => {
  it('DEFAULT_VECTOR_WEIGHT is 0.7', () => {
    expect(DEFAULT_VECTOR_WEIGHT).toBe(0.7);
  });

  it('DEFAULT_TEXT_WEIGHT is 0.3', () => {
    expect(DEFAULT_TEXT_WEIGHT).toBe(0.3);
  });

  it('CANDIDATE_MULTIPLIER is 4', () => {
    expect(CANDIDATE_MULTIPLIER).toBe(4);
  });

  it('default weights sum to 1.0', () => {
    expect(DEFAULT_VECTOR_WEIGHT + DEFAULT_TEXT_WEIGHT).toBeCloseTo(1.0, 10);
  });
});
