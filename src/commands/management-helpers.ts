/**
 * Helper functions for management commands.
 */

import type { MemoryItem } from '../memory/index.js';

/**
 * Format a memory item for human-readable display.
 */
export function formatLessonHuman(lesson: MemoryItem): string {
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

