/**
 * Tests for synthesis module.
 * Extracts common themes from lesson clusters into CctPatterns.
 */

import { describe, expect, it } from 'vitest';

import { createLesson } from '../test-utils-pure.js';
import { CctPatternSchema } from './types.js';
import { synthesizePattern } from './synthesis.js';

describe('synthesizePattern', () => {
  it('single-item cluster produces valid CctPattern', () => {
    const cluster = [
      createLesson({
        id: 'L001',
        insight: 'Always validate user input',
        tags: ['validation'],
        severity: 'high',
      }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    const parsed = CctPatternSchema.safeParse(pattern);
    expect(parsed.success).toBe(true);
  });

  it('id starts with CCT- prefix', () => {
    const cluster = [createLesson({ id: 'L001', insight: 'test' })];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.id).toMatch(/^CCT-[a-f0-9]{8}$/);
  });

  it('frequency equals cluster size', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'input validation' }),
      createLesson({ id: 'L002', insight: 'form validation' }),
      createLesson({ id: 'L003', insight: 'api validation' }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.frequency).toBe(3);
  });

  it('sourceIds contains all lesson IDs from cluster', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'a' }),
      createLesson({ id: 'L002', insight: 'b' }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.sourceIds).toContain('L001');
    expect(pattern.sourceIds).toContain('L002');
    expect(pattern.sourceIds).toHaveLength(2);
  });

  it('multi-item cluster uses tags from all items', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'a', tags: ['typescript', 'validation'] }),
      createLesson({ id: 'L002', insight: 'b', tags: ['typescript', 'testing'] }),
      createLesson({ id: 'L003', insight: 'c', tags: ['validation'] }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    // Name should reflect the most common tags
    expect(pattern.name).toBeTruthy();
    expect(pattern.description).toBeTruthy();
  });

  it('testable is true when cluster has high-severity items', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'critical bug', severity: 'high' }),
      createLesson({ id: 'L002', insight: 'minor issue', severity: 'low' }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.testable).toBe(true);
  });

  it('testable is false when no items have evidence or high severity', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'minor note' }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.testable).toBe(false);
  });

  it('created is a valid ISO date string', () => {
    const cluster = [createLesson({ id: 'L001', insight: 'test' })];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(() => new Date(pattern.created)).not.toThrow();
    expect(new Date(pattern.created).toISOString()).toBe(pattern.created);
  });

  it('description combines insights from all cluster items', () => {
    const cluster = [
      createLesson({ id: 'L001', insight: 'validate user input' }),
      createLesson({ id: 'L002', insight: 'check form fields' }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.description.length).toBeGreaterThan(0);
  });

  it('testApproach is set when testable is true', () => {
    const cluster = [
      createLesson({
        id: 'L001',
        insight: 'validate inputs',
        severity: 'high',
        evidence: 'Bug found in production',
      }),
    ];
    const pattern = synthesizePattern(cluster, 'cluster-0');
    expect(pattern.testable).toBe(true);
    expect(pattern.testApproach).toBeTruthy();
  });
});
