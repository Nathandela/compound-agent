/**
 * Update command - Update a lesson's mutable fields
 */

import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson, LESSONS_PATH, readLessons, syncIfNeeded } from '../../storage/index.js';
import { LessonSchema, SeveritySchema } from '../../types.js';
import type { Lesson, Severity } from '../../types.js';
import { JSON_INDENT_SPACES, out } from '../shared.js';

/** JSON indent for update command output */
const SHOW_JSON_INDENT = JSON_INDENT_SPACES;

/**
 * Register the update command with the program.
 */
export function registerUpdateCommand(program: Command): void {
  program
    .command('update <id>')
    .description('Update a lesson')
    .option('--insight <text>', 'Update insight')
    .option('--trigger <text>', 'Update trigger')
    .option('--evidence <text>', 'Update evidence')
    .option('--severity <level>', 'Update severity (low/medium/high)')
    .option('--tags <tags>', 'Update tags (comma-separated)')
    .option('--confirmed <bool>', 'Update confirmed status (true/false)')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: {
      insight?: string;
      trigger?: string;
      evidence?: string;
      severity?: string;
      tags?: string;
      confirmed?: string;
      json?: boolean;
    }) => {
      const repoRoot = getRepoRoot();

      // Check if any update options provided
      const hasUpdates = options.insight !== undefined
        || options.trigger !== undefined
        || options.evidence !== undefined
        || options.severity !== undefined
        || options.tags !== undefined
        || options.confirmed !== undefined;

      if (!hasUpdates) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'No fields to update (specify at least one: --insight, --tags, --severity, ...)' }));
        } else {
          out.error('No fields to update (specify at least one: --insight, --tags, --severity, ...)');
        }
        process.exit(1);
      }

      // Read current lessons
      const { lessons } = await readLessons(repoRoot);
      const lesson = lessons.find((l) => l.id === id);

      if (!lesson) {
        // Check if deleted
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
          console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found` }));
        } else {
          out.error(wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found`);
        }
        process.exit(1);
      }

      // Validate severity if provided
      if (options.severity !== undefined) {
        const result = SeveritySchema.safeParse(options.severity);
        if (!result.success) {
          if (options.json) {
            console.log(JSON.stringify({ error: `Invalid severity '${options.severity}' (must be: high, medium, low)` }));
          } else {
            out.error(`Invalid severity '${options.severity}' (must be: high, medium, low)`);
          }
          process.exit(1);
        }
      }

      // Build updated lesson
      const updatedLesson: Lesson = {
        ...lesson,
        ...(options.insight !== undefined && { insight: options.insight }),
        ...(options.trigger !== undefined && { trigger: options.trigger }),
        ...(options.evidence !== undefined && { evidence: options.evidence }),
        ...(options.severity !== undefined && { severity: options.severity as Severity }),
        ...(options.tags !== undefined && {
          tags: [...new Set(
            options.tags
              .split(',')
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          )],
        }),
        ...(options.confirmed !== undefined && { confirmed: options.confirmed === 'true' }),
      };

      // Validate updated lesson against schema
      const validationResult = LessonSchema.safeParse(updatedLesson);
      if (!validationResult.success) {
        if (options.json) {
          console.log(JSON.stringify({ error: `Schema validation failed: ${validationResult.error.message}` }));
        } else {
          out.error(`Schema validation failed: ${validationResult.error.message}`);
        }
        process.exit(1);
      }

      // Append updated lesson (last-write-wins)
      await appendLesson(repoRoot, updatedLesson);
      await syncIfNeeded(repoRoot);

      if (options.json) {
        console.log(JSON.stringify(updatedLesson, null, SHOW_JSON_INDENT));
      } else {
        out.success(`Updated lesson ${id}`);
      }
    });
}
