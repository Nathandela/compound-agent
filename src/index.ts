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
 *
 * ## Resource Management
 *
 * This library manages two heavyweight resources that require cleanup:
 *
 * ### SQLite Database
 * - **Acquired:** Lazily on first database operation (search, rebuild, etc.)
 * - **Memory:** Minimal (~few KB for connection, index cached by OS)
 * - **Cleanup:** Call `closeDb()` before process exit
 *
 * ### Embedding Model
 * - **Acquired:** Lazily on first embedding call (embedText, embedTexts, searchVector)
 * - **Memory:** ~500MB RAM for the nomic-embed-text model
 * - **Cleanup:** Call `unloadEmbedding()` before process exit
 *
 * ### Recommended Cleanup Pattern
 *
 * ```typescript
 * import { closeDb, unloadEmbedding } from 'learning-agent';
 *
 * // For CLI commands - use try/finally
 * async function main() {
 *   try {
 *     // ... your code that uses learning-agent
 *   } finally {
 *     unloadEmbedding();
 *     closeDb();
 *   }
 * }
 *
 * // For long-running processes - use shutdown handlers
 * process.on('SIGTERM', () => {
 *   unloadEmbedding();
 *   closeDb();
 *   process.exit(0);
 * });
 * process.on('SIGINT', () => {
 *   unloadEmbedding();
 *   closeDb();
 *   process.exit(0);
 * });
 * ```
 *
 * **Note:** Failing to clean up will not corrupt data, but may cause:
 * - Memory leaks in long-running processes
 * - Unclean process exits (warnings in some environments)
 *
 * @see {@link closeDb} for database cleanup
 * @see {@link unloadEmbedding} for embedding model cleanup
 * @module learning-agent
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
  LessonTypeSchema,
  TombstoneSchema,
  // Deprecated - use LessonSchema instead
  QuickLessonSchema,
  FullLessonSchema,
} from './types.js';
export type {
  Lesson,
  LessonType,
  Tombstone,
  Source,
  Severity,
  Context,
  // Deprecated - use Lesson instead
  QuickLesson,
  FullLesson,
} from './types.js';
