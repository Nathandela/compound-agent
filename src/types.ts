/**
 * Lesson type definitions using Zod schemas
 *
 * Deletion model:
 * - Set `deleted: true` and `deletedAt` on a Lesson to mark it deleted
 * - LegacyTombstoneSchema (private) handles backward-compat reads of old
 *   minimal tombstone records { id, deleted: true, deletedAt }
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
 * Deletion: set `deleted: true` and `deletedAt` to an ISO8601 timestamp.
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
  deleted: z.boolean().optional(),
  deletedAt: z.string().optional(),
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
 * Legacy tombstone format for backward-compatible reads.
 * Old JSONL files may contain minimal { id, deleted, deletedAt } records.
 * Private -- not part of the public API.
 */
const LegacyTombstoneSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  deletedAt: z.string(), // ISO8601
});

/**
 * LessonRecord schema - union for reading JSONL files.
 *
 * Accepts either:
 * 1. A full Lesson (with optional deleted/deletedAt fields)
 * 2. A legacy tombstone (minimal: { id, deleted: true, deletedAt })
 *
 * Use this schema when parsing JSONL records to handle both formats.
 */
export const LessonRecordSchema = z.union([LessonSchema, LegacyTombstoneSchema]);

// Type exports
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonType = z.infer<typeof LessonTypeSchema>;
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
