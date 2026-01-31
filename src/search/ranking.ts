/**
 * Multi-factor lesson ranking system
 *
 * Combines vector similarity with semantic boosts:
 * - Severity: high=1.5, medium=1.0, low=0.8
 * - Recency: 1.2 for lessons ≤30 days old
 * - Confirmation: 1.3 for confirmed lessons
 */

import type { Lesson } from '../types.js';

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
 * Calculate severity boost based on lesson type and severity.
 * Quick lessons (no severity) get 1.0.
 */
export function severityBoost(lesson: Lesson): number {
  if (lesson.type !== 'full') return MEDIUM_SEVERITY_BOOST;

  switch (lesson.severity) {
    case 'high':
      return HIGH_SEVERITY_BOOST;
    case 'medium':
      return MEDIUM_SEVERITY_BOOST;
    case 'low':
      return LOW_SEVERITY_BOOST;
  }
}

/**
 * Calculate recency boost based on lesson age.
 * Lessons ≤30 days old get 1.2, older get 1.0.
 */
export function recencyBoost(lesson: Lesson): number {
  const created = new Date(lesson.created);
  const now = new Date();
  const ageMs = now.getTime() - created.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

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
 * score = vectorSimilarity * severity * recency * confirmation
 */
export function calculateScore(lesson: Lesson, vectorSimilarity: number): number {
  return (
    vectorSimilarity * severityBoost(lesson) * recencyBoost(lesson) * confirmationBoost(lesson)
  );
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
