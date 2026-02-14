/**
 * Lessons audit check.
 *
 * Surfaces high-severity lessons as info-level findings.
 */

import { LESSONS_PATH, readMemoryItems } from '../../memory/storage/index.js';
import type { AuditCheckResult } from '../types.js';

/**
 * Check for high-severity lessons and return as info findings.
 *
 * @param repoRoot - Repository root directory
 * @returns Audit check result with findings and filesChecked
 */
export async function checkLessons(repoRoot: string): Promise<AuditCheckResult> {
  const { items } = await readMemoryItems(repoRoot);
  const findings: AuditCheckResult['findings'] = [];

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

  const filesChecked = items.length > 0 ? [LESSONS_PATH] : [];
  return { findings, filesChecked };
}
