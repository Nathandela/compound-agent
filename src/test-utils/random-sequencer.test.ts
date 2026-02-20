import { describe, it, expect } from 'vitest';
import { selectRandomSubset, seedHash } from './random-sequencer.js';

describe('random-sequencer', () => {
  describe('seedHash', () => {
    it('returns a positive integer for a given string', () => {
      const hash = seedHash('test-seed');
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
    });

    it('returns the same hash for the same input', () => {
      expect(seedHash('abc')).toBe(seedHash('abc'));
    });

    it('returns different hashes for different inputs', () => {
      expect(seedHash('seed-a')).not.toBe(seedHash('seed-b'));
    });
  });

  describe('selectRandomSubset', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

    it('returns empty array when percentage is 0', () => {
      const result = selectRandomSubset(items, 0, 'seed');
      expect(result).toEqual([]);
    });

    it('returns all items when percentage is 100', () => {
      const result = selectRandomSubset(items, 100, 'seed');
      expect(result).toHaveLength(items.length);
      // All original items should be present (order may differ)
      expect(result.sort()).toEqual([...items].sort());
    });

    it('returns approximately the correct percentage of items', () => {
      const result = selectRandomSubset(items, 50, 'seed');
      expect(result.length).toBe(5);
    });

    it('returns at least 1 item for non-zero percentage with non-empty input', () => {
      const result = selectRandomSubset(items, 1, 'seed');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('is deterministic: same seed produces same selection', () => {
      const r1 = selectRandomSubset(items, 30, 'fixed-seed');
      const r2 = selectRandomSubset(items, 30, 'fixed-seed');
      expect(r1).toEqual(r2);
    });

    it('different seeds produce different selections', () => {
      const r1 = selectRandomSubset(items, 50, 'seed-alpha');
      const r2 = selectRandomSubset(items, 50, 'seed-beta');
      // With 10 items at 50%, different seeds should (almost certainly) pick differently
      const same = r1.every((item, i) => item === r2[i]) && r1.length === r2.length;
      expect(same).toBe(false);
    });

    it('returns empty array for empty input', () => {
      const result = selectRandomSubset([], 50, 'seed');
      expect(result).toEqual([]);
    });

    it('returned items are a subset of input items', () => {
      const result = selectRandomSubset(items, 40, 'any-seed');
      for (const item of result) {
        expect(items).toContain(item);
      }
    });

    it('caps percentage at 100', () => {
      const result = selectRandomSubset(items, 150, 'seed');
      expect(result).toHaveLength(items.length);
    });

    it('rounds up to include at least one test for small percentages', () => {
      // 1% of 10 = 0.1, should round up to 1
      const result = selectRandomSubset(items, 1, 'seed');
      expect(result.length).toBe(1);
    });
  });
});
