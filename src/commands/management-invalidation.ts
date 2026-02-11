/**
 * Invalidation commands: wrong, validate
 *
 * Commands for managing lesson validity state.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { appendLesson, readLessons } from '../storage/index.js';
import type { Lesson } from '../types.js';

import { out } from './shared.js';

/**
 * Register invalidation commands on the program.
 */
export function registerInvalidationCommands(program: Command): void {
  /**
   * Wrong command - Mark a lesson as invalid/wrong.
   *
   * Appends an invalidatedAt timestamp and optional reason to the lesson.
   * Invalidated lessons are excluded from retrieval but remain in storage.
   *
   * @example npx ca wrong L12345678
   * @example npx ca wrong L12345678 --reason "This advice was incorrect"
   */
  program
    .command('wrong <id>')
    .description('Mark a lesson as invalid/wrong')
    .option('-r, --reason <text>', 'Reason for invalidation')
    .action(async function (this: Command, id: string, options: { reason?: string }) {
      const repoRoot = getRepoRoot();

      // Read all lessons
      const { lessons } = await readLessons(repoRoot);

      // Find the lesson
      const lesson = lessons.find((l) => l.id === id);
      if (!lesson) {
        out.error(`Lesson not found: ${id}`);
        process.exit(1);
      }

      // Check if already invalidated
      if (lesson.invalidatedAt) {
        out.warn(`Lesson ${id} is already marked as invalid.`);
        return;
      }

      // Create updated lesson with invalidation
      const updatedLesson: Lesson = {
        ...lesson,
        invalidatedAt: new Date().toISOString(),
        ...(options.reason !== undefined && { invalidationReason: options.reason }),
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendLesson(repoRoot, updatedLesson);
      out.success(`Lesson ${id} marked as invalid.`);
      if (options.reason) {
        console.log(`  Reason: ${options.reason}`);
      }
    });

  /**
   * Validate command - Remove invalidation from a lesson.
   *
   * Re-enables a previously invalidated lesson for retrieval.
   *
   * @example npx ca validate L12345678
   */
  program
    .command('validate <id>')
    .description('Re-enable a previously invalidated lesson')
    .action(async function (this: Command, id: string) {
      const repoRoot = getRepoRoot();

      // Read all lessons
      const { lessons } = await readLessons(repoRoot);

      // Find the lesson
      const lesson = lessons.find((l) => l.id === id);
      if (!lesson) {
        out.error(`Lesson not found: ${id}`);
        process.exit(1);
      }

      // Check if not invalidated
      if (!lesson.invalidatedAt) {
        out.info(`Lesson ${id} is not invalidated.`);
        return;
      }

      // Create lesson without invalidation fields
      const updatedLesson: Lesson = {
        id: lesson.id,
        type: lesson.type,
        trigger: lesson.trigger,
        insight: lesson.insight,
        tags: lesson.tags,
        source: lesson.source,
        context: lesson.context,
        created: lesson.created,
        confirmed: lesson.confirmed,
        supersedes: lesson.supersedes,
        related: lesson.related,
        // Include optional fields if present (excluding invalidation)
        ...(lesson.evidence !== undefined && { evidence: lesson.evidence }),
        ...(lesson.severity !== undefined && { severity: lesson.severity }),
        ...(lesson.pattern !== undefined && { pattern: lesson.pattern }),
        ...(lesson.deleted !== undefined && { deleted: lesson.deleted }),
        ...(lesson.retrievalCount !== undefined && { retrievalCount: lesson.retrievalCount }),
        ...(lesson.citation !== undefined && { citation: lesson.citation }),
        ...(lesson.compactionLevel !== undefined && { compactionLevel: lesson.compactionLevel }),
        ...(lesson.compactedAt !== undefined && { compactedAt: lesson.compactedAt }),
        ...(lesson.lastRetrieved !== undefined && { lastRetrieved: lesson.lastRetrieved }),
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendLesson(repoRoot, updatedLesson);
      out.success(`Lesson ${id} re-enabled (validated).`);
    });
}
