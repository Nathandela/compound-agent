/**
 * Compound command: synthesize CCT patterns from lessons.
 *
 * Reads all memory items, clusters them by embedding similarity,
 * and writes synthesized cross-cutting patterns to cct-patterns.jsonl.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { clusterBySimilarity, synthesizePattern, writeCctPatterns } from '../compound/index.js';
import { embedText, isModelUsable } from '../memory/embeddings/index.js';
import { readMemoryItems } from '../memory/storage/index.js';

/**
 * Register compound commands on the program.
 */
export function registerCompoundCommands(program: Command): void {
  program
    .command('compound')
    .description('Synthesize cross-cutting patterns from lessons')
    .action(async () => {
      const repoRoot = getRepoRoot();

      // Read all memory items
      const { items } = await readMemoryItems(repoRoot);
      if (items.length === 0) {
        console.log('Synthesized 0 patterns from 0 lessons.');
        return;
      }

      // Check if embedding model is available
      const modelCheck = await isModelUsable();
      if (!modelCheck.usable) {
        console.error(`Error: Embedding model unavailable — ${modelCheck.reason}`);
        console.error('Run: npx ca download-model');
        process.exitCode = 1;
        return;
      }

      // Compute embeddings for all items
      const embeddings: number[][] = [];
      try {
        for (const item of items) {
          const text = `${item.trigger} ${item.insight}`;
          const vec = await embedText(text);
          embeddings.push(Array.isArray(vec) ? vec : Array.from(vec));
        }
      } catch (err) {
        console.error(`Error computing embeddings: ${err instanceof Error ? err.message : String(err)}`);
        console.error('Run: npx ca download-model');
        process.exitCode = 1;
        return;
      }

      // Cluster by similarity
      const { clusters } = clusterBySimilarity(items, embeddings);

      // Filter clusters with 2+ items (single-item clusters are noise)
      const multiClusters = clusters.filter((c) => c.length >= 2);

      // Synthesize patterns from clusters
      const patterns = multiClusters.map((cluster) => {
        const clusterId = cluster.map((item) => item.id).join('-');
        return synthesizePattern(cluster, clusterId);
      });

      // Write patterns to file
      if (patterns.length > 0) {
        await writeCctPatterns(repoRoot, patterns);
      }

      const lessonCount = items.length;
      console.log(`Synthesized ${patterns.length} pattern(s) from ${lessonCount} lessons.`);
    });
}
