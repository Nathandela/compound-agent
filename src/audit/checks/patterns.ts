/**
 * Patterns audit check.
 *
 * Searches source files for known bad patterns from memory items.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMemoryItems } from '../../memory/storage/index.js';
import { findFiles } from '../../rules/checks/glob-utils.js';
import type { AuditFinding } from '../types.js';

/**
 * Check for bad patterns in source files.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of audit findings where bad patterns were found
 */
export async function checkPatterns(repoRoot: string): Promise<AuditFinding[]> {
  const { items } = await readMemoryItems(repoRoot);
  const findings: AuditFinding[] = [];

  // Filter items that have pattern.bad defined
  const patterned = items.filter((item) => item.pattern?.bad);
  if (patterned.length === 0) {
    return [];
  }

  // Find source files to scan
  const sourceFiles = findFiles(repoRoot, '**/*.ts');

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

  return findings;
}
