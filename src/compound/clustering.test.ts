/**
 * Tests for clustering module.
 * Uses synthetic embedding vectors (no model needed).
 */

import { describe, expect, it } from 'vitest';

import { createLesson } from '../test-utils.js';
import { buildSimilarityMatrix, clusterBySimilarity } from './clustering.js';

describe('buildSimilarityMatrix', () => {
  it('returns empty matrix for empty input', () => {
    const matrix = buildSimilarityMatrix([]);
    expect(matrix).toEqual([]);
  });

  it('returns 1x1 matrix with 1.0 for single vector', () => {
    const matrix = buildSimilarityMatrix([[1, 0, 0]]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toHaveLength(1);
    expect(matrix[0]![0]).toBeCloseTo(1.0);
  });

  it('returns correct dimensions for N vectors', () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const matrix = buildSimilarityMatrix(embeddings);
    expect(matrix).toHaveLength(3);
    for (const row of matrix) {
      expect(row).toHaveLength(3);
    }
  });

  it('diagonal values are 1.0 (self-similarity)', () => {
    const embeddings = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const matrix = buildSimilarityMatrix(embeddings);
    expect(matrix[0]![0]).toBeCloseTo(1.0);
    expect(matrix[1]![1]).toBeCloseTo(1.0);
  });

  it('is symmetric', () => {
    const embeddings = [
      [1, 0, 0],
      [1, 1, 0],
      [0, 0, 1],
    ];
    const matrix = buildSimilarityMatrix(embeddings);
    expect(matrix[0]![1]).toBeCloseTo(matrix[1]![0]!);
    expect(matrix[0]![2]).toBeCloseTo(matrix[2]![0]!);
    expect(matrix[1]![2]).toBeCloseTo(matrix[2]![1]!);
  });

  it('orthogonal vectors have similarity 0', () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const matrix = buildSimilarityMatrix(embeddings);
    expect(matrix[0]![1]).toBeCloseTo(0.0);
  });

  it('identical vectors have similarity 1', () => {
    const embeddings = [
      [3, 4, 5],
      [3, 4, 5],
    ];
    const matrix = buildSimilarityMatrix(embeddings);
    expect(matrix[0]![1]).toBeCloseTo(1.0);
  });
});

describe('clusterBySimilarity', () => {
  it('returns empty clusters for empty input', () => {
    const result = clusterBySimilarity([], []);
    expect(result.clusters).toEqual([]);
    expect(result.noise).toEqual([]);
  });

  it('single item goes into its own cluster', () => {
    const items = [createLesson({ id: 'L001', insight: 'single item' })];
    const embeddings = [[1, 0, 0]];
    const result = clusterBySimilarity(items, embeddings);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toHaveLength(1);
    expect(result.clusters[0]![0]!.id).toBe('L001');
  });

  it('identical embeddings cluster together', () => {
    const items = [
      createLesson({ id: 'L001', insight: 'first' }),
      createLesson({ id: 'L002', insight: 'second' }),
    ];
    const embeddings = [
      [1, 0, 0],
      [1, 0, 0],
    ];
    const result = clusterBySimilarity(items, embeddings);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toHaveLength(2);
  });

  it('dissimilar items stay in separate clusters', () => {
    const items = [
      createLesson({ id: 'L001', insight: 'first' }),
      createLesson({ id: 'L002', insight: 'second' }),
    ];
    // Orthogonal vectors = 0 similarity, well below any threshold
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const result = clusterBySimilarity(items, embeddings);
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0]).toHaveLength(1);
    expect(result.clusters[1]).toHaveLength(1);
  });

  it('threshold parameter controls sensitivity', () => {
    const items = [
      createLesson({ id: 'L001', insight: 'a' }),
      createLesson({ id: 'L002', insight: 'b' }),
    ];
    // Vectors at ~0.7 cosine similarity
    const embeddings = [
      [1, 1, 0],
      [1, 0, 0],
    ];

    // Low threshold: should cluster together
    const loose = clusterBySimilarity(items, embeddings, 0.5);
    expect(loose.clusters).toHaveLength(1);

    // High threshold: should stay separate
    const strict = clusterBySimilarity(items, embeddings, 0.95);
    expect(strict.clusters).toHaveLength(2);
  });

  it('three items: two similar, one different', () => {
    const items = [
      createLesson({ id: 'L001', insight: 'typescript errors' }),
      createLesson({ id: 'L002', insight: 'typescript types' }),
      createLesson({ id: 'L003', insight: 'python decorators' }),
    ];
    // First two nearly identical, third orthogonal
    const embeddings = [
      [1, 0.9, 0],
      [1, 1, 0],
      [0, 0, 1],
    ];
    const result = clusterBySimilarity(items, embeddings, 0.75);
    expect(result.clusters).toHaveLength(2);
    // The two similar items should be in the same cluster
    const bigCluster = result.clusters.find((c) => c.length === 2);
    expect(bigCluster).toBeDefined();
    const ids = bigCluster!.map((item) => item.id).sort();
    expect(ids).toEqual(['L001', 'L002']);
  });
});
