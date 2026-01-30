/**
 * Lesson type definitions using Zod schemas
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// Source of lesson capture
const SourceSchema = z.enum([
  'user_correction',
  'self_correction',
  'test_failure',
  'manual',
]);

// Context about when lesson was learned
const ContextSchema = z.object({
  tool: z.string(),
  intent: z.string(),
});

// Code pattern (bad -> good)
const PatternSchema = z.object({
  bad: z.string(),
  good: z.string(),
});

// Severity levels for full lessons
const SeveritySchema = z.enum(['high', 'medium', 'low']);

// Base fields shared by all lessons
const BaseLessonSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  insight: z.string(),
  tags: z.array(z.string()),
  source: SourceSchema,
  context: ContextSchema,
  created: z.string(), // ISO8601
  confirmed: z.boolean(),
  supersedes: z.array(z.string()),
  related: z.array(z.string()),
  deleted: z.boolean().optional(),
  retrievalCount: z.number().optional(),
});

// Quick lesson - minimal structure for fast capture
export const QuickLessonSchema = BaseLessonSchema.extend({
  type: z.literal('quick'),
});

// Full lesson - complete structure for important lessons
export const FullLessonSchema = BaseLessonSchema.extend({
  type: z.literal('full'),
  evidence: z.string(),
  severity: SeveritySchema,
  pattern: PatternSchema.optional(),
});

// Discriminated union of lesson types
export const LessonSchema = z.discriminatedUnion('type', [
  QuickLessonSchema,
  FullLessonSchema,
]);

// Tombstone for deletions (append-only delete marker)
export const TombstoneSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  deletedAt: z.string(), // ISO8601
});

// Type exports
export type QuickLesson = z.infer<typeof QuickLessonSchema>;
export type FullLesson = z.infer<typeof FullLessonSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Tombstone = z.infer<typeof TombstoneSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

/**
 * Generate deterministic lesson ID from insight text.
 * Format: L + 8 hex characters from SHA-256 hash
 */
export function generateId(insight: string): string {
  const hash = createHash('sha256').update(insight).digest('hex');
  return `L${hash.slice(0, 8)}`;
}
