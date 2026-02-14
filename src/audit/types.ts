/**
 * Audit module types and Zod schemas.
 */

import { z } from 'zod';

/** Schema for a single audit finding. */
export const AuditFindingSchema = z.object({
  file: z.string(),
  issue: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  relatedLessonId: z.string().optional(),
  suggestedFix: z.string().optional(),
  source: z.enum(['rule', 'pattern', 'lesson']),
});

/** Schema for the audit summary. */
export const AuditSummarySchema = z.object({
  errors: z.number(),
  warnings: z.number(),
  infos: z.number(),
  filesChecked: z.number(),
});

/** Schema for a complete audit report. */
export const AuditReportSchema = z.object({
  findings: z.array(AuditFindingSchema),
  summary: AuditSummarySchema,
  timestamp: z.string(),
});

export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;

/** Options to toggle individual audit checks. */
export interface AuditOptions {
  includeRules?: boolean;
  includePatterns?: boolean;
  includeLessons?: boolean;
}
