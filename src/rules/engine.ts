/**
 * Rule engine: loads config, runs checks, formats output.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RuleConfigSchema } from './types.js';
import type { Rule, RuleConfig } from './types.js';

import { runFilePatternCheck } from './checks/file-pattern.js';
import { runFileSizeCheck } from './checks/file-size.js';
import { runScriptCheck } from './checks/script.js';

/** A single violation found by a rule check. */
export interface Violation {
  file?: string;
  line?: number;
  message: string;
}

/** Result of running a single rule. */
export interface RuleResult {
  rule: Rule;
  violations: Violation[];
  passed: boolean;
}

/** Severity label mapping for output formatting. */
const SEVERITY_LABELS: Record<string, string> = {
  error: 'ERROR',
  warning: 'WARN',
  info: 'INFO',
};

/**
 * Load rule configuration from .claude/rules.json.
 *
 * @param baseDir - Repository root directory
 * @returns Parsed rule configuration (empty rules if no config file)
 * @throws On invalid JSON or schema validation failure
 */
export function loadRuleConfig(baseDir: string): RuleConfig {
  const configPath = join(baseDir, '.claude', 'rules.json');
  if (!existsSync(configPath)) {
    return { rules: [] };
  }

  const raw = readFileSync(configPath, 'utf-8');
  const json: unknown = JSON.parse(raw);
  return RuleConfigSchema.parse(json);
}

/**
 * Run all rules against the codebase.
 *
 * @param baseDir - Repository root directory
 * @param rules - Array of rules to check
 * @returns Array of results, one per rule
 */
export function runRules(baseDir: string, rules: Rule[]): RuleResult[] {
  return rules.map((rule) => {
    try {
      const violations = runCheck(baseDir, rule);
      return { rule, violations, passed: violations.length === 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rule check failed';
      return { rule, violations: [{ message: `Rule check error: ${message}` }], passed: false };
    }
  });
}

/**
 * Format a single violation as an agent-legible line.
 *
 * Format: SEVERITY [rules] rule-id: file:line -- remediation
 *
 * @param rule - The rule that was violated
 * @param violation - The specific violation
 * @returns Formatted single-line string
 */
export function formatViolation(rule: Rule, violation: Violation): string {
  const label = SEVERITY_LABELS[rule.severity] ?? 'INFO';
  const location = violation.file
    ? violation.line
      ? `${violation.file}:${violation.line}`
      : violation.file
    : '';
  const locationPart = location ? ` ${location} --` : '';
  return `${label} [rules] ${rule.id}:${locationPart} ${rule.remediation}`;
}

/** Dispatch a rule check to the appropriate handler. */
function runCheck(baseDir: string, rule: Rule): Violation[] {
  switch (rule.check.type) {
    case 'file-pattern':
      return runFilePatternCheck(baseDir, rule.check);
    case 'file-size':
      return runFileSizeCheck(baseDir, rule.check);
    case 'script':
      return runScriptCheck(rule.check, baseDir);
  }
}
