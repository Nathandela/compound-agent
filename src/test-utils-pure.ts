/**
 * Pure test utilities — zero native imports.
 *
 * This module contains only:
 *   1. Lesson fixture creators (createLesson, createQuickLesson, createFullLesson, etc.)
 *   2. Skip helpers (shouldSkipEmbeddingTests)
 *
 * It MUST NOT import from: better-sqlite3, onnxruntime-node,
 * @huggingface/transformers, or memory/storage/sqlite.
 *
 * Safe imports: node:crypto (if needed), ./memory/types.js (type-only).
 */

import type { Lesson, PatternItem, Preference, Severity, Solution, Source } from './memory/types.js';

// ---------------------------------------------------------------------------
// Section 1: Lesson fixture creators
// ---------------------------------------------------------------------------

/**
 * Options for creating lesson fixtures.
 */
export interface LessonOptions {
  /** Custom trigger text (default: 'trigger for {insight}') */
  trigger?: string;
  /** Tags for the lesson (default: []) */
  tags?: string[];
  /** Whether lesson is confirmed (default: true) */
  confirmed?: boolean;
  /** Created date as ISO string or days ago as number */
  created?: string | number;
  /** Evidence text for full lessons */
  evidence?: string;
  /** Severity level for full lessons */
  severity?: Severity;
  /** Whether lesson is deleted */
  deleted?: boolean;
  /** Source of the lesson (default: 'manual') */
  source?: Source;
}

/**
 * Create a test lesson with full control over all fields.
 *
 * @param overrides - Partial lesson data to override defaults
 * @returns A complete Lesson object
 *
 * @example
 * ```ts
 * const lesson = createLesson({ id: 'L001', insight: 'Use Polars' });
 * const fullLesson = createLesson({ id: 'L002', severity: 'high' });
 * ```
 */
export function createLesson(overrides: Partial<Lesson> = {}): Lesson {
  const id = overrides.id ?? 'L001';
  const insight = overrides.insight ?? 'test insight';
  const type = overrides.type ?? 'lesson';

  return {
    id,
    type,
    trigger: overrides.trigger ?? `trigger for ${insight}`,
    insight,
    tags: overrides.tags ?? [],
    source: overrides.source ?? 'manual',
    context: overrides.context ?? { tool: 'test', intent: 'testing' },
    created: overrides.created ?? new Date().toISOString(),
    confirmed: overrides.confirmed ?? true,
    supersedes: overrides.supersedes ?? [],
    related: overrides.related ?? [],
    ...(overrides.evidence !== undefined && { evidence: overrides.evidence }),
    ...(overrides.severity !== undefined && { severity: overrides.severity }),
    ...(overrides.pattern !== undefined && { pattern: overrides.pattern }),
    ...(overrides.deleted !== undefined && { deleted: overrides.deleted }),
    ...(overrides.retrievalCount !== undefined && { retrievalCount: overrides.retrievalCount }),
  };
}

/**
 * Create a quick lesson for testing.
 *
 * @param id - Lesson ID
 * @param insight - Insight text
 * @param options - Additional options
 * @returns A Lesson object with type 'lesson' (no evidence/severity)
 *
 * @example
 * ```ts
 * const lesson = createQuickLesson('L001', 'Use Polars for data');
 * const lesson2 = createQuickLesson('L002', 'Test code', { trigger: 'custom trigger' });
 * ```
 */
export function createQuickLesson(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Lesson {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'lesson',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a full lesson for testing.
 *
 * @param id - Lesson ID
 * @param insight - Insight text
 * @param severity - Severity level (default: 'medium')
 * @param options - Additional options
 * @returns A Lesson object with type 'lesson' and evidence/severity set
 *
 * @example
 * ```ts
 * const lesson = createFullLesson('L001', 'Always validate input', 'high');
 * const lesson2 = createFullLesson('L002', 'Test first', 'medium', { confirmed: false });
 * ```
 */
export function createFullLesson(
  id: string,
  insight: string,
  severity: Severity = 'medium',
  options: LessonOptions = {}
): Lesson {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'lesson',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    evidence: options.evidence ?? 'Test evidence',
    severity,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a solution memory item for testing.
 *
 * @param id - Item ID (should start with 'S')
 * @param insight - Resolution text
 * @param options - Additional options
 * @returns A Solution memory item
 */
export function createSolution(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Solution {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'solution',
    trigger: options.trigger ?? `problem for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a pattern memory item for testing.
 * Pattern field (bad -> good) is REQUIRED.
 *
 * @param id - Item ID (should start with 'P')
 * @param insight - Pattern description
 * @param bad - Bad code example
 * @param good - Good code example
 * @param options - Additional options
 * @returns A PatternItem memory item
 */
export function createPattern(
  id: string,
  insight: string,
  bad: string,
  good: string,
  options: LessonOptions = {}
): PatternItem {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'pattern',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    pattern: { bad, good },
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Create a preference memory item for testing.
 *
 * @param id - Item ID (should start with 'R')
 * @param insight - Preference description
 * @param options - Additional options
 * @returns A Preference memory item
 */
export function createPreference(
  id: string,
  insight: string,
  options: LessonOptions = {}
): Preference {
  const created = resolveCreatedDate(options.created);

  return {
    id,
    type: 'preference',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: options.source ?? 'manual',
    context: { tool: 'test', intent: 'testing' },
    created,
    confirmed: options.confirmed ?? true,
    supersedes: [],
    related: [],
    ...(options.deleted !== undefined && { deleted: options.deleted }),
  };
}

/**
 * Resolve created date from string, number (days ago), or undefined.
 */
function resolveCreatedDate(created: string | number | undefined): string {
  if (typeof created === 'string') {
    return created;
  }
  if (typeof created === 'number') {
    // Number represents days ago
    const date = new Date();
    date.setDate(date.getDate() - created);
    return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Helper to calculate ISO date string for N days ago.
 *
 * @param days - Number of days in the past
 * @returns ISO8601 date string
 *
 * @example
 * ```ts
 * const weekAgo = daysAgo(7);
 * ```
 */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Section 2: Skip helpers
// ---------------------------------------------------------------------------

/**
 * Check if embedding tests should be skipped.
 *
 * Tests should be skipped if:
 * 1. SKIP_EMBEDDING_TESTS environment variable is set (any truthy value)
 * 2. Model file is not available
 * 3. Model runtime is not usable on this machine (native backend incompatibility)
 *
 * This provides a way for CI environments without compatible native runners
 * to skip embedding-dependent tests while still running business logic tests.
 *
 * @param modelAvailable - Result of isModelAvailable() check
 * @param runtimeUsable - Result of isModelUsable().usable check (defaults to modelAvailable)
 * @returns true if embedding tests should be skipped
 *
 * @example
 * ```ts
 * // PREFERRED: use isModelAvailable() only (zero native memory allocation)
 * const modelAvailable = isModelAvailable();
 * const skipEmbedding = shouldSkipEmbeddingTests(modelAvailable);
 * it.skipIf(skipEmbedding)('test...', async () => { ... });
 *
 * // NEVER call isModelUsable() at module top-level — it loads ~400MB
 * // of native memory that leaks when vitest workers SIGABRT during disposal.
 * ```
 */
export function shouldSkipEmbeddingTests(
  modelAvailable: boolean,
  runtimeUsable: boolean = modelAvailable
): boolean {
  const envSkip = process.env.SKIP_EMBEDDING_TESTS;
  const skipByEnv = envSkip !== undefined && envSkip !== '' && envSkip !== '0' && envSkip !== 'false';
  return skipByEnv || !modelAvailable || !runtimeUsable;
}
