/**
 * CRUD commands: show, update, delete
 *
 * Commands for reading, updating, and deleting lessons.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson, readLessons, syncIfNeeded } from '../../storage/index.js';
import { LessonSchema, SeveritySchema } from '../../types.js';
import type { Lesson, Severity } from '../../types.js';

import { out } from '../shared.js';
import { formatLessonHuman, wasLessonDeleted } from './helpers.js';

/** JSON indentation for show output */
const SHOW_JSON_INDENT = 2;

/**
 * Register CRUD commands on the program.
 */
export function registerCrudCommands(program: Command): void {
  /**
   * Show command - Display details of a specific lesson.
   *
   * @example npx lna show L12345678
   * @example npx lna show L12345678 --json
   */
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
        const wasDeleted = await wasLessonDeleted(repoRoot, id);

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

  /**
   * Update command - Update a lesson's mutable fields.
   *
   * @example npx lna update L12345678 --insight "New insight"
   * @example npx lna update L12345678 --severity high --tags "api,auth"
   */
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
        const wasDeleted = await wasLessonDeleted(repoRoot, id);

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

  /**
   * Delete command - Soft delete lessons.
   *
   * Appends the full lesson with `deleted: true` and `deletedAt`.
   *
   * @example npx lna delete L12345678
   * @example npx lna delete L001 L002 L003
   */
  program
    .command('delete <ids...>')
    .description('Soft delete lessons (creates tombstone)')
    .option('--json', 'Output as JSON')
    .action(async (ids: string[], options: { json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);
      const lessonMap = new Map(lessons.map((l) => [l.id, l]));

      const deleted: string[] = [];
      const warnings: Array<{ id: string; message: string }> = [];

      for (const id of ids) {
        const lesson = lessonMap.get(id);

        if (!lesson) {
          // Check if already deleted or never existed
          const wasDeleted = await wasLessonDeleted(repoRoot, id);
          warnings.push({ id, message: wasDeleted ? 'already deleted' : 'not found' });
          continue;
        }

        // Mark lesson as deleted (full record with deleted flag)
        const deletedLesson: Lesson = {
          ...lesson,
          deleted: true,
          deletedAt: new Date().toISOString(),
        };

        await appendLesson(repoRoot, deletedLesson);

        deleted.push(id);
      }

      // Sync once at end
      if (deleted.length > 0) {
        await syncIfNeeded(repoRoot);
      }

      if (options.json) {
        console.log(JSON.stringify({ deleted, warnings }));
      } else {
        if (deleted.length > 0) {
          out.success(`Deleted ${deleted.length} lesson(s): ${deleted.join(', ')}`);
        }
        for (const warning of warnings) {
          out.warn(`${warning.id}: ${warning.message}`);
        }
        if (deleted.length === 0 && warnings.length > 0) {
          process.exit(1);
        }
      }
    });
}
