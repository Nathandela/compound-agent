/**
 * Load-session command - Load high-severity lessons for session startup
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { loadSessionLessons } from '../../index.js';
import type { Lesson } from '../../types.js';
import { getGlobalOpts, ISO_DATE_PREFIX_LENGTH } from '../shared.js';

/**
 * Output session lessons in human-readable format.
 */
/**
 * Format source for display (convert underscores to spaces).
 */
function formatSource(source: string): string {
  return source.replace(/_/g, ' ');
}

/**
 * Output session lessons in human-readable format.
 */
function outputSessionLessonsHuman(lessons: Lesson[], quiet: boolean): void {
  console.log('## Lessons from Past Sessions\n');

  if (!quiet) {
    console.log('These lessons were captured from previous corrections and should inform your work:\n');
  }

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]!;
    const tags = lesson.tags.length > 0 ? ` (${lesson.tags.join(', ')})` : '';
    console.log(`${i + 1}. **${lesson.insight}**${tags}`);
    console.log(`   Learned: ${lesson.created.slice(0, ISO_DATE_PREFIX_LENGTH)} via ${formatSource(lesson.source)}`);
    console.log();
  }

  if (!quiet) {
    console.log('Consider these lessons when planning and implementing tasks.');
  }
}

/**
 * Register the load-session command with the program.
 */
export function registerLoadSessionCommand(program: Command): void {
  program
    .command('load-session')
    .description('Load high-severity lessons for session context')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command, options: { json?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);
      const lessons = await loadSessionLessons(repoRoot);

      if (options.json) {
        console.log(JSON.stringify({ lessons, count: lessons.length }));
        return;
      }

      if (lessons.length === 0) {
        console.log('No high-severity lessons found.');
        return;
      }

      outputSessionLessonsHuman(lessons, quiet);
    });
}
