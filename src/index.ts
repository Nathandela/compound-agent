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
 * - **Memory:** ~150MB RAM for the EmbeddingGemma model
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

/**
 * Package version - must match package.json.
 * Update this when releasing a new version.
 */
export const VERSION = '0.2.5';

// Storage API (JSONL source of truth + SQLite index)
export {
  appendLesson,
  closeDb,
  DB_PATH,
  LESSONS_PATH,
  readLessons,
  rebuildIndex,
  searchKeyword,
} from './storage/index.js';
export type { ParseError, ReadLessonsOptions, ReadLessonsResult } from './storage/index.js';

// Embeddings API
export {
  embedText,
  embedTexts,
  getEmbedding,
  isModelAvailable,
  MODEL_FILENAME,
  MODEL_URI,
  resolveModel,
  unloadEmbedding,
} from './embeddings/index.js';

// Search API (vector similarity + ranking)
export {
  calculateScore,
  confirmationBoost,
  cosineSimilarity,
  rankLessons,
  recencyBoost,
  searchVector,
  severityBoost,
} from './search/index.js';
export type { RankedLesson, ScoredLesson, SearchVectorOptions } from './search/index.js';

// Capture API (quality filters + trigger detection)
export {
  detectSelfCorrection,
  detectTestFailure,
  detectUserCorrection,
  isActionable,
  isNovel,
  isSpecific,
  shouldPropose,
} from './capture/index.js';
export type {
  ActionabilityResult,
  CorrectionSignal,
  DetectedCorrection,
  DetectedSelfCorrection,
  DetectedTestFailure,
  EditEntry,
  EditHistory,
  NoveltyOptions,
  NoveltyResult,
  ProposeResult,
  SpecificityResult,
  TestResult,
} from './capture/index.js';

// Retrieval API (session + plan time)
export { formatLessonsCheck, loadSessionLessons, retrieveForPlan } from './retrieval/index.js';
export type { PlanRetrievalResult } from './retrieval/index.js';

// Context recovery API (for MCP server integration)
export { getPrimeContext } from './commands/index.js';

// Types and schemas
export {
  generateId,
  LessonSchema,
  LessonTypeSchema,
  TombstoneSchema,
} from './types.js';
export type {
  Lesson,
  LessonType,
  Tombstone,
  Source,
  Severity,
  Context,
} from './types.js';
