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
export type { ScoredLesson, ScoredMemoryItem, SearchVectorOptions } from './vector.js';

// Ranking
export {
  calculateScore,
  confirmationBoost,
  rankLessons,
  rankMemoryItems,
  recencyBoost,
  severityBoost,
} from './ranking.js';
export type { RankedLesson, RankedMemoryItem } from './ranking.js';
