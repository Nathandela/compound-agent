/**
 * Learn command - Capture a new lesson manually
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson } from '../../storage/index.js';
import { generateId, SeveritySchema } from '../../types.js';
import type { Lesson, Severity } from '../../types.js';
import { getGlobalOpts, out } from '../shared.js';

/**
 * Register the learn command with the program.
 */
export function registerLearnCommand(program: Command): void {
  program
    .command('learn <insight>')
    .description('Capture a new lesson')
    .option('-t, --trigger <text>', 'What triggered this lesson')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('-s, --severity <level>', 'Lesson severity: high, medium, low')
    .option('-y, --yes', 'Skip confirmation')
    .action(async function (this: Command, insight: string, options: { trigger?: string; tags: string; severity?: string; yes?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      // Validate severity if provided
      let severity: Severity | undefined;
      if (options.severity !== undefined) {
        const result = SeveritySchema.safeParse(options.severity);
        if (!result.success) {
          out.error(`Invalid severity value: "${options.severity}". Valid values are: high, medium, low`);
          process.exit(1);
        }
        severity = result.data;
      }

      // Data coupling invariant: severity !== undefined => type === 'full'
      const lessonType = severity !== undefined ? 'full' : 'quick';

      const lesson: Lesson = {
        id: generateId(insight),
        type: lessonType,
        trigger: options.trigger ?? 'Manual capture',
        insight,
        tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
        source: 'manual',
        context: {
          tool: 'cli',
          intent: 'manual learning',
        },
        created: new Date().toISOString(),
        confirmed: true,  // learn command is explicit confirmation
        supersedes: [],
        related: [],
        ...(severity !== undefined && { severity }),
      };

      await appendLesson(repoRoot, lesson);
      out.success(`Learned: ${insight}`);
      if (!quiet) {
        console.log(`ID: ${chalk.dim(lesson.id)}`);
      }
    });
}
