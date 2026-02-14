/**
 * Rules audit check.
 *
 * Wraps loadRuleConfig + runRules and converts violations to AuditFinding format.
 */

import { loadRuleConfig, runRules } from '../../rules/index.js';
import type { AuditCheckResult } from '../types.js';

/**
 * Check rules and return findings with files checked.
 *
 * @param repoRoot - Repository root directory
 * @returns Audit check result with findings and filesChecked
 */
export function checkRules(repoRoot: string): AuditCheckResult {
  let config;
  try {
    config = loadRuleConfig(repoRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load rules config';
    return {
      findings: [{
        file: '.claude/rules.json',
        issue: `Invalid rules configuration: ${message}`,
        severity: 'error',
        source: 'rule',
      }],
      filesChecked: [],
    };
  }

  if (config.rules.length === 0) {
    return { findings: [], filesChecked: [] };
  }

  const results = runRules(repoRoot, config.rules);
  const findings: AuditCheckResult['findings'] = [];
  const filesCheckedSet = new Set<string>();

  for (const result of results) {
    for (const violation of result.violations) {
      if (violation.file) {
        filesCheckedSet.add(violation.file);
      }
      findings.push({
        file: violation.file ?? '',
        issue: violation.message,
        severity: result.rule.severity,
        suggestedFix: result.rule.remediation,
        source: 'rule',
      });
    }
  }

  return { findings, filesChecked: [...filesCheckedSet] };
}
