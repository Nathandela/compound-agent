/**
 * Stats command - Show database health and statistics
 */

import type { Command } from 'commander';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import { formatBytes, getRepoRoot } from '../../cli-utils.js';
import { countTombstones, DB_PATH, getRetrievalStats, LESSONS_PATH, readLessons, syncIfNeeded } from '../../storage/index.js';
import { AVG_DECIMAL_PLACES } from '../shared.js';

/**
 * Register the stats command with the program.
 */
export function registerStatsCommand(program: Command): void {
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

      // Format output
      const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
      console.log(`Lessons: ${totalLessons} total${deletedInfo}`);
      console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
      console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
    });
}
