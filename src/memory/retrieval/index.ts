/**
 * Retrieval module - Memory item retrieval for sessions and plans
 *
 * Session retrieval: Load high-severity items at session start.
 * Plan retrieval: Find relevant items when planning work.
 */

// Session-start retrieval
export { loadSessionLessons, loadSessionMemory } from './session.js';

// Plan-time retrieval
export { formatLessonsCheck, formatMemoryCheck, retrieveForPlan } from './plan.js';
export type { PlanRetrievalResult } from './plan.js';
