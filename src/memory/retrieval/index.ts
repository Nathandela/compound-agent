/**
 * Retrieval module - Lesson retrieval for sessions and plans
 *
 * Session retrieval: Load high-severity lessons at session start.
 * Plan retrieval: Find relevant lessons when planning work.
 */

// Session-start retrieval
export { loadSessionLessons } from './session.js';

// Plan-time retrieval
export { formatLessonsCheck, retrieveForPlan } from './plan.js';
export type { PlanRetrievalResult } from './plan.js';
