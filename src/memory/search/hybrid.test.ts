/**
 * Tests for hybrid search: BM25 normalizer and hybrid merge.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { createQuickLesson } from '../../test-utils-pure.js';
import type { ScoredLesson } from './vector.js';

import {
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_VECTOR_WEIGHT,
  CANDIDATE_MULTIPLIER,
  MIN_HYBRID_SCORE,
  mergeHybridResults,
  mergeHybridScores,
  normalizeBm25Rank,
  type GenericScoredItem,
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

  it('returns empty when both weights are zero', () => {
    const vec = [vectorResult('L001', 0.8)];
    const kw = [keywordResult('L001', 0.6)];
    const result = mergeHybridResults(vec, kw, { vectorWeight: 0, textWeight: 0 });
    expect(result).toEqual([]);
  });

  it('returns empty when weights sum to negative', () => {
    const vec = [vectorResult('L001', 0.8)];
    const result = mergeHybridResults(vec, [], { vectorWeight: -1, textWeight: 0.5 });
    expect(result).toEqual([]);
  });

  it('filters results below minScore', () => {
    const vec = [vectorResult('A', 0.9), vectorResult('B', 0.2)];
    const result = mergeHybridResults(vec, [], { minScore: 0.5 });
    // A: 0.7 * 0.9 = 0.63 (above 0.5)
    // B: 0.7 * 0.2 = 0.14 (below 0.5)
    expect(result).toHaveLength(1);
    expect(result[0]!.lesson.id).toBe('A');
  });

  it('minScore filters after blending', () => {
    const vec = [vectorResult('L001', 0.4)];
    const kw = [keywordResult('L001', 0.6)];
    // Blended: 0.7*0.4 + 0.3*0.6 = 0.28 + 0.18 = 0.46
    const result = mergeHybridResults(vec, kw, { minScore: 0.5 });
    expect(result).toHaveLength(0);
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
// Task 3: mergeHybridScores (generic)
// ---------------------------------------------------------------------------

interface TestItem {
  id: string;
  label: string;
}

describe('mergeHybridScores', () => {
  function genericVec(id: string, label: string, score: number): GenericScoredItem<TestItem> {
    return { item: { id, label }, score };
  }

  function genericKw(id: string, label: string, score: number): GenericScoredItem<TestItem> {
    return { item: { id, label }, score };
  }

  const getId = (item: TestItem): string => item.id;

  it('returns empty when both inputs are empty', () => {
    expect(mergeHybridScores<TestItem>([], [], getId)).toEqual([]);
  });

  it('returns vector items with weighted scores when keyword is empty', () => {
    const vec = [genericVec('X1', 'alpha', 0.8)];
    const result = mergeHybridScores(vec, [], getId);
    expect(result).toHaveLength(1);
    expect(result[0]!.item.id).toBe('X1');
    expect(result[0]!.score).toBeCloseTo(DEFAULT_VECTOR_WEIGHT * 0.8, 5);
  });

  it('returns keyword items with weighted scores when vector is empty', () => {
    const kw = [genericKw('X1', 'alpha', 0.9)];
    const result = mergeHybridScores([], kw, getId);
    expect(result).toHaveLength(1);
    expect(result[0]!.item.id).toBe('X1');
    expect(result[0]!.score).toBeCloseTo(DEFAULT_TEXT_WEIGHT * 0.9, 5);
  });

  it('overlapping item gets blended score', () => {
    const vec = [genericVec('X1', 'alpha', 0.85)];
    const kw = [genericKw('X1', 'alpha', 0.91)];
    const result = mergeHybridScores(vec, kw, getId);
    expect(result).toHaveLength(1);
    const expected = DEFAULT_VECTOR_WEIGHT * 0.85 + DEFAULT_TEXT_WEIGHT * 0.91;
    expect(result[0]!.score).toBeCloseTo(expected, 5);
  });

  it('sorts results descending by blended score', () => {
    const vec = [genericVec('A', 'a', 0.85), genericVec('B', 'b', 0.62)];
    const kw = [genericKw('B', 'b', 0.91), genericKw('C', 'c', 0.70)];
    const result = mergeHybridScores(vec, kw, getId);
    expect(result[0]!.item.id).toBe('B');
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.score).toBeLessThanOrEqual(result[i - 1]!.score);
    }
  });

  it('respects limit option', () => {
    const vec = [genericVec('A', 'a', 0.9), genericVec('B', 'b', 0.8), genericVec('C', 'c', 0.7)];
    const result = mergeHybridScores(vec, [], getId, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('filters results below minScore', () => {
    const vec = [genericVec('A', 'a', 0.9), genericVec('B', 'b', 0.2)];
    const result = mergeHybridScores(vec, [], getId, { minScore: 0.5 });
    expect(result).toHaveLength(1);
    expect(result[0]!.item.id).toBe('A');
  });

  it('returns empty when both weights are zero', () => {
    const vec = [genericVec('X1', 'a', 0.8)];
    const result = mergeHybridScores(vec, [], getId, { vectorWeight: 0, textWeight: 0 });
    expect(result).toEqual([]);
  });

  it('preserves item data from vector source for overlapping IDs', () => {
    const vec = [genericVec('X1', 'from-vector', 0.85)];
    const kw = [genericKw('X1', 'from-keyword', 0.91)];
    const result = mergeHybridScores(vec, kw, getId);
    // Vector source should be preserved (first seen)
    expect(result[0]!.item.label).toBe('from-vector');
  });

  it('produces same scores as mergeHybridResults for equivalent inputs', () => {
    const lessons = [
      createQuickLesson('L001', 'insight A'),
      createQuickLesson('L002', 'insight B'),
      createQuickLesson('L003', 'insight C'),
    ];

    const vecLessons: ScoredLesson[] = [
      { lesson: lessons[0]!, score: 0.9 },
      { lesson: lessons[1]!, score: 0.6 },
    ];
    const kwLessons: ScoredKeywordResult[] = [
      { lesson: lessons[1]!, score: 0.8 },
      { lesson: lessons[2]!, score: 0.7 },
    ];

    const legacyResult = mergeHybridResults(vecLessons, kwLessons);

    const genericVecItems = vecLessons.map((v) => ({ item: v.lesson, score: v.score }));
    const genericKwItems = kwLessons.map((k) => ({ item: k.lesson, score: k.score }));
    const genericResult = mergeHybridScores(genericVecItems, genericKwItems, (item) => item.id);

    expect(genericResult).toHaveLength(legacyResult.length);
    for (let i = 0; i < legacyResult.length; i++) {
      expect(genericResult[i]!.item.id).toBe(legacyResult[i]!.lesson.id);
      expect(genericResult[i]!.score).toBeCloseTo(legacyResult[i]!.score, 10);
    }
  });

  // Property-based tests
  describe('properties', () => {
    it('output scores in [0, 1] when input scores in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => genericVec(`V${i}`, `v${i}`, s));
            const kw = kwScores.map((s, i) => genericKw(`K${i}`, `k${i}`, s));
            const result = mergeHybridScores(vec, kw, getId);
            return result.every((r) => r.score >= 0 && r.score <= 1);
          }
        )
      );
    });

    it('no duplicate item IDs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
          (vecScores, kwScores) => {
            const vec = vecScores.map((s, i) => genericVec(`V${i}`, `v${i}`, s));
            const kw = kwScores.map((s, i) => genericKw(`K${i}`, `k${i}`, s));
            const result = mergeHybridScores(vec, kw, getId);
            const ids = result.map((r) => r.item.id);
            return ids.length === new Set(ids).size;
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

  it('MIN_HYBRID_SCORE is 0.35', () => {
    expect(MIN_HYBRID_SCORE).toBe(0.35);
  });

  it('default weights sum to 1.0', () => {
    expect(DEFAULT_VECTOR_WEIGHT + DEFAULT_TEXT_WEIGHT).toBeCloseTo(1.0, 10);
  });
});
