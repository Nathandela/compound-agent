#!/usr/bin/env node
/**
 * Learning Agent CLI
 *
 * Commands:
 *   learn <insight>  - Capture a new lesson
 *   search <query>   - Search lessons by keyword
 *   list             - List all lessons
 *   detect --input   - Detect learning triggers from input
 *   compact          - Archive old lessons and remove tombstones
 */

import { Command } from 'commander';

import { detectAndPropose, parseInputFile } from './capture/integration.js';
import { VERSION } from './index.js';
import { compact, countTombstones, needsCompaction, TOMBSTONE_THRESHOLD } from './storage/compact.js';
import { appendLesson, readLessons } from './storage/jsonl.js';
import { rebuildIndex, searchKeyword, syncIfNeeded } from './storage/sqlite.js';
import { generateId } from './types.js';
import type { QuickLesson } from './types.js';

/** Default limit for search results */
const DEFAULT_SEARCH_LIMIT = '10';

/** Default limit for list results */
const DEFAULT_LIST_LIMIT = '20';

const program = new Command();

/**
 * Get repository root from environment variable or current directory.
 *
 * @returns Repository root path for lesson storage
 */
function getRepoRoot(): string {
  return process.env['LEARNING_AGENT_ROOT'] ?? process.cwd();
}

/**
 * Parse limit option and validate it's a positive integer.
 *
 * @param value - String value from command option
 * @param name - Option name for error message
 * @returns Parsed integer
 * @throws Error if value is not a valid positive integer
 */
function parseLimit(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: must be a positive integer`);
  }
  return parsed;
}

program
  .name('learning-agent')
  .description('Repository-scoped learning system for Claude Code')
  .version(VERSION);

program
  .command('learn <insight>')
  .description('Capture a new lesson')
  .option('-t, --trigger <text>', 'What triggered this lesson')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (insight: string, options: { trigger?: string; tags: string; yes?: boolean }) => {
    const repoRoot = getRepoRoot();

    const lesson: QuickLesson = {
      id: generateId(insight),
      type: 'quick',
      trigger: options.trigger ?? 'Manual capture',
      insight,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
      source: 'manual',
      context: {
        tool: 'cli',
        intent: 'manual learning',
      },
      created: new Date().toISOString(),
      confirmed: options.yes ?? false,
      supersedes: [],
      related: [],
    };

    await appendLesson(repoRoot, lesson);
    console.log(`Learned: ${insight}`);
    console.log(`ID: ${lesson.id}`);
  });

program
  .command('search <query>')
  .description('Search lessons by keyword')
  .option('-n, --limit <number>', 'Maximum results', DEFAULT_SEARCH_LIMIT)
  .action(async (query: string, options: { limit: string }) => {
    const repoRoot = getRepoRoot();
    const limit = parseLimit(options.limit, 'limit');

    // Sync index if JSONL has changed
    await syncIfNeeded(repoRoot);

    const results = await searchKeyword(repoRoot, query, limit);

    if (results.length === 0) {
      console.log('No lessons found.');
      return;
    }

    console.log(`Found ${results.length} lesson(s):\n`);
    for (const lesson of results) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
      console.log(`  Trigger: ${lesson.trigger}`);
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }
  });

program
  .command('list')
  .description('List all lessons')
  .option('-n, --limit <number>', 'Maximum results', DEFAULT_LIST_LIMIT)
  .action(async (options: { limit: string }) => {
    const repoRoot = getRepoRoot();
    const limit = parseLimit(options.limit, 'limit');

    const { lessons, skippedCount } = await readLessons(repoRoot);

    if (lessons.length === 0) {
      console.log('No lessons found.');
      if (skippedCount > 0) {
        console.error(`Warning: ${skippedCount} corrupted lesson(s) skipped.`);
      }
      return;
    }

    const toShow = lessons.slice(0, limit);
    console.log(`Showing ${toShow.length} of ${lessons.length} lesson(s):\n`);

    for (const lesson of toShow) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
      console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }

    if (skippedCount > 0) {
      console.error(`Warning: ${skippedCount} corrupted lesson(s) skipped.`);
    }
  });

program
  .command('rebuild')
  .description('Rebuild SQLite index from JSONL')
  .option('-f, --force', 'Force rebuild even if unchanged')
  .action(async (options: { force?: boolean }) => {
    const repoRoot = getRepoRoot();
    if (options.force) {
      console.log('Forcing index rebuild...');
      await rebuildIndex(repoRoot);
      console.log('Index rebuilt.');
    } else {
      const rebuilt = await syncIfNeeded(repoRoot);
      if (rebuilt) {
        console.log('Index rebuilt (JSONL changed).');
      } else {
        console.log('Index is up to date.');
      }
    }
  });

program
  .command('detect')
  .description('Detect learning triggers from input')
  .requiredOption('--input <file>', 'Path to JSON input file')
  .option('--save', 'Automatically save proposed lesson')
  .option('--json', 'Output result as JSON')
  .action(
    async (options: { input: string; save?: boolean; json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const input = await parseInputFile(options.input);
      const result = await detectAndPropose(repoRoot, input);

      if (!result) {
        if (options.json) {
          console.log(JSON.stringify({ detected: false }));
        } else {
          console.log('No learning trigger detected.');
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({ detected: true, ...result }));
        return;
      }

      console.log('Learning trigger detected!');
      console.log(`  Trigger: ${result.trigger}`);
      console.log(`  Source: ${result.source}`);
      console.log(`  Proposed: ${result.proposedInsight}`);

      if (options.save) {
        const lesson: QuickLesson = {
          id: generateId(result.proposedInsight),
          type: 'quick',
          trigger: result.trigger,
          insight: result.proposedInsight,
          tags: [],
          source: result.source,
          context: { tool: 'detect', intent: 'auto-capture' },
          created: new Date().toISOString(),
          confirmed: false,
          supersedes: [],
          related: [],
        };

        await appendLesson(repoRoot, lesson);
        console.log(`\nSaved as lesson: ${lesson.id}`);
      }
    }
  );

program
  .command('compact')
  .description('Compact lessons: archive old lessons and remove tombstones')
  .option('-f, --force', 'Run compaction even if below threshold')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options: { force?: boolean; dryRun?: boolean }) => {
    const repoRoot = getRepoRoot();

    const tombstones = await countTombstones(repoRoot);
    const needs = await needsCompaction(repoRoot);

    if (options.dryRun) {
      console.log('Dry run - no changes will be made.\n');
      console.log(`Tombstones found: ${tombstones}`);
      console.log(`Compaction needed: ${needs ? 'yes' : 'no'}`);
      return;
    }

    if (!needs && !options.force) {
      console.log(`Compaction not needed (${tombstones} tombstones, threshold is ${TOMBSTONE_THRESHOLD}).`);
      console.log('Use --force to compact anyway.');
      return;
    }

    console.log('Running compaction...');
    const result = await compact(repoRoot);

    console.log('\nCompaction complete:');
    console.log(`  Archived: ${result.archived} lesson(s)`);
    console.log(`  Tombstones removed: ${result.tombstonesRemoved}`);
    console.log(`  Lessons remaining: ${result.lessonsRemaining}`);

    // Rebuild SQLite index after compaction
    await rebuildIndex(repoRoot);
    console.log('  Index rebuilt.');
  });

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
    console.log(JSON.stringify(filtered, null, 2));
  });

program.parse();
