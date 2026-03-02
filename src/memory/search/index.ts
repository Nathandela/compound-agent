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
export { cosineSimilarity, findSimilarLessons, searchVector } from './vector.js';
export type { FindSimilarOptions, ScoredLesson, SearchVectorOptions, SimilarLesson } from './vector.js';

// Ranking
export {
  calculateScore,
  confirmationBoost,
  rankLessons,
  recencyBoost,
  severityBoost,
} from './ranking.js';
export type { RankedLesson } from './ranking.js';

// Pre-warm
export { preWarmLessonEmbeddings } from './prewarm.js';
export type { PreWarmResult } from './prewarm.js';

// Hybrid search
export {
  CANDIDATE_MULTIPLIER,
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_VECTOR_WEIGHT,
  MIN_HYBRID_SCORE,
  mergeHybridResults,
  mergeHybridScores,
  normalizeBm25Rank,
} from './hybrid.js';
export type { GenericScoredItem, HybridMergeOptions, ScoredKeywordResult } from './hybrid.js';
