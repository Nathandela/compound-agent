/**
 * CLI command: index-docs
 *
 * Index docs/ directory into the knowledge base for retrieval.
 *
 * Usage: ca index-docs [--force]
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { indexDocs } from '../memory/knowledge/index.js';
import { closeKnowledgeDb } from '../memory/storage/sqlite-knowledge/index.js';
import { out } from './shared.js';

export function registerKnowledgeIndexCommand(program: Command): void {
  program
    .command('index-docs')
    .description('Index docs/ directory into knowledge base')
    .option('--force', 'Re-index all files (ignore cache)')
    .action(async function (this: Command, options: { force?: boolean }) {
      const repoRoot = getRepoRoot();

      out.info('Indexing docs/ directory...');

      try {
        const result = await indexDocs(repoRoot, {
          force: options.force,
        });

        const skippedPart = result.filesSkipped > 0
          ? ` (${result.filesSkipped} skipped)`
          : '';
        const deletedPart = result.chunksDeleted > 0
          ? `, ${result.chunksDeleted} deleted`
          : '';
        const duration = (result.durationMs / 1000).toFixed(1);

        out.info(
          `Indexed ${result.filesIndexed} file${result.filesIndexed !== 1 ? 's' : ''}${skippedPart}, ` +
          `${result.chunksCreated} chunk${result.chunksCreated !== 1 ? 's' : ''} created${deletedPart}`
        );
        out.info(`Duration: ${duration}s`);
      } finally {
        closeKnowledgeDb();
      }
    });
}
