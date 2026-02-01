/**
 * List command - List all lessons
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../../cli-utils.js';
import { readLessons } from '../../storage/index.js';
import { DEFAULT_LIST_LIMIT, getGlobalOpts, out } from '../shared.js';

/**
 * Register the list command with the program.
 */
export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all lessons')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_LIST_LIMIT)
    .action(async function (this: Command, options: { limit: string }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimit(options.limit, 'limit');
      const { verbose, quiet } = getGlobalOpts(this);

      const { lessons, skippedCount } = await readLessons(repoRoot);

      if (lessons.length === 0) {
        console.log('No lessons found. Get started with: learn "Your first lesson"');
        if (skippedCount > 0) {
          out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
        }
        return;
      }

      const toShow = lessons.slice(0, limit);

      // Show summary unless quiet mode
      if (!quiet) {
        out.info(`Showing ${toShow.length} of ${lessons.length} lesson(s):\n`);
      }

      for (const lesson of toShow) {
        console.log(`[${chalk.cyan(lesson.id)}] ${lesson.insight}`);
        if (verbose) {
          console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
          console.log(`  Created: ${lesson.created}`);
          if (lesson.context) {
            console.log(`  Context: ${lesson.context.tool} - ${lesson.context.intent}`);
          }
        } else {
          console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
        }
        if (lesson.tags.length > 0) {
          console.log(`  Tags: ${lesson.tags.join(', ')}`);
        }
        console.log();
      }

      if (skippedCount > 0) {
        out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
      }
    });
}
