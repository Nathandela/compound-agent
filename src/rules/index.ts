/**
 * Rule engine public API.
 *
 * Provides config loading, rule execution, and output formatting
 * for repository-defined rules in .claude/rules.json.
 */

export { formatViolation, loadRuleConfig, runRules } from './engine.js';
export type { RuleResult, Violation } from './engine.js';
export { RuleCheckSchema, RuleConfigSchema, RuleSchema, SeveritySchema } from './types.js';
export type { Rule, RuleCheck, RuleConfig, Severity } from './types.js';
