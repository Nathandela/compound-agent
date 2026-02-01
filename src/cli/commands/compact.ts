/**
 * Compact command - Archive old lessons and remove tombstones
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { compact, countTombstones, needsCompaction, rebuildIndex, TOMBSTONE_THRESHOLD } from '../../storage/index.js';

/**
 * Register the compact command with the program.
 */
export function registerCompactCommand(program: Command): void {
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
}
