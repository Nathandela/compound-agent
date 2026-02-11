/**
 * Multi-factor lesson ranking system
 *
 * Combines vector similarity with semantic boosts:
 * - Severity: high=1.5, medium=1.0, low=0.8
 * - Recency: 1.2 for lessons ≤30 days old
 * - Confirmation: 1.3 for confirmed lessons
 */

import type { Lesson } from '../types.js';
import { getLessonAgeDays } from '../../utils.js';

import type { ScoredLesson } from './vector.js';

/** Lesson with final ranked score */
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
 * a 0.4 similarity lesson outrank a 0.9 similarity lesson. With a 1.8 cap,
 * a lesson needs at least ~0.53 similarity with all boosts to beat a 0.95
 * unboosted match, keeping semantic relevance as the primary ranking signal.
 */
const MAX_COMBINED_BOOST = 1.8;

/**
 * Calculate severity boost based on lesson severity.
 * Lessons without severity get 1.0 (medium boost).
 */
export function severityBoost(lesson: Lesson): number {
  switch (lesson.severity) {
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
 * Calculate recency boost based on lesson age.
 * Lessons ≤30 days old get 1.2, older get 1.0.
 */
export function recencyBoost(lesson: Lesson): number {
  const ageDays = getLessonAgeDays(lesson);
  return ageDays <= RECENCY_THRESHOLD_DAYS ? RECENCY_BOOST : 1.0;
}

/**
 * Calculate confirmation boost.
 * Confirmed lessons get 1.3, unconfirmed get 1.0.
 */
export function confirmationBoost(lesson: Lesson): number {
  return lesson.confirmed ? CONFIRMATION_BOOST : 1.0;
}

/**
 * Calculate combined score for a lesson.
 * score = vectorSimilarity * min(severity * recency * confirmation, MAX_COMBINED_BOOST)
 */
export function calculateScore(lesson: Lesson, vectorSimilarity: number): number {
  const boost = Math.min(
    severityBoost(lesson) * recencyBoost(lesson) * confirmationBoost(lesson),
    MAX_COMBINED_BOOST,
  );
  return vectorSimilarity * boost;
}

/**
 * Rank lessons by combined score.
 * Returns new array sorted by finalScore descending.
 */
export function rankLessons(lessons: ScoredLesson[]): RankedLesson[] {
  return lessons
    .map((scored) => ({
      ...scored,
      finalScore: calculateScore(scored.lesson, scored.score),
    }))
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}
