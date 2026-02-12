/**
 * Retrieval commands: search, list, check-plan, load-session
 *
 * Commands for searching and retrieving lessons.
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../cli-utils.js';
import { isModelUsable, loadSessionLessons, retrieveForPlan } from '../index.js';
import { incrementRetrievalCount, readLessons, readMemoryItems, searchKeyword, syncIfNeeded } from '../memory/storage/index.js';
import type { MemoryItem } from '../memory/types.js';

import {
  AGE_FLAG_THRESHOLD_DAYS,
  DEFAULT_CHECK_PLAN_LIMIT,
  DEFAULT_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  getGlobalOpts,
  getLessonAgeDays,
  ISO_DATE_PREFIX_LENGTH,
  LESSON_COUNT_WARNING_THRESHOLD,
  out,
} from './shared.js';

import type { RankedLesson } from '../memory/search/index.js';

/**
 * Parse numeric limit and exit with user-friendly output on invalid input.
 */
function parseLimitOrExit(rawLimit: string, optionName: string): number {
  try {
    return parseLimit(rawLimit, optionName);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Invalid ${optionName}`;
    out.error(message);
    process.exit(1);
  }
}

// ============================================================================
// Check-Plan Command Helpers
// ============================================================================

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
 *
 * Uses rankScore (final boosted score) instead of raw similarity.
 */
function outputCheckPlanJson(lessons: RankedLesson[]): void {
  const jsonOutput = {
    lessons: lessons.map((l) => ({
      id: l.lesson.id,
      insight: l.lesson.insight,
      rankScore: l.finalScore ?? l.score, // Use finalScore if available, fallback to raw score
      source: l.lesson.source,
    })),
    count: lessons.length,
  };
  console.log(JSON.stringify(jsonOutput));
}

/**
 * Output check-plan results in human-readable format.
 *
 * Omits numeric scores - ordering is sufficient for human consumption.
 */
function outputCheckPlanHuman(lessons: RankedLesson[], quiet: boolean): void {
  console.log('## Lessons Check\n');
  console.log('Relevant to your plan:\n');

  lessons.forEach((item, i) => {
    const num = i + 1;
    console.log(`${num}. ${chalk.bold(`[${item.lesson.id}]`)} ${item.lesson.insight}`);
    console.log(`   - Source: ${item.lesson.source}`);
    console.log();
  });

  if (!quiet) {
    console.log('---');
    console.log('Consider these lessons while implementing.');
  }
}

// ============================================================================
// Load-Session Command Helpers
// ============================================================================

/**
 * Format source string for human-readable display.
 * Converts snake_case to space-separated words.
 */
function formatSource(source: string): string {
  return source.replace(/_/g, ' ');
}

/**
 * Output load-session results in human-readable format.
 * Optimized for Claude's context window - no IDs, clear structure.
 */
function outputSessionLessonsHuman(lessons: MemoryItem[], quiet: boolean): void {
  console.log('## Lessons from Past Sessions\n');
  console.log('These lessons were captured from previous corrections and should inform your work:\n');

  lessons.forEach((lesson, i) => {
    const num = i + 1;
    const date = lesson.created.slice(0, ISO_DATE_PREFIX_LENGTH);
    const tagsDisplay = lesson.tags.length > 0 ? ` (${lesson.tags.join(', ')})` : '';

    console.log(`${num}. **${lesson.insight}**${tagsDisplay}`);
    console.log(`   Learned: ${date} via ${formatSource(lesson.source)}`);
    console.log();
  });

  if (!quiet) {
    console.log('Consider these lessons when planning and implementing tasks.');
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register retrieval commands (search, list, check-plan, load-session) on the program.
 */
export function registerRetrievalCommands(program: Command): void {
  /**
   * Search command - Search lessons by keyword.
   *
   * @example npx ca search "Polars"
   * @example npx ca search "authentication" --limit 5
   */
  program
    .command('search <query>')
    .description('Search lessons by keyword')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_SEARCH_LIMIT)
    .action(async function (this: Command, query: string, options: { limit: string }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimitOrExit(options.limit, 'limit');
      const { verbose, quiet } = getGlobalOpts(this);

      // Sync index if JSONL has changed
      await syncIfNeeded(repoRoot);

      const results = await searchKeyword(repoRoot, query, limit);
      if (results.length > 0) {
        incrementRetrievalCount(repoRoot, results.map((lesson) => lesson.id));
      }

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

  /**
   * List command - List all lessons.
   *
   * @example npx ca list
   * @example npx ca list --limit 10
   * @example npx ca list --invalidated
   */
  program
    .command('list')
    .description('List all lessons')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_LIST_LIMIT)
    .option('--invalidated', 'Show only invalidated lessons')
    .action(async function (this: Command, options: { limit: string; invalidated?: boolean }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimitOrExit(options.limit, 'limit');
      const { verbose, quiet } = getGlobalOpts(this);

      const { items, skippedCount } = await readMemoryItems(repoRoot);

      // Filter for invalidated items if flag is set
      const filteredItems = options.invalidated
        ? items.filter((i) => i.invalidatedAt)
        : items;

      if (filteredItems.length === 0) {
        if (options.invalidated) {
          console.log('No invalidated lessons found.');
        } else {
          console.log('No lessons found. Get started with: learn "Your first lesson"');
        }
        if (skippedCount > 0) {
          out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
        }
        return;
      }

      const toShow = filteredItems.slice(0, limit);

      // Show summary unless quiet mode
      if (!quiet) {
        const label = options.invalidated ? 'invalidated lesson(s)' : 'item(s)';
        out.info(`Showing ${toShow.length} of ${filteredItems.length} ${label}:\n`);
      }

      for (const item of toShow) {
        const invalidMarker = item.invalidatedAt ? chalk.red('[INVALID] ') : '';
        console.log(`[${chalk.cyan(item.id)}] ${invalidMarker}${item.insight}`);
        if (verbose) {
          console.log(`  Type: ${item.type} | Source: ${item.source}`);
          console.log(`  Created: ${item.created}`);
          if (item.context) {
            console.log(`  Context: ${item.context.tool} - ${item.context.intent}`);
          }
          if (item.invalidatedAt) {
            console.log(`  Invalidated: ${item.invalidatedAt}`);
            if (item.invalidationReason) {
              console.log(`  Reason: ${item.invalidationReason}`);
            }
          }
        } else {
          console.log(`  Type: ${item.type} | Source: ${item.source}`);
        }
        if (item.tags.length > 0) {
          console.log(`  Tags: ${item.tags.join(', ')}`);
        }
        console.log();
      }

      if (skippedCount > 0) {
        out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
      }
    });

  /**
   * Load-session command - Load high-severity lessons for session startup.
   *
   * Used by Claude Code hooks to inject critical lessons at session start.
   * Returns lessons sorted by severity/recency for immediate context.
   *
   * @example npx ca load-session --json
   */
  program
    .command('load-session')
    .description('Load high-severity lessons for session context')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command, options: { json?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);
      const lessons = await loadSessionLessons(repoRoot);

      // Get total lesson count for context pollution warning
      const { lessons: allLessons } = await readLessons(repoRoot);
      const totalCount = allLessons.length;

      if (options.json) {
        console.log(JSON.stringify({ lessons, count: lessons.length, totalCount }));
        return;
      }

      if (lessons.length === 0) {
        console.log('No high-severity lessons found.');
        return;
      }

      outputSessionLessonsHuman(lessons, quiet);

      // Show count note if total lessons exceed threshold
      if (totalCount > LESSON_COUNT_WARNING_THRESHOLD) {
        console.log('');
        out.info(`${totalCount} lessons in index. Consider \`ca compact\` to reduce context pollution.`);
      }

      // Show age warnings for old lessons
      const oldLessons = lessons.filter((l) => getLessonAgeDays(l) > AGE_FLAG_THRESHOLD_DAYS);
      if (oldLessons.length > 0) {
        console.log('');
        out.warn(`${oldLessons.length} lesson(s) are over ${AGE_FLAG_THRESHOLD_DAYS} days old. Review for continued validity.`);
      }
    });

  /**
   * Check-plan command - Check a plan against relevant lessons.
   *
   * Used by Claude Code hooks during plan mode to retrieve lessons
   * that are semantically relevant to the proposed implementation.
   *
   * @example echo "Add authentication" | npx ca check-plan --json
   * @example npx ca check-plan --plan "Refactor the API"
   */
  program
    .command('check-plan')
    .description('Check plan against relevant lessons')
    .option('--plan <text>', 'Plan text to check')
    .option('--json', 'Output as JSON')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_CHECK_PLAN_LIMIT)
    .action(async function (this: Command, options: { plan?: string; json?: boolean; limit: string }) {
      const repoRoot = getRepoRoot();
      const limit = parseLimitOrExit(options.limit, 'limit');
      const { quiet } = getGlobalOpts(this);

      // Get plan text from --plan flag or stdin
      const planText = options.plan ?? (await readPlanFromStdin());

      if (!planText) {
        out.error('No plan provided. Use --plan <text> or pipe text to stdin.');
        process.exit(1);
      }

      // Check model usability - return stable error response if not usable
      const usability = await isModelUsable();
      if (!usability.usable) {
        if (options.json) {
          // Stable envelope: always include lessons/count, add error/action
          console.log(JSON.stringify({
            lessons: [],
            count: 0,
            error: usability.reason,
            action: usability.action,
          }));
        } else {
          out.error(usability.reason);
          console.log('');
          console.log(usability.action);
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
          // Stable envelope: always include lessons/count, add error
          console.log(JSON.stringify({
            lessons: [],
            count: 0,
            error: message,
          }));
        } else {
          out.error(`Failed to check plan: ${message}`);
        }
        process.exit(1);
      }
    });
}
