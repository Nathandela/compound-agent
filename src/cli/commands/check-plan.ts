/**
 * Check-plan command - Check a plan against relevant lessons
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../../cli-utils.js';
import { isModelAvailable, retrieveForPlan } from '../../index.js';
import type { Lesson } from '../../types.js';
import { DEFAULT_CHECK_PLAN_LIMIT, getGlobalOpts, out, RELEVANCE_DECIMAL_PLACES } from '../shared.js';

/**
 * Read plan text from stdin (non-TTY mode).
 */
async function readPlanFromStdin(): Promise<string | undefined> {
  const { stdin } = await import('node:process');
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
  }
  return undefined;
}

/**
 * Output check-plan results in JSON format.
 */
function outputCheckPlanJson(lessons: Array<{ lesson: Lesson; score: number }>): void {
  const jsonOutput = {
    lessons: lessons.map((l) => ({
      id: l.lesson.id,
      insight: l.lesson.insight,
      relevance: l.score,
      source: l.lesson.source,
    })),
    count: lessons.length,
  };
  console.log(JSON.stringify(jsonOutput));
}

/**
 * Output check-plan results in human-readable format.
 */
function outputCheckPlanHuman(lessons: Array<{ lesson: Lesson; score: number }>, quiet: boolean): void {
  console.log('## Lessons Check\n');
  console.log('Relevant to your plan:\n');

  lessons.forEach((item, i) => {
    const num = i + 1;
    console.log(`${num}. ${chalk.bold(`[${item.lesson.id}]`)} ${item.lesson.insight}`);
    console.log(`   - Relevance: ${item.score.toFixed(RELEVANCE_DECIMAL_PLACES)}`);
    console.log(`   - Source: ${item.lesson.source}`);
    console.log();
  });

  if (!quiet) {
    console.log('---');
    console.log('Consider these lessons while implementing.');
  }
}

/**
 * Register the check-plan command with the program.
 */
export function registerCheckPlanCommand(program: Command): void {
  program
    .command('check-plan')
    .description('Check plan against relevant lessons')
    .option('--plan <text>', 'Plan text to check')
    .option('--json', 'Output as JSON')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_CHECK_PLAN_LIMIT)
    .action(async function (this: Command, options: { plan?: string; json?: boolean; limit: string }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimit(options.limit, 'limit');
      const { quiet } = getGlobalOpts(this);

      // Get plan text from --plan flag or stdin
      const planText = options.plan ?? (await readPlanFromStdin());

      if (!planText) {
        out.error('No plan provided. Use --plan <text> or pipe text to stdin.');
        process.exit(1);
      }

      // Check model availability - hard fail if not available
      if (!isModelAvailable()) {
        if (options.json) {
          console.log(JSON.stringify({
            error: 'Embedding model not available',
            action: 'Run: npx lna download-model',
          }));
        } else {
          out.error('Embedding model not available');
          console.log('');
          console.log('Run: npx lna download-model');
        }
        process.exit(1);
      }

      try {
        const result = await retrieveForPlan(repoRoot, planText, limit);

        if (options.json) {
          outputCheckPlanJson(result.lessons);
          return;
        }

        if (result.lessons.length === 0) {
          console.log('No relevant lessons found for this plan.');
          return;
        }

        outputCheckPlanHuman(result.lessons, quiet);
      } catch (err) {
        // Don't mask errors - surface them clearly
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (options.json) {
          console.log(JSON.stringify({ error: message }));
        } else {
          out.error(`Failed to check plan: ${message}`);
        }
        process.exit(1);
      }
    });
}
