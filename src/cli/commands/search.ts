/**
 * Search command - Search lessons by keyword
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../../cli-utils.js';
import { searchKeyword, syncIfNeeded } from '../../storage/index.js';
import { DEFAULT_SEARCH_LIMIT, getGlobalOpts, out } from '../shared.js';

/**
 * Register the search command with the program.
 */
export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search lessons by keyword')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_SEARCH_LIMIT)
    .action(async function (this: Command, query: string, options: { limit: string }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimit(options.limit, 'limit');
      const { verbose, quiet } = getGlobalOpts(this);

      // Sync index if JSONL has changed
      await syncIfNeeded(repoRoot);

      const results = await searchKeyword(repoRoot, query, limit);

      if (results.length === 0) {
        console.log('No lessons match your search. Try a different query or use "list" to see all lessons.');
        return;
      }

      if (!quiet) {
        out.info(`Found ${results.length} lesson(s):\n`);
      }
      for (const lesson of results) {
        console.log(`[${chalk.cyan(lesson.id)}] ${lesson.insight}`);
        console.log(`  Trigger: ${lesson.trigger}`);
        if (verbose && lesson.context) {
          console.log(`  Context: ${lesson.context.tool} - ${lesson.context.intent}`);
          console.log(`  Created: ${lesson.created}`);
        }
        if (lesson.tags.length > 0) {
          console.log(`  Tags: ${lesson.tags.join(', ')}`);
        }
        console.log();
      }
    });
}
