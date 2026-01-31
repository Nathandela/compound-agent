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

import chalk from 'chalk';
import { Command } from 'commander';

import { statSync } from 'node:fs';
import { join } from 'node:path';

import { detectAndPropose, parseInputFile } from './capture/integration.js';
import { VERSION } from './index.js';
import { compact, countTombstones, needsCompaction, TOMBSTONE_THRESHOLD } from './storage/compact.js';
import { appendLesson, LESSONS_PATH, readLessons } from './storage/jsonl.js';
import { DB_PATH, getRetrievalStats, rebuildIndex, searchKeyword, syncIfNeeded } from './storage/sqlite.js';
import { generateId, LessonSchema } from './types.js';
import type { Lesson } from './types.js';

// ============================================================================
// Output Formatting Helpers
// ============================================================================

/** Output helper functions for consistent formatting */
const out = {
  success: (msg: string): void => console.log(chalk.green('[ok]'), msg),
  error: (msg: string): void => console.error(chalk.red('[error]'), msg),
  info: (msg: string): void => console.log(chalk.blue('[info]'), msg),
  warn: (msg: string): void => console.log(chalk.yellow('[warn]'), msg),
};

/** Global options interface */
interface GlobalOpts {
  verbose: boolean;
  quiet: boolean;
}

/**
 * Get global options from command.
 */
function getGlobalOpts(cmd: Command): GlobalOpts {
  const opts = cmd.optsWithGlobals() as { verbose?: boolean; quiet?: boolean };
  return {
    verbose: opts.verbose ?? false,
    quiet: opts.quiet ?? false,
  };
}

/** Default limit for search results */
const DEFAULT_SEARCH_LIMIT = '10';

/** Default limit for list results */
const DEFAULT_LIST_LIMIT = '20';

const program = new Command();

// Add global options
program
  .option('-v, --verbose', 'Show detailed output')
  .option('-q, --quiet', 'Suppress non-essential output');

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
  .action(async function (this: Command, insight: string, options: { trigger?: string; tags: string; yes?: boolean }) {
    const repoRoot = getRepoRoot();
    const { quiet } = getGlobalOpts(this);

    const lesson: Lesson = {
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
    out.success(`Learned: ${insight}`);
    if (!quiet) {
      console.log(`ID: ${chalk.dim(lesson.id)}`);
    }
  });

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
        const lesson: Lesson = {
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

program
  .command('import <file>')
  .description('Import lessons from a JSONL file')
  .action(async (file: string) => {
    const repoRoot = getRepoRoot();

    // Read input file
    let content: string;
    try {
      const { readFile } = await import('node:fs/promises');
      content = await readFile(file, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        console.error(`Error: File not found: ${file}`);
      } else {
        console.error(`Error reading file: ${(err as Error).message}`);
      }
      process.exit(1);
    }

    // Get existing lesson IDs
    const { lessons: existingLessons } = await readLessons(repoRoot);
    const existingIds = new Set(existingLessons.map((l) => l.id));

    // Parse and validate each line
    const lines = content.split('\n');
    let imported = 0;
    let skipped = 0;
    let invalid = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        invalid++;
        continue;
      }

      // Validate schema
      const result = LessonSchema.safeParse(parsed);
      if (!result.success) {
        invalid++;
        continue;
      }

      const lesson: Lesson = result.data;

      // Skip if ID already exists
      if (existingIds.has(lesson.id)) {
        skipped++;
        continue;
      }

      // Append lesson
      await appendLesson(repoRoot, lesson);
      existingIds.add(lesson.id);
      imported++;
    }

    // Format summary
    const lessonWord = imported === 1 ? 'lesson' : 'lessons';
    const parts: string[] = [];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (invalid > 0) parts.push(`${invalid} invalid`);

    if (parts.length > 0) {
      console.log(`Imported ${imported} ${lessonWord} (${parts.join(', ')})`);
    } else {
      console.log(`Imported ${imported} ${lessonWord}`);
    }
  });

program
  .command('stats')
  .description('Show database health and statistics')
  .action(async () => {
    const repoRoot = getRepoRoot();

    // Sync index to ensure accurate stats
    await syncIfNeeded(repoRoot);

    // Read lessons from JSONL to get accurate counts
    const { lessons } = await readLessons(repoRoot);
    const deletedCount = await countTombstones(repoRoot);
    const totalLessons = lessons.length;

    // Get retrieval stats from SQLite
    const retrievalStats = getRetrievalStats(repoRoot);
    const totalRetrievals = retrievalStats.reduce((sum, s) => sum + s.count, 0);
    const avgRetrievals = totalLessons > 0 ? (totalRetrievals / totalLessons).toFixed(1) : '0.0';

    // Get storage sizes
    const jsonlPath = join(repoRoot, LESSONS_PATH);
    const dbPath = join(repoRoot, DB_PATH);

    let dataSize = 0;
    let indexSize = 0;

    try {
      dataSize = statSync(jsonlPath).size;
    } catch {
      // File doesn't exist
    }

    try {
      indexSize = statSync(dbPath).size;
    } catch {
      // File doesn't exist
    }

    const totalSize = dataSize + indexSize;

    // Format output
    const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
    console.log(`Lessons: ${totalLessons} total${deletedInfo}`);
    console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
    console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
  });

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

program.parse();
