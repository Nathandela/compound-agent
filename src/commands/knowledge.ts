/**
 * CLI command: ca knowledge <query>
 *
 * Search the docs knowledge base using hybrid search.
 */

import type { Command } from 'commander';

import { getRepoRoot, parseLimit } from '../cli-utils.js';
import { formatError } from '../cli-error-format.js';
import { searchKnowledge } from '../memory/knowledge/index.js';
import { openKnowledgeDb, closeKnowledgeDb } from '../memory/storage/sqlite-knowledge/index.js';
import { getGlobalOpts, out } from './shared.js';

const MAX_DISPLAY_TEXT = 200;

export function registerKnowledgeCommand(program: Command): void {
  program
    .command('knowledge <query>')
    .description('Search docs knowledge base')
    .option('-n, --limit <number>', 'Maximum results', '6')
    .action(async function (this: Command, query: string, opts: { limit: string }) {
      const globalOpts = getGlobalOpts(this);
      try {
        let limit: number;
        try {
          limit = parseLimit(opts.limit, 'limit');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid limit';
          console.error(formatError('knowledge', 'INVALID_LIMIT', message, 'Use -n with a positive integer'));
          process.exitCode = 1;
          return;
        }

        const repoRoot = getRepoRoot();

        // Check if DB has chunks; auto-index if empty
        const database = openKnowledgeDb(repoRoot);
        const countResult = database.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
        if (countResult.cnt === 0) {
          try {
            const { indexDocs } = await import('../memory/knowledge/indexing.js');
            out.info('Knowledge base empty. Indexing docs...');
            const result = await indexDocs(repoRoot);
            if (result.filesIndexed === 0) {
              out.info('No docs found to index. Add docs/ directory or run: npx ca index-docs --help');
              return;
            }
          } catch (indexErr) {
            const msg = indexErr instanceof Error ? indexErr.message : 'Unknown error';
            out.info(`Auto-index failed (${msg}). Run manually: npx ca index-docs`);
          }
        }

        const results = await searchKnowledge(repoRoot, query, { limit });

        if (results.length === 0) {
          out.info('No matching results found.');
          return;
        }

        for (const r of results) {
          const { filePath, startLine, endLine, text } = r.item;
          const truncated = text.length > MAX_DISPLAY_TEXT ? text.slice(0, MAX_DISPLAY_TEXT) + '...' : text;
          const displayText = truncated.replace(/\n/g, ' ');

          if (globalOpts.verbose) {
            console.log(`[${filePath}:L${startLine}-L${endLine}] (score: ${r.score.toFixed(2)}) ${displayText}`);
          } else {
            console.log(`[${filePath}:L${startLine}-L${endLine}] ${displayText}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(formatError('knowledge', 'SEARCH_FAILED', message, 'Check that docs are indexed'));
        process.exitCode = 1;
      } finally {
        closeKnowledgeDb();
      }
    });
}
