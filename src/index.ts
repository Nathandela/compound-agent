/**
 * Compound Agent - Repository-scoped learning system for Claude Code
 *
 * This package helps Claude Code learn from mistakes and avoid repeating them.
 * It captures lessons during coding sessions and retrieves relevant lessons
 * when planning new work.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { appendLesson, retrieveForPlan, loadSessionLessons } from 'compound-agent';
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
 * ## Setup
 *
 * Run `npx ca init` in your project root to configure hooks and AGENTS.md.
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
 * import { closeDb, unloadEmbedding } from 'compound-agent';
 *
 * // For CLI commands - use try/finally
 * async function main() {
 *   try {
 *     // ... your code that uses compound-agent
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
 * @module compound-agent
 */

/** Package version, read from package.json. */
export { VERSION } from './version.js';

// Storage API (JSONL source of truth + SQLite index)
export {
  appendLesson,
  appendMemoryItem,
  closeDb,
  DB_PATH,
  LESSONS_PATH,
  readLessons,
  readMemoryItems,
  rebuildIndex,
  searchKeyword,
} from './memory/storage/index.js';
export type { ParseError, ReadLessonsOptions, ReadLessonsResult, ReadMemoryItemsResult } from './memory/storage/index.js';

// Embeddings API
export {
  embedText,
  embedTexts,
  getEmbedding,
  isModelAvailable,
  isModelUsable,
  MODEL_FILENAME,
  MODEL_URI,
  resolveModel,
  unloadEmbedding,
} from './memory/embeddings/index.js';
export type { UsabilityResult } from './memory/embeddings/index.js';

// Search API (vector similarity + ranking + hybrid)
export {
  calculateScore,
  CANDIDATE_MULTIPLIER,
  confirmationBoost,
  cosineSimilarity,
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_VECTOR_WEIGHT,
  mergeHybridResults,
  normalizeBm25Rank,
  rankLessons,
  recencyBoost,
  searchVector,
  severityBoost,
} from './memory/search/index.js';
export type { HybridMergeOptions, RankedLesson, ScoredKeywordResult, ScoredLesson, SearchVectorOptions } from './memory/search/index.js';

// Capture API (quality filters + trigger detection)
export {
  detectSelfCorrection,
  detectTestFailure,
  detectUserCorrection,
  isActionable,
  isNovel,
  isSpecific,
  shouldPropose,
} from './memory/capture/index.js';
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
} from './memory/capture/index.js';

// Retrieval API (session + plan time)
export { formatLessonsCheck, loadSessionLessons, retrieveForPlan } from './memory/retrieval/index.js';
export type { PlanRetrievalResult } from './memory/retrieval/index.js';

// Knowledge API (docs embeddings + search)
export {
  closeKnowledgeDb,
  collectCachedChunkEmbeddings,
  getCachedChunkEmbedding,
  KNOWLEDGE_DB_PATH,
  KNOWLEDGE_SCHEMA_VERSION,
  openKnowledgeDb,
  searchChunksKeywordScored,
  setCachedChunkEmbedding,
} from './memory/storage/sqlite-knowledge/index.js';
export type { KnowledgeChunk, KnowledgeDbOptions, ScoredChunk } from './memory/storage/sqlite-knowledge/index.js';

export {
  chunkFile,
  indexDocs,
  searchKnowledge,
  searchKnowledgeVector,
  embedChunks,
  getUnembeddedChunkCount,
  acquireEmbedLock,
  isEmbedLocked,
  writeEmbedStatus,
  readEmbedStatus,
  spawnBackgroundEmbed,
  runBackgroundEmbed,
  indexAndSpawnEmbed,
} from './memory/knowledge/index.js';
export type {
  IndexOptions,
  IndexResult,
  KnowledgeSearchOptions,
  EmbedChunksOptions,
  EmbedChunksResult,
  LockResult,
  EmbedStatus,
  SpawnEmbedResult,
} from './memory/knowledge/index.js';

// Context recovery API
export { getPrimeContext } from './commands/index.js';

// Audit API
export { runAudit, AuditFindingSchema, AuditReportSchema } from './audit/index.js';
export type { AuditFinding, AuditReport, AuditOptions } from './audit/index.js';

// Compound API (clustering, synthesis, pattern I/O)
export {
  buildSimilarityMatrix,
  CCT_PATTERNS_PATH,
  CctPatternSchema,
  clusterBySimilarity,
  readCctPatterns,
  synthesizePattern,
  writeCctPatterns,
} from './compound/index.js';
export type { CctPattern, ClusterResult } from './compound/index.js';

// Lint detection API
export { detectLinter, LinterInfoSchema, LinterNameSchema } from './lint/index.js';
export type { LinterInfo, LinterName } from './lint/index.js';

// Types and schemas
export {
  generateId,
  LessonItemSchema,
  LessonSchema,
  MemoryItemRecordSchema,
  MemoryItemSchema,
  MemoryItemTypeSchema,
  PatternItemSchema,
  PreferenceItemSchema,
  SolutionItemSchema,
} from './memory/types.js';
export type {
  Context,
  Lesson,
  LessonRecord,
  LessonType,
  MemoryItem,
  MemoryItemRecord,
  MemoryItemType,
  PatternItem,
  Preference,
  Severity,
  Solution,
  Source,
} from './memory/types.js';
