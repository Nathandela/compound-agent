/**
 * Maintenance commands: compact, rebuild, stats
 *
 * Commands for database health and maintenance.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatBytes, getRepoRoot } from '../cli-utils.js';
import {
  compact,
  countTombstones,
  DB_PATH,
  getRetrievalStats,
  LESSONS_PATH,
  needsCompaction,
  readMemoryItems,
  rebuildIndex,
  syncIfNeeded,
  TOMBSTONE_THRESHOLD,
} from '../memory/storage/index.js';

import {
  AGE_FLAG_THRESHOLD_DAYS,
  AVG_DECIMAL_PLACES,
  getLessonAgeDays,
  LESSON_COUNT_WARNING_THRESHOLD,
  out,
} from './shared.js';

// ============================================================================
// Action Handlers
// ============================================================================

async function compactAction(options: { force?: boolean; dryRun?: boolean }): Promise<void> {
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
  if (result.droppedInvalid > 0) {
    console.log(`  Invalid records dropped: ${result.droppedInvalid}`);
  }

  await rebuildIndex(repoRoot);
  console.log('  Index rebuilt.');
}

async function rebuildAction(options: { force?: boolean }): Promise<void> {
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
}

async function statsAction(): Promise<void> {
  const repoRoot = getRepoRoot();

  await syncIfNeeded(repoRoot);

  const { items } = await readMemoryItems(repoRoot);
  const deletedCount = await countTombstones(repoRoot);
  const totalLessons = items.length;

  const retrievalStats = getRetrievalStats(repoRoot);
  const totalRetrievals = retrievalStats.reduce((sum, s) => sum + s.count, 0);
  const avgRetrievals = totalLessons > 0 ? (totalRetrievals / totalLessons).toFixed(AVG_DECIMAL_PLACES) : '0.0';

  const jsonlPath = join(repoRoot, LESSONS_PATH);
  const dbPath = join(repoRoot, DB_PATH);

  let dataSize = 0;
  let indexSize = 0;

  try { dataSize = statSync(jsonlPath).size; } catch { /* File doesn't exist */ }
  try { indexSize = statSync(dbPath).size; } catch { /* File doesn't exist */ }

  const totalSize = dataSize + indexSize;

  let recentCount = 0;
  let mediumCount = 0;
  let oldCount = 0;
  for (const item of items) {
    const ageDays = getLessonAgeDays(item);
    if (ageDays < 30) {
      recentCount++;
    } else if (ageDays <= AGE_FLAG_THRESHOLD_DAYS) {
      mediumCount++;
    } else {
      oldCount++;
    }
  }

  const typeCounts: Record<string, number> = {};
  for (const item of items) {
    typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
  }

  const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
  console.log(`Lessons: ${totalLessons} total${deletedInfo}`);

  if (Object.keys(typeCounts).length > 1 || (Object.keys(typeCounts).length === 1 && !typeCounts['lesson'])) {
    const breakdown = Object.entries(typeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    console.log(`Types: ${breakdown}`);
  }

  if (totalLessons > LESSON_COUNT_WARNING_THRESHOLD) {
    out.warn(`High lesson count may degrade retrieval quality. Consider running \`ca compact\`.`);
  }

  if (totalLessons > 0) {
    console.log(`Age: ${recentCount} <30d, ${mediumCount} 30-90d, ${oldCount} >90d`);
  }

  console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
  console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register maintenance commands on the program.
 */
export function registerMaintenanceCommands(program: Command): void {
  program
    .command('compact')
    .description('Compact lessons: archive old lessons and remove tombstones')
    .option('-f, --force', 'Run compaction even if below threshold')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (options: { force?: boolean; dryRun?: boolean }) => {
      await compactAction(options);
    });

  program
    .command('rebuild')
    .description('Rebuild SQLite index from JSONL')
    .option('-f, --force', 'Force rebuild even if unchanged')
    .action(async (options: { force?: boolean }) => {
      await rebuildAction(options);
    });

  program
    .command('stats')
    .description('Show database health and statistics')
    .action(async () => {
      await statsAction();
    });
}
