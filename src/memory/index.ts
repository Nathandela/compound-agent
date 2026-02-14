/**
 * Memory module barrel export.
 *
 * Re-exports types and sub-module APIs for cross-module consumption.
 */

// Types and schemas (from types.ts)
export {
  generateId,
  LegacyLessonSchema,
  LegacyTombstoneSchema,
  LessonItemSchema,
  LessonRecordSchema,
  LessonSchema,
  LessonTypeSchema,
  MemoryItemRecordSchema,
  MemoryItemSchema,
  MemoryItemTypeSchema,
  PatternItemSchema,
  PatternSchema,
  PreferenceItemSchema,
  SeveritySchema,
  SolutionItemSchema,
} from './types.js';
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
} from './types.js';

// Storage API
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
} from './storage/index.js';

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
} from './embeddings/index.js';

// Search API
export {
  cosineSimilarity,
  rankLessons,
  rankMemoryItems,
  searchVector,
} from './search/index.js';
export type { RankedLesson, RankedMemoryItem, ScoredLesson, ScoredMemoryItem } from './search/index.js';

// Capture API
export {
  detectSelfCorrection,
  detectTestFailure,
  detectUserCorrection,
  inferMemoryItemType,
  isActionable,
  isNovel,
  isSpecific,
  shouldPropose,
} from './capture/index.js';

// Retrieval API
export { loadSessionLessons, loadSessionMemory, retrieveForPlan } from './retrieval/index.js';

// Storage extras
export {
  compact,
  countTombstones,
  getRetrievalStats,
  incrementRetrievalCount,
  needsCompaction,
  syncIfNeeded,
  TOMBSTONE_THRESHOLD,
} from './storage/index.js';
