/**
 * Retrieval module - Memory item retrieval for sessions and plans
 *
 * Session retrieval: Load high-severity items at session start.
 * Plan retrieval: Find relevant items when planning work.
 */

// Session-start retrieval
export { loadSessionLessons } from './session.js';

// Plan-time retrieval
export { formatLessonsCheck, retrieveForPlan } from './plan.js';
export type { PlanRetrievalResult } from './plan.js';
