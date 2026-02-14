/**
 * Rules audit check.
 *
 * Wraps loadRuleConfig + runRules and converts violations to AuditFinding format.
 */

import { loadRuleConfig, runRules } from '../../rules/index.js';
import type { AuditFinding } from '../types.js';

/**
 * Check rules and return findings.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of audit findings from rule violations
 */
export function checkRules(repoRoot: string): AuditFinding[] {
  let config;
  try {
    config = loadRuleConfig(repoRoot);
  } catch {
    return [];
  }

  if (config.rules.length === 0) {
    return [];
  }

  const results = runRules(repoRoot, config.rules);
  const findings: AuditFinding[] = [];

  for (const result of results) {
    for (const violation of result.violations) {
      findings.push({
        file: violation.file ?? '',
        issue: violation.message,
        severity: result.rule.severity,
        suggestedFix: result.rule.remediation,
        source: 'rule',
      });
    }
  }

  return findings;
}
