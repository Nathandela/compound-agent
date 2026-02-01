/**
 * Rebuild command - Rebuild SQLite index from JSONL
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { rebuildIndex, syncIfNeeded } from '../../storage/index.js';

/**
 * Register the rebuild command with the program.
 */
export function registerRebuildCommand(program: Command): void {
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
}
