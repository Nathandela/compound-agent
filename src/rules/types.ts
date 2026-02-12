/**
 * Zod schemas for rule configuration.
 *
 * Rules are defined in .claude/rules.json and describe mechanical checks
 * that can be run against a codebase.
 */

import { z } from 'zod';

/** Rule severity levels. */
export const SeveritySchema = z.enum(['error', 'warning', 'info']);

/** File-pattern check: regex match on files matching a glob. */
export const FilePatternCheckSchema = z.object({
  type: z.literal('file-pattern'),
  glob: z.string(),
  pattern: z.string(),
  mustMatch: z.boolean().optional(),
});

/** File-size check: line count limit on files matching a glob. */
export const FileSizeCheckSchema = z.object({
  type: z.literal('file-size'),
  glob: z.string(),
  maxLines: z.number().int().positive(),
});

/** Script check: run a shell command and check exit code. */
export const ScriptCheckSchema = z.object({
  type: z.literal('script'),
  command: z.string(),
  expectExitCode: z.number().int().optional(),
});

/** Discriminated union of all check types. */
export const RuleCheckSchema = z.discriminatedUnion('type', [
  FilePatternCheckSchema,
  FileSizeCheckSchema,
  ScriptCheckSchema,
]);

/** A single rule definition. */
export const RuleSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  severity: SeveritySchema,
  check: RuleCheckSchema,
  remediation: z.string(),
});

/** Top-level rule configuration file schema. */
export const RuleConfigSchema = z.object({
  rules: z.array(RuleSchema),
});

// Type exports
export type Severity = z.infer<typeof SeveritySchema>;
export type FilePatternCheck = z.infer<typeof FilePatternCheckSchema>;
export type FileSizeCheck = z.infer<typeof FileSizeCheckSchema>;
export type ScriptCheck = z.infer<typeof ScriptCheckSchema>;
export type RuleCheck = z.infer<typeof RuleCheckSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RuleConfig = z.infer<typeof RuleConfigSchema>;
