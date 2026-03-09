/**
 * Memory item type definitions using Zod schemas.
 *
 * Supports 4 memory item types via discriminated union:
 * - lesson: Knowledge learned from mistakes
 * - solution: Problem-resolution pairs
 * - pattern: Code pattern transformations (bad -> good)
 * - preference: User workflow preferences
 *
 * Deletion model:
 * - Set `deleted: true` and `deletedAt` on an item to mark it deleted
 * - LegacyTombstoneSchema handles backward-compat reads of old
 *   minimal tombstone records { id, deleted: true, deletedAt }
 * - LegacyLessonSchema handles old quick/full type records
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

// Source of lesson capture
export const SourceSchema = z.enum([
  'user_correction',
  'self_correction',
  'test_failure',
  'manual',
]);

// Context about when lesson was learned
export const ContextSchema = z.object({
  tool: z.string(),
  intent: z.string(),
});

// Code pattern (bad -> good)
export const PatternSchema = z.object({
  bad: z.string(),
  good: z.string(),
});

// Citation for lesson provenance tracking
export const CitationSchema = z.object({
  file: z.string().min(1),           // Source file path (required, non-empty)
  line: z.number().int().positive().optional(), // Line number (optional, must be positive)
  commit: z.string().optional(),     // Git commit hash (optional)
});

// Severity levels for lessons
export const SeveritySchema = z.enum(['high', 'medium', 'low']);

// Compaction levels for age-based validity
export const CompactionLevelSchema = z.union([
  z.literal(0), // Active
  z.literal(1), // Flagged (>90 days)
  z.literal(2), // Archived
]);

/** @deprecated Use MemoryItemTypeSchema instead. Kept for parsing old JSONL records. */
export const LessonTypeSchema = z.enum(['quick', 'full']);

/** Memory item type enum: lesson, solution, pattern, preference. */
export const MemoryItemTypeSchema = z.enum(['lesson', 'solution', 'pattern', 'preference']);

// ---------------------------------------------------------------------------
// Base fields shared by all memory item types
// ---------------------------------------------------------------------------

const baseFields = {
  // Core identity (required)
  id: z.string(),
  trigger: z.string(),
  insight: z.string(),

  // Metadata (required)
  tags: z.array(z.string()),
  source: SourceSchema,
  context: ContextSchema,
  created: z.string(), // ISO8601
  confirmed: z.boolean(),

  // Relationships (required, can be empty arrays)
  supersedes: z.array(z.string()),
  related: z.array(z.string()),

  // Extended fields (optional)
  evidence: z.string().optional(),
  severity: SeveritySchema.optional(),

  // Lifecycle fields (optional)
  deleted: z.boolean().optional(),
  deletedAt: z.string().optional(),
  retrievalCount: z.number().optional(),

  // Provenance tracking (optional)
  citation: CitationSchema.optional(),

  // Age-based validity fields (optional)
  compactionLevel: CompactionLevelSchema.optional(),
  compactedAt: z.string().optional(),
  lastRetrieved: z.string().optional(),

  // Invalidation fields (optional)
  invalidatedAt: z.string().optional(),
  invalidationReason: z.string().optional(),
} as const;

// ---------------------------------------------------------------------------
// Type-specific schemas
// ---------------------------------------------------------------------------

/**
 * Lesson memory item schema.
 * Replaces the old quick/full distinction with a single 'lesson' type.
 * Pattern field is optional for lessons.
 */
export const LessonItemSchema = z.object({
  ...baseFields,
  type: z.literal('lesson'),
  pattern: PatternSchema.optional(),
});

/**
 * Solution memory item schema.
 * Uses trigger as "problem" and insight as "resolution".
 * Pattern field is optional.
 */
export const SolutionItemSchema = z.object({
  ...baseFields,
  type: z.literal('solution'),
  pattern: PatternSchema.optional(),
});

/**
 * Pattern memory item schema.
 * Pattern field is REQUIRED (bad -> good code transformation).
 */
export const PatternItemSchema = z.object({
  ...baseFields,
  type: z.literal('pattern'),
  pattern: PatternSchema,
});

/**
 * Preference memory item schema.
 * Captures user workflow preferences.
 * Pattern field is optional.
 */
export const PreferenceItemSchema = z.object({
  ...baseFields,
  type: z.literal('preference'),
  pattern: PatternSchema.optional(),
});

// ---------------------------------------------------------------------------
// Discriminated union of all memory item types
// ---------------------------------------------------------------------------

/**
 * Unified memory item schema (discriminated union on 'type' field).
 * Accepts: lesson, solution, pattern, preference.
 */
export const MemoryItemSchema = z.discriminatedUnion('type', [
  LessonItemSchema,
  SolutionItemSchema,
  PatternItemSchema,
  PreferenceItemSchema,
]);

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

/**
 * Legacy lesson schema for reading old JSONL records with type: 'quick' | 'full'.
 * Use this only for parsing existing data files; new records use MemoryItemSchema.
 */
export const LegacyLessonSchema = z.object({
  ...baseFields,
  type: LessonTypeSchema,
  pattern: PatternSchema.optional(),
});

/**
 * LessonSchema - now equivalent to LessonItemSchema.
 *
 * For backward compatibility, existing code that imports LessonSchema
 * continues to work. The type field is now z.literal('lesson').
 *
 * To parse old quick/full records, use LegacyLessonSchema.
 */
export const LessonSchema = LessonItemSchema;

/**
 * Legacy tombstone format for backward-compatible reads.
 * Old JSONL files may contain minimal { id, deleted, deletedAt } records.
 */
export const LegacyTombstoneSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  deletedAt: z.string(), // ISO8601
});

/**
 * LessonRecord schema - union for reading JSONL files.
 *
 * Accepts:
 * 1. Any new memory item type (lesson, solution, pattern, preference)
 * 2. A legacy lesson (type: 'quick' | 'full')
 * 3. A legacy tombstone (minimal: { id, deleted: true, deletedAt })
 */
export const LessonRecordSchema = z.union([
  MemoryItemSchema,
  LegacyLessonSchema,
  LegacyTombstoneSchema,
]);

/**
 * MemoryItemRecord schema - alias for LessonRecordSchema.
 * Parses all memory item types plus legacy formats.
 */
export const MemoryItemRecordSchema = LessonRecordSchema;

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Lesson = z.infer<typeof LessonSchema>;
/** @deprecated Use MemoryItemType instead. */
export type LessonType = z.infer<typeof LessonTypeSchema>;
export type LessonRecord = z.infer<typeof LessonRecordSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type CompactionLevel = z.infer<typeof CompactionLevelSchema>;

/** Unified memory item type (discriminated union). */
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
/** Memory item type enum: 'lesson' | 'solution' | 'pattern' | 'preference'. */
export type MemoryItemType = z.infer<typeof MemoryItemTypeSchema>;
/** Solution memory item. */
export type Solution = z.infer<typeof SolutionItemSchema>;
/** Pattern memory item (not to be confused with Pattern = {bad, good}). */
export type PatternItem = z.infer<typeof PatternItemSchema>;
/** Preference memory item. */
export type Preference = z.infer<typeof PreferenceItemSchema>;
/** Record type for reading JSONL files (all types + legacy). */
export type MemoryItemRecord = z.infer<typeof MemoryItemRecordSchema>;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Prefix mapping for memory item types. */
const TYPE_PREFIXES: Record<MemoryItemType, string> = {
  lesson: 'L',
  solution: 'S',
  pattern: 'P',
  preference: 'R',
};

/**
 * Generate deterministic memory item ID from insight text.
 * Format: {prefix} + 16 hex characters from SHA-256 hash (64 bits of entropy).
 *
 * @param insight - The insight text to hash
 * @param type - Memory item type (default: 'lesson' for backward compat)
 * @returns ID string like L1a2b3c4d5e6f7g8h
 */
export function generateId(insight: string, type?: MemoryItemType): string {
  const prefix = TYPE_PREFIXES[type ?? 'lesson'];
  const hash = createHash('sha256').update(insight).digest('hex');
  return `${prefix}${hash.slice(0, 16)}`;
}
