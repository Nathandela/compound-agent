/**
 * Synthesis module for extracting cross-cutting patterns from clusters.
 *
 * Takes a cluster of similar memory items and produces a CctPattern
 * summarizing the common theme.
 */

import type { MemoryItem } from '../memory/types.js';
import { generateCctId, type CctPattern } from './types.js';

/**
 * Synthesize a CctPattern from a cluster of similar memory items.
 *
 * @param cluster - Group of similar memory items
 * @param clusterId - Identifier for this cluster (used for ID generation)
 * @returns A CctPattern summarizing the cluster
 */
export function synthesizePattern(cluster: MemoryItem[], clusterId: string): CctPattern {
  const id = generateCctId(clusterId);
  const frequency = cluster.length;
  const sourceIds = cluster.map((item) => item.id);

  // Collect all tags with frequency counts
  const tagCounts = new Map<string, number>();
  for (const item of cluster) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  // Sort tags by frequency (descending)
  const sortedTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Build name from top tags or first insight
  const name = sortedTags.length > 0
    ? sortedTags.slice(0, 3).join(', ')
    : cluster[0]!.insight.slice(0, 50);

  // Build description from all insights
  const description = cluster.map((item) => item.insight).join('; ');

  // Determine testability: true if any item has high severity or evidence
  const hasHighSeverity = cluster.some(
    (item) => 'severity' in item && item.severity === 'high'
  );
  const hasEvidence = cluster.some(
    (item) => 'evidence' in item && item.evidence
  );
  const testable = hasHighSeverity || hasEvidence;

  // Generate test approach when testable
  const testApproach = testable
    ? `Verify pattern: ${name}. Check ${frequency} related lesson(s).`
    : undefined;

  return {
    id,
    name,
    description,
    frequency,
    testable,
    ...(testApproach !== undefined && { testApproach }),
    sourceIds,
    created: new Date().toISOString(),
  };
}
