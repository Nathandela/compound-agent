/**
 * Multi-factor memory item ranking system
 *
 * Combines vector similarity with semantic boosts:
 * - Severity: high=1.5, medium=1.0, low=0.8
 * - Recency: 1.2 for items ≤30 days old
 * - Confirmation: 1.3 for confirmed items
 */

import type { MemoryItem } from '../types.js';
import { getLessonAgeDays } from '../../utils.js';

import type { ScoredLesson } from './vector.js';

/** Lesson/memory item with final ranked score */
export interface RankedLesson extends ScoredLesson {
  finalScore?: number;
}

const RECENCY_THRESHOLD_DAYS = 30;
const HIGH_SEVERITY_BOOST = 1.5;
const MEDIUM_SEVERITY_BOOST = 1.0;
const LOW_SEVERITY_BOOST = 0.8;
const RECENCY_BOOST = 1.2;
const CONFIRMATION_BOOST = 1.3;

/**
 * Maximum combined boost multiplier.
 *
 * Without clamping, the max boost is 1.5 * 1.2 * 1.3 = 2.34x, which lets
 * a 0.4 similarity item outrank a 0.9 similarity item. With a 1.8 cap,
 * an item needs at least ~0.53 similarity with all boosts to beat a 0.95
 * unboosted match, keeping semantic relevance as the primary ranking signal.
 */
const MAX_COMBINED_BOOST = 1.8;

/**
 * Calculate severity boost based on item severity.
 * Items without severity get 1.0 (medium boost).
 */
export function severityBoost(item: MemoryItem): number {
  switch (item.severity) {
    case 'high':
      return HIGH_SEVERITY_BOOST;
    case 'medium':
      return MEDIUM_SEVERITY_BOOST;
    case 'low':
      return LOW_SEVERITY_BOOST;
    default:
      return MEDIUM_SEVERITY_BOOST;
  }
}

/**
 * Calculate recency boost based on item age.
 * Items ≤30 days old get 1.2, older get 1.0.
 */
export function recencyBoost(item: MemoryItem): number {
  const ageDays = getLessonAgeDays(item);
  return ageDays <= RECENCY_THRESHOLD_DAYS ? RECENCY_BOOST : 1.0;
}

/**
 * Calculate confirmation boost.
 * Confirmed items get 1.3, unconfirmed get 1.0.
 */
export function confirmationBoost(item: MemoryItem): number {
  return item.confirmed ? CONFIRMATION_BOOST : 1.0;
}

/**
 * Calculate combined score for a memory item.
 * score = vectorSimilarity * min(severity * recency * confirmation, MAX_COMBINED_BOOST)
 */
export function calculateScore(item: MemoryItem, vectorSimilarity: number): number {
  const boost = Math.min(
    severityBoost(item) * recencyBoost(item) * confirmationBoost(item),
    MAX_COMBINED_BOOST,
  );
  return vectorSimilarity * boost;
}

/**
 * Rank lessons by combined score.
 * Returns new array sorted by finalScore descending.
 *
 * Works with ScoredLesson[] (uses .lesson field).
 */
export function rankLessons(lessons: ScoredLesson[]): RankedLesson[] {
  return lessons
    .map((scored) => ({
      ...scored,
      finalScore: calculateScore(scored.lesson, scored.score),
    }))
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}

