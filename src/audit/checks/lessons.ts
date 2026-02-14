/**
 * Lessons audit check.
 *
 * Surfaces high-severity lessons as info-level findings.
 */

import { readMemoryItems } from '../../memory/storage/index.js';
import type { AuditFinding } from '../types.js';

/**
 * Check for high-severity lessons and return as info findings.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of info-level findings for high-severity lessons
 */
export async function checkLessons(repoRoot: string): Promise<AuditFinding[]> {
  const { items } = await readMemoryItems(repoRoot);
  const findings: AuditFinding[] = [];

  for (const item of items) {
    if (item.severity === 'high') {
      findings.push({
        file: '',
        issue: `High-severity lesson: ${item.insight}`,
        severity: 'info',
        relatedLessonId: item.id,
        source: 'lesson',
      });
    }
  }

  return findings;
}
