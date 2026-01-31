/**
 * Learning Agent - Repository-scoped learning system for Claude Code
 *
 * This package helps Claude Code learn from mistakes and avoid repeating them.
 * It captures lessons during coding sessions and retrieves relevant lessons
 * when planning new work.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { appendLesson, retrieveForPlan, loadSessionLessons } from 'learning-agent';
 *
 * // At session start, load high-severity lessons
 * const criticalLessons = await loadSessionLessons(repoRoot);
 *
 * // When planning, retrieve relevant lessons
 * const { lessons, message } = await retrieveForPlan(repoRoot, planText);
 *
 * // When capturing a lesson
 * await appendLesson(repoRoot, lesson);
 * ```
 *
 * ## Hook Integration
 *
 * Add to your `.claude/settings.json`:
 *
 * ```json
 * {
 *   "hooks": {
 *     "session_start": "npx learning-agent load-session",
 *     "pre_tool": "npx learning-agent check-plan"
 *   }
 * }
 * ```
 */

export const VERSION = '0.1.0';

// Storage API
export { appendLesson, readLessons, LESSONS_PATH } from './storage/jsonl.js';
export type { ReadLessonsOptions, ReadLessonsResult, ParseError } from './storage/jsonl.js';
export { rebuildIndex, searchKeyword, closeDb, DB_PATH } from './storage/sqlite.js';

// Embeddings API
export { embedText, embedTexts, getEmbedding, unloadEmbedding } from './embeddings/nomic.js';
export { ensureModel, getModelPath } from './embeddings/download.js';

// Search API
export { searchVector, cosineSimilarity } from './search/vector.js';
export type { ScoredLesson, SearchVectorOptions } from './search/vector.js';
export { rankLessons, calculateScore, severityBoost, recencyBoost, confirmationBoost } from './search/ranking.js';
export type { RankedLesson } from './search/ranking.js';

// Capture API - Quality filters
export { shouldPropose, isNovel, isSpecific, isActionable } from './capture/quality.js';
export type { NoveltyResult, NoveltyOptions, SpecificityResult, ActionabilityResult, ProposeResult } from './capture/quality.js';

// Capture API - Triggers
export { detectUserCorrection, detectSelfCorrection, detectTestFailure } from './capture/triggers.js';
export type {
  CorrectionSignal,
  DetectedCorrection,
  EditHistory,
  EditEntry,
  DetectedSelfCorrection,
  TestResult,
  DetectedTestFailure,
} from './capture/triggers.js';

// Retrieval API
export { loadSessionLessons } from './retrieval/session.js';
export { retrieveForPlan, formatLessonsCheck } from './retrieval/plan.js';
export type { PlanRetrievalResult } from './retrieval/plan.js';

// Types and schemas
export {
  generateId,
  LessonSchema,
  QuickLessonSchema,
  FullLessonSchema,
  TombstoneSchema,
} from './types.js';
export type {
  Lesson,
  QuickLesson,
  FullLesson,
  Tombstone,
  Source,
  Severity,
  Context,
} from './types.js';
