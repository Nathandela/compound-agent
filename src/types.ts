/**
 * Lesson type definitions using Zod schemas
 *
 * Schema hierarchy:
 * - LessonSchema: Full lesson (all fields, backward compatible)
 * - TombstoneSchema: Minimal deletion marker { id, deleted: true, deletedAt }
 * - LessonRecordSchema: Union of Lesson | Tombstone (for reading JSONL)
 *
 * Compatibility policy:
 * - Read path: Accept both legacy (full lesson + deleted:true) and canonical tombstones
 * - Write path: Emit canonical TombstoneSchema only for deletions
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

// Lesson type - semantic marker for lesson quality tier
export const LessonTypeSchema = z.enum(['quick', 'full']);

/**
 * Unified Lesson schema.
 *
 * The `type` field is a semantic marker:
 * - 'quick': Minimal lesson for fast capture
 * - 'full': Important lesson (typically has evidence/severity)
 *
 * All fields except core identity are optional for flexibility.
 * Semantic meaning is preserved through convention, not schema enforcement.
 *
 * Note: The `deleted` field on lessons is DEPRECATED. New deletions should
 * use TombstoneSchema. The field is kept for backward compatibility.
 */
export const LessonSchema = z.object({
  // Core identity (required)
  id: z.string(),
  type: LessonTypeSchema,
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

  // Extended fields (optional - typically present for 'full' type)
  evidence: z.string().optional(),
  severity: SeveritySchema.optional(),
  pattern: PatternSchema.optional(),

  // Lifecycle fields (optional)
  // DEPRECATED: Use TombstoneSchema for deletions. Kept for backward compatibility.
  deleted: z.boolean().optional(),
  retrievalCount: z.number().optional(),

  // Provenance tracking (optional)
  citation: CitationSchema.optional(),

  // Age-based validity fields (optional)
  compactionLevel: CompactionLevelSchema.optional(), // 0=active, 1=flagged, 2=archived
  compactedAt: z.string().optional(),    // ISO8601 when compaction happened
  lastRetrieved: z.string().optional(),  // ISO8601 last retrieval time

  // Invalidation fields (optional - for marking lessons as wrong)
  invalidatedAt: z.string().optional(), // ISO8601
  invalidationReason: z.string().optional(),
});

/**
 * Canonical Tombstone schema for soft deletions.
 *
 * This is the ONLY format that should be written for new deletions.
 * Contains minimal fields: just enough to mark a lesson as deleted.
 */
export const TombstoneSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  deletedAt: z.string(), // ISO8601
});

/**
 * LessonRecord schema - union for reading JSONL files.
 *
 * Accepts either:
 * 1. A full Lesson (including legacy lessons with deleted:true)
 * 2. A canonical Tombstone (minimal: { id, deleted: true, deletedAt })
 *
 * Use this schema when parsing JSONL records to handle both formats.
 */
export const LessonRecordSchema = z.union([LessonSchema, TombstoneSchema]);

/**
 * Type guard to check if a record is a tombstone (canonical or legacy).
 */
export function isTombstone(record: LessonRecord): record is Tombstone {
  return record.deleted === true;
}

/**
 * Type guard to check if a record is a lesson (not deleted).
 */
export function isLesson(record: LessonRecord): record is Lesson {
  return record.deleted !== true;
}

// Type exports
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonType = z.infer<typeof LessonTypeSchema>;
export type Tombstone = z.infer<typeof TombstoneSchema>;
export type LessonRecord = z.infer<typeof LessonRecordSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type CompactionLevel = z.infer<typeof CompactionLevelSchema>;

/**
 * Generate deterministic lesson ID from insight text.
 * Format: L + 8 hex characters from SHA-256 hash
 */
export function generateId(insight: string): string {
  const hash = createHash('sha256').update(insight).digest('hex');
  return `L${hash.slice(0, 8)}`;
}
