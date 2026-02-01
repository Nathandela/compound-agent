/**
 * Export command - Export lessons as JSON to stdout
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { readLessons } from '../../storage/index.js';
import { JSON_INDENT_SPACES } from '../shared.js';

/**
 * Register the export command with the program.
 */
export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export lessons as JSON to stdout')
    .option('--since <date>', 'Only include lessons created after this date (ISO8601)')
    .option('--tags <tags>', 'Filter by tags (comma-separated, OR logic)')
    .action(async (options: { since?: string; tags?: string }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);

      let filtered = lessons;

      // Filter by date if --since provided
      if (options.since) {
        const sinceDate = new Date(options.since);
        if (Number.isNaN(sinceDate.getTime())) {
          console.error(`Invalid date format: ${options.since}. Use ISO8601 format (e.g., 2024-01-15).`);
          process.exit(1);
        }
        filtered = filtered.filter((lesson) => new Date(lesson.created) >= sinceDate);
      }

      // Filter by tags if --tags provided (OR logic)
      if (options.tags) {
        const filterTags = options.tags.split(',').map((t) => t.trim());
        filtered = filtered.filter((lesson) => lesson.tags.some((tag) => filterTags.includes(tag)));
      }

      // Output JSON to stdout (portable format for sharing)
      console.log(JSON.stringify(filtered, null, JSON_INDENT_SPACES));
    });
}
