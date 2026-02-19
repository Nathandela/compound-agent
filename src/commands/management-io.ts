/**
 * I/O commands: export, import
 *
 * Commands for importing and exporting lessons.
 */

import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { appendMemoryItem, readMemoryItems } from '../memory/storage/index.js';
import { MemoryItemSchema } from '../memory/index.js';
import type { MemoryItem } from '../memory/index.js';

import { formatError } from '../cli-error-format.js';

import { JSON_INDENT_SPACES } from './shared.js';

// ============================================================================
// Action Handlers
// ============================================================================

async function exportAction(options: { since?: string; tags?: string }): Promise<void> {
  const repoRoot = getRepoRoot();

  const { items } = await readMemoryItems(repoRoot);

  let filtered = items;

  if (options.since) {
    const sinceDate = new Date(options.since);
    if (Number.isNaN(sinceDate.getTime())) {
      console.error(formatError('export', 'INVALID_DATE', `Invalid date format: ${options.since}`, 'Use ISO8601 format (e.g., 2024-01-15)'));
      process.exitCode = 1;
      return;
    }
    filtered = filtered.filter((item) => new Date(item.created) >= sinceDate);
  }

  if (options.tags) {
    const filterTags = options.tags.split(',').map((t) => t.trim());
    filtered = filtered.filter((item) => item.tags.some((tag) => filterTags.includes(tag)));
  }

  console.log(JSON.stringify(filtered, null, JSON_INDENT_SPACES));
}

async function importAction(file: string): Promise<void> {
  const repoRoot = getRepoRoot();

  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      console.error(formatError('import', 'FILE_NOT_FOUND', `File not found: ${file}`, 'Check the path and try again'));
    } else {
      console.error(formatError('import', 'READ_ERROR', `Error reading file: ${(err as Error).message}`, 'Check file permissions'));
    }
    process.exitCode = 1;
    return;
  }

  const { items: existingItems } = await readMemoryItems(repoRoot);
  const existingIds = new Set(existingItems.map((item) => item.id));

  const lines = content.split('\n');
  let imported = 0;
  let skipped = 0;
  let invalid = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      invalid++;
      continue;
    }

    const result = MemoryItemSchema.safeParse(parsed);
    if (!result.success) {
      invalid++;
      continue;
    }

    const item: MemoryItem = result.data;

    if (existingIds.has(item.id)) {
      skipped++;
      continue;
    }

    await appendMemoryItem(repoRoot, item);
    existingIds.add(item.id);
    imported++;
  }

  const lessonWord = imported === 1 ? 'lesson' : 'lessons';
  const parts: string[] = [];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (invalid > 0) parts.push(`${invalid} invalid`);

  if (parts.length > 0) {
    console.log(`Imported ${imported} ${lessonWord} (${parts.join(', ')})`);
  } else {
    console.log(`Imported ${imported} ${lessonWord}`);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register I/O commands on the program.
 */
export function registerIOCommands(program: Command): void {
  program
    .command('export')
    .description('Export lessons as JSON to stdout')
    .option('--since <date>', 'Only include lessons created after this date (ISO8601)')
    .option('--tags <tags>', 'Filter by tags (comma-separated, OR logic)')
    .action(async (options: { since?: string; tags?: string }) => {
      await exportAction(options);
    });

  program
    .command('import <file>')
    .description('Import lessons from a JSONL file')
    .action(async (file: string) => {
      await importAction(file);
    });
}
