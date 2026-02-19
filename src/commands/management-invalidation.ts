/**
 * Invalidation commands: wrong, validate
 *
 * Commands for managing lesson validity state.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { appendMemoryItem, readMemoryItems } from '../memory/storage/index.js';
import type { MemoryItem } from '../memory/index.js';

import { formatError } from '../cli-error-format.js';

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
      const { items } = await readMemoryItems(repoRoot);

      // Find the lesson
      const lesson = items.find((l) => l.id === id);
      if (!lesson) {
        console.error(formatError('wrong', 'NOT_FOUND', `Lesson not found: ${id}`, 'Use "ca list" to see available lessons'));
        process.exitCode = 1;
        return;
      }

      // Check if already invalidated
      if (lesson.invalidatedAt) {
        out.warn(`Lesson ${id} is already marked as invalid.`);
        return;
      }

      // Create updated lesson with invalidation
      const updatedItem: MemoryItem = {
        ...lesson,
        invalidatedAt: new Date().toISOString(),
        ...(options.reason !== undefined && { invalidationReason: options.reason }),
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendMemoryItem(repoRoot, updatedItem);
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
      const { items } = await readMemoryItems(repoRoot);

      // Find the lesson
      const lesson = items.find((l) => l.id === id);
      if (!lesson) {
        console.error(formatError('validate', 'NOT_FOUND', `Lesson not found: ${id}`, 'Use "ca list" to see available lessons'));
        process.exitCode = 1;
        return;
      }

      // Check if not invalidated
      if (!lesson.invalidatedAt) {
        out.info(`Lesson ${id} is not invalidated.`);
        return;
      }

      // Remove invalidation fields (keep everything else)
      const updatedItem: MemoryItem = {
        ...lesson,
        invalidatedAt: undefined,
        invalidationReason: undefined,
      };

      // Append the updated lesson (JSONL append-only pattern)
      await appendMemoryItem(repoRoot, updatedItem);
      out.success(`Lesson ${id} re-enabled (validated).`);
    });
}
