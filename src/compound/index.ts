/**
 * Compounding module barrel export.
 *
 * Provides clustering, synthesis, and I/O for cross-cutting patterns.
 */

export { buildSimilarityMatrix, clusterBySimilarity } from './clustering.js';
export { readCctPatterns, writeCctPatterns } from './io.js';
export { synthesizePattern } from './synthesis.js';
export { CCT_PATTERNS_PATH, CctPatternSchema, generateCctId } from './types.js';
export type { CctPattern, ClusterResult } from './types.js';
