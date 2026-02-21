/**
 * Search module - Vector similarity and ranking
 *
 * Provides semantic search with multi-factor ranking:
 * - Vector similarity (cosine)
 * - Severity boost
 * - Recency boost
 * - Confirmation boost
 */

// Vector search
export { cosineSimilarity, searchVector } from './vector.js';
export type { ScoredLesson, SearchVectorOptions } from './vector.js';

// Ranking
export {
  calculateScore,
  confirmationBoost,
  rankLessons,
  recencyBoost,
  severityBoost,
} from './ranking.js';
export type { RankedLesson } from './ranking.js';

// Hybrid search
export {
  CANDIDATE_MULTIPLIER,
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_VECTOR_WEIGHT,
  MIN_HYBRID_SCORE,
  mergeHybridResults,
  normalizeBm25Rank,
} from './hybrid.js';
export type { HybridMergeOptions, ScoredKeywordResult } from './hybrid.js';
