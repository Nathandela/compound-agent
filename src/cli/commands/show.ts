/**
 * Show command - Show details of a specific lesson
 */

import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getRepoRoot } from '../../cli-utils.js';
import { LESSONS_PATH, readLessons } from '../../storage/index.js';
import type { Lesson } from '../../types.js';
import { JSON_INDENT_SPACES, out } from '../shared.js';

/** JSON indent for show command */
const SHOW_JSON_INDENT = JSON_INDENT_SPACES;

/**
 * Format a lesson for human-readable output.
 */
function formatLessonHuman(lesson: Lesson): string {
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
  lines.push(`Confirmed: ${lesson.confirmed}`);
  if (lesson.supersedes.length > 0) {
    lines.push(`Supersedes: ${lesson.supersedes.join(', ')}`);
  }
  if (lesson.related.length > 0) {
    lines.push(`Related: ${lesson.related.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Register the show command with the program.
 */
export function registerShowCommand(program: Command): void {
  program
    .command('show <id>')
    .description('Show details of a specific lesson')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);
      const lesson = lessons.find((l) => l.id === id);

      if (!lesson) {
        // Check if lesson was deleted (tombstone)
        const filePath = join(repoRoot, LESSONS_PATH);
        let wasDeleted = false;
        try {
          const content = await readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
              if (record.id === id && record.deleted === true) {
                wasDeleted = true;
                break;
              }
            } catch {
              // Skip invalid lines
            }
          }
        } catch {
          // File doesn't exist
        }

        if (options.json) {
          console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found` }));
        } else {
          out.error(wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found`);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(lesson, null, SHOW_JSON_INDENT));
      } else {
        console.log(formatLessonHuman(lesson));
      }
    });
}
