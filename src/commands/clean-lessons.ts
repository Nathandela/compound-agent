/**
 * Clean-lessons command: Analyze lessons for semantic duplicates.
 *
 * Uses embedding model to find similar lesson pairs and outputs
 * structured diagnostic for the lessons-reviewer subagent.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { formatError } from '../cli-error-format.js';
import { embedText, isModelAvailable, unloadEmbedding } from '../memory/embeddings/index.js';
import { findSimilarLessons } from '../memory/search/index.js';
import { readMemoryItems, syncIfNeeded } from '../memory/storage/index.js';
import type { MemoryItem } from '../memory/index.js';

interface LessonPair {
  aId: string;
  aInsight: string;
  bId: string;
  bInsight: string;
  score: number;
}

/**
 * Find deduplicated similar lesson pairs using embedding similarity.
 */
async function findDuplicatePairs(repoRoot: string, activeItems: MemoryItem[]): Promise<LessonPair[]> {
  const pairs: LessonPair[] = [];
  const seen = new Set<string>();

  for (const item of activeItems) {
    const similar = await findSimilarLessons(repoRoot, item.insight, {
      excludeId: item.id,
    });

    for (const match of similar) {
      const key = [item.id, match.item.id].sort().join(':');
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({
          aId: item.id,
          aInsight: item.insight,
          bId: match.item.id,
          bInsight: match.item.insight,
          score: match.score,
        });
      }
    }
  }

  return pairs;
}

/**
 * Print structured diagnostic output for flagged pairs.
 */
function printReport(pairs: LessonPair[]): void {
  console.log('# Lessons Review Required');
  console.log('');
  console.log(`Found ${pairs.length} similar lesson pair(s) that may need attention.`);
  console.log('');
  console.log('## Flagged Pairs');
  console.log('');

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    console.log(
      `### Pair ${i + 1}: ${pair.aId} <-> ${pair.bId} (similarity: ${(pair.score * 100).toFixed(0)}%)`,
    );
    console.log(`- **${pair.aId}**: ${pair.aInsight}`);
    console.log(`- **${pair.bId}**: ${pair.bInsight}`);
    console.log('');
  }

  console.log('## Instructions');
  console.log('');
  console.log('Spawn the lessons-reviewer subagent to analyze these pairs:');
  console.log('');
  console.log('  /lessons-reviewer');
  console.log('');
  console.log('The reviewer will classify each pair and propose cleanup actions.');
}

async function cleanLessonsAction(): Promise<void> {
  const repoRoot = getRepoRoot();

  if (!isModelAvailable()) {
    console.error(
      formatError('clean-lessons', 'MODEL_UNAVAILABLE', 'Embedding model not available', 'Run: npx ca download-model'),
    );
    process.exitCode = 1;
    return;
  }

  // Early probe to catch runtime failures
  try {
    await embedText('test');
  } catch (e) {
    console.error(
      formatError(
        'clean-lessons',
        'MODEL_UNUSABLE',
        `Embedding model failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
        'Check model compatibility',
      ),
    );
    process.exitCode = 1;
    unloadEmbedding();
    return;
  }

  try {
    await syncIfNeeded(repoRoot);
    const { items } = await readMemoryItems(repoRoot);
    const activeItems = items.filter((item) => !item.invalidatedAt);
    const pairs = await findDuplicatePairs(repoRoot, activeItems);

    if (pairs.length === 0) {
      console.log('No similar lessons found. Your lesson database is clean.');
      return;
    }

    printReport(pairs);
  } finally {
    unloadEmbedding();
  }
}

export function registerCleanLessonsCommand(program: Command): void {
  program
    .command('clean-lessons')
    .description('Analyze lessons for semantic duplicates and contradictions')
    .action(cleanLessonsAction);
}
