/**
 * CRUD commands: show, update, delete
 *
 * Commands for reading, updating, and deleting lessons.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { appendMemoryItem, readMemoryItems, syncIfNeeded } from '../memory/storage/index.js';
import { MemoryItemSchema, SeveritySchema } from '../memory/index.js';
import type { MemoryItem, Severity } from '../memory/index.js';

import { formatError } from '../cli-error-format.js';

import { out } from './shared.js';
import { formatLessonHuman, wasLessonDeleted } from './management-helpers.js';

/** JSON indentation for show output */
const SHOW_JSON_INDENT = 2;

// ============================================================================
// Action Handlers
// ============================================================================

async function showAction(id: string, options: { json?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();

  const { items } = await readMemoryItems(repoRoot);
  const item = items.find((i) => i.id === id);

  if (!item) {
    const wasDeleted = await wasLessonDeleted(repoRoot, id);

    if (options.json) {
      console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found` }));
    } else {
      const msg = wasDeleted ? `Lesson ${id} not found (deleted)` : `Lesson ${id} not found`;
      console.error(formatError('show', 'NOT_FOUND', msg, 'Use "ca list" to see available lessons'));
    }
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(item, null, SHOW_JSON_INDENT));
  } else {
    console.log(formatLessonHuman(item));
  }
}

interface UpdateOptions {
  insight?: string;
  trigger?: string;
  evidence?: string;
  severity?: string;
  tags?: string;
  confirmed?: string;
  json?: boolean;
}

function buildUpdatedItem(item: MemoryItem, options: UpdateOptions): MemoryItem {
  return {
    ...item,
    ...(options.insight !== undefined && { insight: options.insight }),
    ...(options.trigger !== undefined && { trigger: options.trigger }),
    ...(options.evidence !== undefined && { evidence: options.evidence }),
    ...(options.severity !== undefined && { severity: options.severity as Severity }),
    ...(options.tags !== undefined && {
      tags: [...new Set(
        options.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      )],
    }),
    ...(options.confirmed !== undefined && { confirmed: options.confirmed === 'true' }),
  };
}

async function updateAction(id: string, options: UpdateOptions): Promise<void> {
  const repoRoot = getRepoRoot();

  const hasUpdates = options.insight !== undefined
    || options.trigger !== undefined
    || options.evidence !== undefined
    || options.severity !== undefined
    || options.tags !== undefined
    || options.confirmed !== undefined;

  if (!hasUpdates) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No fields to update (specify at least one: --insight, --tags, --severity, ...)' }));
    } else {
      console.error(formatError('update', 'NO_FIELDS', 'No fields to update', 'Specify at least one: --insight, --tags, --severity, ...'));
    }
    process.exitCode = 1;
    return;
  }

  const { items } = await readMemoryItems(repoRoot);
  const item = items.find((i) => i.id === id);

  if (!item) {
    const wasDeleted = await wasLessonDeleted(repoRoot, id);
    if (options.json) {
      console.log(JSON.stringify({ error: wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found` }));
    } else {
      const msg = wasDeleted ? `Lesson ${id} is deleted` : `Lesson ${id} not found`;
      console.error(formatError('update', 'NOT_FOUND', msg, 'Use "ca list" to see available lessons'));
    }
    process.exitCode = 1;
    return;
  }

  if (options.severity !== undefined) {
    const result = SeveritySchema.safeParse(options.severity);
    if (!result.success) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Invalid severity '${options.severity}' (must be: high, medium, low)` }));
      } else {
        console.error(formatError('update', 'INVALID_SEVERITY', `Invalid severity: "${options.severity}"`, 'Use --severity high|medium|low'));
      }
      process.exitCode = 1;
      return;
    }
  }

  const updatedItem = buildUpdatedItem(item, options);

  const validationResult = MemoryItemSchema.safeParse(updatedItem);
  if (!validationResult.success) {
    if (options.json) {
      console.log(JSON.stringify({ error: `Schema validation failed: ${validationResult.error.message}` }));
    } else {
      console.error(formatError('update', 'VALIDATION_FAILED', `Schema validation failed: ${validationResult.error.message}`, 'Check field values and try again'));
    }
    process.exitCode = 1;
    return;
  }

  await appendMemoryItem(repoRoot, updatedItem);
  await syncIfNeeded(repoRoot);

  if (options.json) {
    console.log(JSON.stringify(updatedItem, null, SHOW_JSON_INDENT));
  } else {
    out.success(`Updated lesson ${id}`);
  }
}

async function deleteAction(ids: string[], options: { json?: boolean }): Promise<void> {
  const repoRoot = getRepoRoot();

  const { items } = await readMemoryItems(repoRoot);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const deleted: string[] = [];
  const warnings: Array<{ id: string; message: string }> = [];

  for (const id of ids) {
    const item = itemMap.get(id);

    if (!item) {
      const wasDeleted = await wasLessonDeleted(repoRoot, id);
      warnings.push({ id, message: wasDeleted ? 'already deleted' : 'not found' });
      continue;
    }

    const deletedItem: MemoryItem = {
      ...item,
      deleted: true,
      deletedAt: new Date().toISOString(),
    };

    await appendMemoryItem(repoRoot, deletedItem);
    deleted.push(id);
  }

  if (deleted.length > 0) {
    await syncIfNeeded(repoRoot);
  }

  if (options.json) {
    console.log(JSON.stringify({ deleted, warnings }));
  } else {
    if (deleted.length > 0) {
      out.success(`Deleted ${deleted.length} lesson(s): ${deleted.join(', ')}`);
    }
    for (const warning of warnings) {
      out.warn(`${warning.id}: ${warning.message}`);
    }
    if (deleted.length === 0 && warnings.length > 0) {
      process.exitCode = 1;
      return;
    }
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register CRUD commands on the program.
 */
export function registerCrudCommands(program: Command): void {
  program
    .command('show <id>')
    .description('Show details of a specific lesson')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      await showAction(id, options);
    });

  program
    .command('update <id>')
    .description('Update a lesson')
    .option('--insight <text>', 'Update insight')
    .option('--trigger <text>', 'Update trigger')
    .option('--evidence <text>', 'Update evidence')
    .option('--severity <level>', 'Update severity (low/medium/high)')
    .option('--tags <tags>', 'Update tags (comma-separated)')
    .option('--confirmed <bool>', 'Update confirmed status (true/false)')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: {
      insight?: string;
      trigger?: string;
      evidence?: string;
      severity?: string;
      tags?: string;
      confirmed?: string;
      json?: boolean;
    }) => {
      await updateAction(id, options);
    });

  program
    .command('delete <ids...>')
    .description('Soft delete lessons (creates tombstone)')
    .option('--json', 'Output as JSON')
    .action(async (ids: string[], options: { json?: boolean }) => {
      await deleteAction(ids, options);
    });
}
