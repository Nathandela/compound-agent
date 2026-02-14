/**
 * Types for the compounding module.
 *
 * CctPattern represents a cross-cutting pattern synthesized
 * from multiple similar lessons.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { MemoryItem } from '../memory/index.js';

/** Relative path to CCT patterns file from repo root */
export const CCT_PATTERNS_PATH = '.claude/lessons/cct-patterns.jsonl';

/** Schema for a cross-cutting pattern */
export const CctPatternSchema = z.object({
  id: z.string().regex(/^CCT-[a-f0-9]{8}$/),
  name: z.string().min(1),
  description: z.string().min(1),
  frequency: z.number().int().positive(),
  testable: z.boolean(),
  testApproach: z.string().optional(),
  sourceIds: z.array(z.string()).min(1),
  created: z.string(), // ISO8601
});

/** Inferred type from CctPatternSchema */
export type CctPattern = z.infer<typeof CctPatternSchema>;

/** Result from clustering operation */
export interface ClusterResult {
  /** Groups of similar items */
  clusters: MemoryItem[][];
  /** Items that didn't fit any cluster */
  noise: MemoryItem[];
}

/**
 * Generate a CCT pattern ID from a cluster ID string.
 * Format: "CCT-" + first 8 hex chars of SHA-256 hash.
 */
export function generateCctId(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return `CCT-${hash.slice(0, 8)}`;
}
