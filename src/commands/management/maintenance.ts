/**
 * Maintenance commands: compact, rebuild, stats
 *
 * Commands for database health and maintenance.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatBytes, getRepoRoot } from '../../cli-utils.js';
import {
  compact,
  countTombstones,
  DB_PATH,
  getRetrievalStats,
  LESSONS_PATH,
  needsCompaction,
  readLessons,
  rebuildIndex,
  syncIfNeeded,
  TOMBSTONE_THRESHOLD,
} from '../../storage/index.js';

import {
  AGE_FLAG_THRESHOLD_DAYS,
  AVG_DECIMAL_PLACES,
  getLessonAgeDays,
  LESSON_COUNT_WARNING_THRESHOLD,
  out,
} from '../shared.js';

/**
 * Register maintenance commands on the program.
 */
export function registerMaintenanceCommands(program: Command): void {
  /**
   * Compact command - Archive old lessons and remove tombstones.
   *
   * @example npx lna compact
   * @example npx lna compact --force
   * @example npx lna compact --dry-run
   */
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

  /**
   * Rebuild command - Rebuild SQLite index from JSONL.
   *
   * @example npx lna rebuild
   * @example npx lna rebuild --force
   */
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

  /**
   * Stats command - Show database health and statistics.
   *
   * @example npx lna stats
   */
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
      const avgRetrievals = totalLessons > 0 ? (totalRetrievals / totalLessons).toFixed(AVG_DECIMAL_PLACES) : '0.0';

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

      // Calculate age distribution
      let recentCount = 0;  // <30 days
      let mediumCount = 0;  // 30-90 days
      let oldCount = 0;     // >90 days
      for (const lesson of lessons) {
        const ageDays = getLessonAgeDays(lesson);
        if (ageDays < 30) {
          recentCount++;
        } else if (ageDays <= AGE_FLAG_THRESHOLD_DAYS) {
          mediumCount++;
        } else {
          oldCount++;
        }
      }

      // Format output
      const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
      console.log(`Lessons: ${totalLessons} total${deletedInfo}`);

      // Show warning if lesson count exceeds threshold (context pollution prevention)
      if (totalLessons > LESSON_COUNT_WARNING_THRESHOLD) {
        out.warn(`High lesson count may degrade retrieval quality. Consider running \`lna compact\`.`);
      }

      // Show age distribution if lessons exist
      if (totalLessons > 0) {
        console.log(`Age: ${recentCount} <30d, ${mediumCount} 30-90d, ${oldCount} >90d`);
      }

      console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
      console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
    });
}
