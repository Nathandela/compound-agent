/**
 * Shared test utilities for creating lesson fixtures.
 *
 * These factory functions provide consistent test data across all test files.
 * Use `createLesson` for full control, or the convenience functions for common cases.
 */

import type { Lesson, Severity } from './types.js';

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
 * const fullLesson = createLesson({ id: 'L002', type: 'full', severity: 'high' });
 * ```
 */
export function createLesson(overrides: Partial<Lesson> = {}): Lesson {
  const id = overrides.id ?? 'L001';
  const insight = overrides.insight ?? 'test insight';
  const type = overrides.type ?? 'quick';

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
 * @returns A Lesson object with type 'quick'
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
    type: 'quick',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    tags: options.tags ?? [],
    source: 'manual',
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
 * @returns A Lesson object with type 'full'
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
    type: 'full',
    trigger: options.trigger ?? `trigger for ${insight}`,
    insight,
    evidence: options.evidence ?? 'Test evidence',
    severity,
    tags: options.tags ?? [],
    source: 'manual',
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
