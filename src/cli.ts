#!/usr/bin/env node
/**
 * Learning Agent CLI
 *
 * Commands:
 *   learn <insight>  - Capture a new lesson
 *   search <query>   - Search lessons by keyword
 *   list             - List all lessons
 */

import { Command } from 'commander';
import { VERSION } from './index.js';
import { appendLesson, readLessons } from './storage/jsonl.js';
import { rebuildIndex, searchKeyword } from './storage/sqlite.js';
import { generateId } from './types.js';
import { ensureModel, getModelPath } from './embeddings/download.js';
import type { QuickLesson } from './types.js';

const program = new Command();

/**
 * Get repository root from env or current directory.
 */
function getRepoRoot(): string {
  return process.env['LEARNING_AGENT_ROOT'] ?? process.cwd();
}

program
  .name('learning-agent')
  .description('Repository-scoped learning system for Claude Code')
  .version(VERSION);

program
  .command('learn <insight>')
  .description('Capture a new lesson')
  .option('-t, --trigger <text>', 'What triggered this lesson')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (insight: string, options: { trigger?: string; tags: string; yes?: boolean }) => {
    const repoRoot = getRepoRoot();

    const lesson: QuickLesson = {
      id: generateId(insight),
      type: 'quick',
      trigger: options.trigger ?? 'Manual capture',
      insight,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
      source: 'manual',
      context: {
        tool: 'cli',
        intent: 'manual learning',
      },
      created: new Date().toISOString(),
      confirmed: options.yes ?? false,
      supersedes: [],
      related: [],
    };

    await appendLesson(repoRoot, lesson);
    console.log(`Learned: ${insight}`);
    console.log(`ID: ${lesson.id}`);
  });

program
  .command('search <query>')
  .description('Search lessons by keyword')
  .option('-n, --limit <number>', 'Maximum results', '10')
  .action(async (query: string, options: { limit: string }) => {
    const repoRoot = getRepoRoot();
    const limit = parseInt(options.limit, 10);

    // Rebuild index before searching
    await rebuildIndex(repoRoot);

    const results = await searchKeyword(repoRoot, query, limit);

    if (results.length === 0) {
      console.log('No lessons found.');
      return;
    }

    console.log(`Found ${results.length} lesson(s):\n`);
    for (const lesson of results) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
      console.log(`  Trigger: ${lesson.trigger}`);
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }
  });

program
  .command('list')
  .description('List all lessons')
  .option('-n, --limit <number>', 'Maximum results', '20')
  .action(async (options: { limit: string }) => {
    const repoRoot = getRepoRoot();
    const limit = parseInt(options.limit, 10);

    const { lessons } = await readLessons(repoRoot);

    if (lessons.length === 0) {
      console.log('No lessons found.');
      return;
    }

    const toShow = lessons.slice(0, limit);
    console.log(`Showing ${toShow.length} of ${lessons.length} lesson(s):\n`);

    for (const lesson of toShow) {
      console.log(`[${lesson.id}] ${lesson.insight}`);
      console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }
  });

program
  .command('rebuild')
  .description('Rebuild SQLite index from JSONL')
  .action(async () => {
    const repoRoot = getRepoRoot();
    console.log('Rebuilding index...');
    await rebuildIndex(repoRoot);
    console.log('Index rebuilt.');
  });

program
  .command('download-model')
  .description('Download the embedding model (~500MB)')
  .action(async () => {
    console.log(`Model path: ${getModelPath()}`);
    await ensureModel();
    console.log('Model ready.');
  });

program.parse();
