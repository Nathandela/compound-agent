/**
 * Tests for CctPattern I/O (JSONL persistence).
 * Uses temp directories via setupCliTestContext.
 */

import { describe, expect, it } from 'vitest';

import { setupCliTestContext } from '../test-utils.js';
import { readCctPatterns, writeCctPatterns } from './io.js';
import type { CctPattern } from './types.js';

function makeCctPattern(overrides: Partial<CctPattern> = {}): CctPattern {
  return {
    id: overrides.id ?? 'CCT-aabbccdd',
    name: overrides.name ?? 'Test Pattern',
    description: overrides.description ?? 'A test pattern description',
    frequency: overrides.frequency ?? 1,
    testable: overrides.testable ?? false,
    sourceIds: overrides.sourceIds ?? ['L001'],
    created: overrides.created ?? new Date().toISOString(),
    ...(overrides.testApproach !== undefined && { testApproach: overrides.testApproach }),
  };
}

describe('CctPattern I/O', () => {
  const { getTempDir } = setupCliTestContext();

  it('empty file returns empty array', async () => {
    const patterns = await readCctPatterns(getTempDir());
    expect(patterns).toEqual([]);
  });

  it('write then read roundtrip', async () => {
    const pattern = makeCctPattern({ id: 'CCT-11223344', name: 'Roundtrip' });
    await writeCctPatterns(getTempDir(), [pattern]);
    const result = await readCctPatterns(getTempDir());
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('CCT-11223344');
    expect(result[0]!.name).toBe('Roundtrip');
  });

  it('append-only behavior', async () => {
    const p1 = makeCctPattern({ id: 'CCT-aaaaaaaa', name: 'First' });
    const p2 = makeCctPattern({ id: 'CCT-bbbbbbbb', name: 'Second' });

    await writeCctPatterns(getTempDir(), [p1]);
    await writeCctPatterns(getTempDir(), [p2]);

    const result = await readCctPatterns(getTempDir());
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('CCT-aaaaaaaa');
    expect(result[1]!.id).toBe('CCT-bbbbbbbb');
  });

  it('preserves all fields including optional testApproach', async () => {
    const pattern = makeCctPattern({
      id: 'CCT-cccccccc',
      name: 'Full',
      description: 'Full pattern',
      frequency: 5,
      testable: true,
      testApproach: 'Unit test the validation layer',
      sourceIds: ['L001', 'L002', 'L003'],
    });

    await writeCctPatterns(getTempDir(), [pattern]);
    const result = await readCctPatterns(getTempDir());
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(pattern);
  });

  it('handles multiple patterns in one write call', async () => {
    const patterns = [
      makeCctPattern({ id: 'CCT-11111111' }),
      makeCctPattern({ id: 'CCT-22222222' }),
      makeCctPattern({ id: 'CCT-33333333' }),
    ];

    await writeCctPatterns(getTempDir(), patterns);
    const result = await readCctPatterns(getTempDir());
    expect(result).toHaveLength(3);
  });
});
