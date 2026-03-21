/**
 * Retrieval commands: search, list, check-plan, load-session
 *
 * Commands for searching and retrieving lessons.
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../cli-utils.js';
import { isModelAvailable, loadSessionLessons, retrieveForPlan } from '../index.js';
import { withEmbedding } from '../memory/embeddings/index.js';
import { incrementRetrievalCount, readLessons, readMemoryItems, searchKeyword, searchKeywordScored, syncIfNeeded } from '../memory/storage/index.js';
import type { MemoryItem } from '../memory/index.js';
import { CANDIDATE_MULTIPLIER, MIN_HYBRID_SCORE, mergeHybridResults, rankLessons, searchVector } from '../memory/search/index.js';

import { formatError } from '../cli-error-format.js';
import { readStdin } from '../read-stdin.js';

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
 * Parse numeric limit with user-friendly error output on invalid input.
 * Returns null on failure so callers can set exitCode and return.
 */
function parseLimitOrNull(rawLimit: string, optionName: string, commandName: string): number | null {
  try {
    return parseLimit(rawLimit, optionName);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Invalid ${optionName}`;
    console.error(formatError(commandName, 'INVALID_LIMIT', message, `Use --${optionName} with a positive integer`));
    return null;
  }
}

// ============================================================================
// Check-Plan Command Helpers
// ============================================================================

/**
 * Read plan text from stdin (non-TTY mode).
 * Uses shared readStdin with proper stream cleanup to avoid zombie processes.
 */
async function readPlanFromStdin(): Promise<string | undefined> {
  const { stdin } = await import('node:process');
  if (!stdin.isTTY) {
    try {
      const text = await readStdin();
      return text.trim() || undefined;
    } catch (err) {
      console.error(`Warning: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
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
// Action Handlers
// ============================================================================

async function searchAction(cmd: Command, query: string, options: { limit: string }): Promise<void> {
  const repoRoot = getRepoRoot();
  const limit = parseLimitOrNull(options.limit, 'limit', 'search');
  if (limit === null) {
    process.exitCode = 1;
    return;
  }
  const { verbose, quiet } = getGlobalOpts(cmd);

  await syncIfNeeded(repoRoot);

  const results = await withEmbedding(async () => {
    if (isModelAvailable()) {
      try {
        // Hybrid search: blend vector + keyword
        const candidateLimit = limit * CANDIDATE_MULTIPLIER;
        const [vectorResults, keywordResults] = await Promise.all([
          searchVector(repoRoot, query, { limit: candidateLimit }),
          searchKeywordScored(repoRoot, query, candidateLimit),
        ]);
        const merged = mergeHybridResults(vectorResults, keywordResults, { minScore: MIN_HYBRID_SCORE });
        const ranked = rankLessons(merged);
        return ranked.slice(0, limit).map((r) => r.lesson);
      } catch {
        // Model failed at runtime — fall back to keyword-only search
        return await searchKeyword(repoRoot, query, limit);
      }
    }
    // FTS-only fallback when embedding model unavailable
    return await searchKeyword(repoRoot, query, limit);
  });

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
}

async function listAction(cmd: Command, options: { limit: string; invalidated?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();
  const limit = parseLimitOrNull(options.limit, 'limit', 'list');
  if (limit === null) {
    process.exitCode = 1;
    return;
  }
  const { verbose, quiet } = getGlobalOpts(cmd);

  const { items, skippedCount } = await readMemoryItems(repoRoot);

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
}

async function loadSessionAction(cmd: Command, options: { json?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();
  const { quiet } = getGlobalOpts(cmd);
  const lessons = await loadSessionLessons(repoRoot);

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

  if (totalCount > LESSON_COUNT_WARNING_THRESHOLD) {
    console.log('');
    out.info(`${totalCount} lessons in index. Consider \`ca compact\` to reduce context pollution.`);
  }

  const oldLessons = lessons.filter((l) => getLessonAgeDays(l) > AGE_FLAG_THRESHOLD_DAYS);
  if (oldLessons.length > 0) {
    console.log('');
    out.warn(`${oldLessons.length} lesson(s) are over ${AGE_FLAG_THRESHOLD_DAYS} days old. Review for continued validity.`);
  }
}

async function checkPlanAction(cmd: Command, options: { plan?: string; json?: boolean; limit: string }): Promise<void> {
  const repoRoot = getRepoRoot();
  const limit = parseLimitOrNull(options.limit, 'limit', 'check-plan');
  if (limit === null) {
    process.exitCode = 1;
    return;
  }
  const { quiet } = getGlobalOpts(cmd);

  const planText = options.plan ?? (await readPlanFromStdin());

  if (!planText) {
    console.error(formatError('check-plan', 'NO_PLAN', 'No plan provided', 'Use --plan <text> or pipe text to stdin'));
    process.exitCode = 1;
    return;
  }

  await syncIfNeeded(repoRoot);

  if (!isModelAvailable()) {
    if (options.json) {
      console.log(JSON.stringify({
        lessons: [],
        count: 0,
        error: 'Embedding model not found',
        action: 'Run: npx ca download-model',
      }));
    } else {
      console.error(formatError('check-plan', 'MODEL_UNAVAILABLE', 'Embedding model not found', 'Run: npx ca download-model'));
    }
    process.exitCode = 1;
    return;
  }

  try {
    const result = await withEmbedding(async () => retrieveForPlan(repoRoot, planText, limit));

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (options.json) {
      console.log(JSON.stringify({
        lessons: [],
        count: 0,
        error: message,
      }));
    } else {
      console.error(formatError('check-plan', 'PLAN_CHECK_FAILED', message, 'Check model installation and try again'));
    }
    process.exitCode = 1;
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register retrieval commands (search, list, check-plan, load-session) on the program.
 */
export function registerRetrievalCommands(program: Command): void {
  program
    .command('search <query>')
    .description('Search lessons')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_SEARCH_LIMIT)
    .action(async function (this: Command, query: string, options: { limit: string }) {
      await searchAction(this, query, options);
    });

  program
    .command('list')
    .description('List all lessons')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_LIST_LIMIT)
    .option('--invalidated', 'Show only invalidated lessons')
    .action(async function (this: Command, options: { limit: string; invalidated?: boolean }) {
      await listAction(this, options);
    });

  program
    .command('load-session')
    .description('Load high-severity lessons for session context')
    .option('--json', 'Output as JSON')
    .action(async function (this: Command, options: { json?: boolean }) {
      await loadSessionAction(this, options);
    });

  program
    .command('check-plan')
    .description('Check plan against relevant lessons')
    .option('--plan <text>', 'Plan text to check')
    .option('--json', 'Output as JSON')
    .option('-n, --limit <number>', 'Maximum results', DEFAULT_CHECK_PLAN_LIMIT)
    .action(async function (this: Command, options: { plan?: string; json?: boolean; limit: string }) {
      await checkPlanAction(this, options);
    });
}
