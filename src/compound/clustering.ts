/**
 * Clustering module for grouping similar memory items.
 *
 * Uses single-linkage agglomerative clustering with cosine similarity.
 */

import { cosineSimilarity } from '../memory/search/index.js';
import type { MemoryItem } from '../memory/index.js';
import type { ClusterResult } from './types.js';

/** Default similarity threshold for clustering */
const DEFAULT_THRESHOLD = 0.75;

/**
 * Build a pairwise cosine similarity matrix from embedding vectors.
 *
 * @param embeddings - Array of embedding vectors
 * @returns NxN similarity matrix
 */
export function buildSimilarityMatrix(embeddings: ArrayLike<number>[]): number[][] {
  const n = embeddings.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i]!, embeddings[j]!);
      matrix[i]![j] = sim;
      matrix[j]![i] = sim;
    }
  }

  return matrix;
}

/**
 * Cluster memory items by embedding similarity using single-linkage
 * agglomerative clustering.
 *
 * @param items - Memory items to cluster
 * @param embeddings - Embedding vectors (same order as items)
 * @param threshold - Minimum similarity to merge clusters (default: 0.75)
 * @returns Clusters of similar items and noise (unclustered items)
 */
export function clusterBySimilarity(
  items: MemoryItem[],
  embeddings: ArrayLike<number>[],
  threshold: number = DEFAULT_THRESHOLD
): ClusterResult {
  const n = items.length;
  if (n === 0) return { clusters: [], noise: [] };

  const matrix = buildSimilarityMatrix(embeddings);

  // Union-Find for single-linkage clustering
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!; // path compression
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  // Merge pairs above threshold
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i]![j]! >= threshold) {
        union(i, j);
      }
    }
  }

  // Group items by their root
  const groups = new Map<number, MemoryItem[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(items[i]!);
  }

  const clusters: MemoryItem[][] = [];
  const noise: MemoryItem[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      noise.push(group[0]!);
    } else {
      clusters.push(group);
    }
  }
  return { clusters, noise };
}
