/**
 * Patterns audit check.
 *
 * Searches source files for known bad patterns from memory items.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMemoryItems } from '../../memory/storage/index.js';
import { findFiles } from '../../rules/checks/glob-utils.js';
import type { AuditCheckResult } from '../types.js';

/**
 * Check for bad patterns in source files.
 *
 * @param repoRoot - Repository root directory
 * @returns Audit check result with findings and filesChecked
 */
export async function checkPatterns(repoRoot: string): Promise<AuditCheckResult> {
  const { items } = await readMemoryItems(repoRoot);

  // Filter items that have pattern.bad defined
  const patterned = items.filter((item) => item.pattern?.bad);
  if (patterned.length === 0) {
    return { findings: [], filesChecked: [] };
  }

  // Find source files to scan
  const sourceFiles = findFiles(repoRoot, '**/*.ts');
  const findings: AuditCheckResult['findings'] = [];

  for (const item of patterned) {
    const bad = item.pattern!.bad;
    for (const relPath of sourceFiles) {
      const content = readFileSync(join(repoRoot, relPath), 'utf-8');
      if (content.includes(bad)) {
        findings.push({
          file: relPath,
          issue: `Bad pattern found: "${bad}" (${item.insight})`,
          severity: 'warning',
          relatedLessonId: item.id,
          suggestedFix: item.pattern!.good ? `Use: ${item.pattern!.good}` : undefined,
          source: 'pattern',
        });
      }
    }
  }

  return { findings, filesChecked: sourceFiles };
}
