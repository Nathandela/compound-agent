/**
 * CLI command: index-docs
 *
 * Index docs/ directory into the knowledge base for retrieval.
 *
 * Usage: ca index-docs [--force] [--embed]
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { indexDocs } from '../memory/knowledge/index.js';
import { withEmbedding } from '../memory/embeddings/index.js';
import { closeKnowledgeDb } from '../memory/storage/sqlite-knowledge/index.js';
import { out } from './shared.js';

export function registerKnowledgeIndexCommand(program: Command): void {
  program
    .command('index-docs')
    .description('Index docs/ directory into knowledge base')
    .option('--force', 'Re-index all files (ignore cache)')
    .option('--embed', 'Embed chunks for semantic search')
    .action(async function (this: Command, options: { force?: boolean; embed?: boolean }) {
      const repoRoot = getRepoRoot();

      out.info('Indexing docs/ directory...');

      try {
        const result = options.embed
          ? await withEmbedding(async () => indexDocs(repoRoot, { force: options.force, embed: true }))
          : await indexDocs(repoRoot, { force: options.force, embed: false });

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
        if (result.chunksEmbedded > 0) {
          out.info(`${result.chunksEmbedded} chunk${result.chunksEmbedded !== 1 ? 's' : ''} embedded`);
        }
        if (result.filesErrored > 0) {
          out.warn(`${result.filesErrored} file(s) had errors during indexing`);
        }
        out.info(`Duration: ${duration}s`);
      } finally {
        closeKnowledgeDb();
      }
    });

  // Internal worker command for background embedding (spawned by init/setup)
  program
    .command('embed-worker <repoRoot>', { hidden: true })
    .description('Internal: background embedding worker')
    .action(async (repoRoot: string) => {
      const { existsSync, statSync } = await import('node:fs');
      if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
        out.error(`Invalid repoRoot: "${repoRoot}" is not a directory`);
        process.exitCode = 1;
        return;
      }
      const { runBackgroundEmbed } = await import('../memory/knowledge/embed-background.js');
      await runBackgroundEmbed(repoRoot);
    });
}
