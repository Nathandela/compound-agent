/**
 * Helper functions for management commands.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LESSONS_PATH } from '../../storage/index.js';
import type { Lesson } from '../../types.js';

/**
 * Format lesson for human-readable display.
 */
export function formatLessonHuman(lesson: Lesson): string {
  const lines: string[] = [];

  lines.push(`ID: ${lesson.id}`);
  lines.push(`Type: ${lesson.type}`);
  lines.push(`Trigger: ${lesson.trigger}`);
  lines.push(`Insight: ${lesson.insight}`);

  if (lesson.evidence) {
    lines.push(`Evidence: ${lesson.evidence}`);
  }

  if (lesson.severity) {
    lines.push(`Severity: ${lesson.severity}`);
  }

  lines.push(`Tags: ${lesson.tags.length > 0 ? lesson.tags.join(', ') : '(none)'}`);
  lines.push(`Source: ${lesson.source}`);

  if (lesson.context) {
    lines.push(`Context: ${lesson.context.tool} - ${lesson.context.intent}`);
  }

  lines.push(`Created: ${lesson.created}`);
  lines.push(`Confirmed: ${lesson.confirmed ? 'yes' : 'no'}`);

  if (lesson.supersedes && lesson.supersedes.length > 0) {
    lines.push(`Supersedes: ${lesson.supersedes.join(', ')}`);
  }

  if (lesson.related && lesson.related.length > 0) {
    lines.push(`Related: ${lesson.related.join(', ')}`);
  }

  if (lesson.pattern) {
    lines.push('Pattern:');
    lines.push(`  Bad:  ${lesson.pattern.bad}`);
    lines.push(`  Good: ${lesson.pattern.good}`);
  }

  return lines.join('\n');
}

/**
 * Check if a lesson ID has been deleted (has a tombstone).
 */
export async function wasLessonDeleted(repoRoot: string, id: string): Promise<boolean> {
  const filePath = join(repoRoot, LESSONS_PATH);
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
        if (record.id === id && record.deleted === true) {
          return true;
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // File doesn't exist
  }
  return false;
}
