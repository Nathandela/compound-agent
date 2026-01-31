/**
 * Lesson type definitions using Zod schemas
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

// Severity levels for lessons
export const SeveritySchema = z.enum(['high', 'medium', 'low']);

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
  retrievalCount: z.number().optional(),
});

/**
 * @deprecated Use LessonSchema instead. Kept for backward compatibility.
 * Quick lessons are now just Lesson with type: 'quick'.
 */
export const QuickLessonSchema = LessonSchema.refine(
  (l) => l.type === 'quick',
  { message: "QuickLesson must have type 'quick'" }
);

/**
 * @deprecated Use LessonSchema instead. Kept for backward compatibility.
 * Full lessons are now just Lesson with type: 'full'.
 */
export const FullLessonSchema = LessonSchema.refine(
  (l) => l.type === 'full',
  { message: "FullLesson must have type 'full'" }
);

// Tombstone for deletions (append-only delete marker)
export const TombstoneSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  deletedAt: z.string(), // ISO8601
});

// Type exports
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonType = z.infer<typeof LessonTypeSchema>;
export type Tombstone = z.infer<typeof TombstoneSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

/**
 * @deprecated Use Lesson instead. Kept for backward compatibility.
 */
export type QuickLesson = Lesson & { type: 'quick' };

/**
 * @deprecated Use Lesson instead. Kept for backward compatibility.
 */
export type FullLesson = Lesson & { type: 'full' };

/**
 * Generate deterministic lesson ID from insight text.
 * Format: L + 8 hex characters from SHA-256 hash
 */
export function generateId(insight: string): string {
  const hash = createHash('sha256').update(insight).digest('hex');
  return `L${hash.slice(0, 8)}`;
}
