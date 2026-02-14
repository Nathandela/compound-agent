/**
 * Audit engine: orchestrates checks and builds report.
 */

import { checkLessons } from './checks/lessons.js';
import { checkPatterns } from './checks/patterns.js';
import { checkRules } from './checks/rules.js';
import type { AuditFinding, AuditOptions, AuditReport } from './types.js';

/**
 * Run audit checks and build a report.
 *
 * @param repoRoot - Repository root directory
 * @param options - Toggle individual checks (all enabled by default)
 * @returns Complete audit report with findings and summary
 */
export async function runAudit(
  repoRoot: string,
  options: AuditOptions = {}
): Promise<AuditReport> {
  const { includeRules = true, includePatterns = true, includeLessons = true } = options;

  const findings: AuditFinding[] = [];

  if (includeRules) {
    findings.push(...checkRules(repoRoot));
  }

  if (includePatterns) {
    findings.push(...(await checkPatterns(repoRoot)));
  }

  if (includeLessons) {
    findings.push(...(await checkLessons(repoRoot)));
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;

  return {
    findings,
    summary: { errors, warnings, infos, filesChecked: 0 },
    timestamp: new Date().toISOString(),
  };
}
