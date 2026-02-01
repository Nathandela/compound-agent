/**
 * Delete command - Soft delete lessons by creating tombstone records
 */

import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson, LESSONS_PATH, readLessons, syncIfNeeded } from '../../storage/index.js';
import type { Lesson } from '../../types.js';
import { out } from '../shared.js';

/**
 * Check if a lesson ID has been deleted (has a tombstone).
 */
async function wasLessonDeleted(repoRoot: string, id: string): Promise<boolean> {
  const filePath = join(repoRoot, LESSONS_PATH);
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as { id: string; deleted?: boolean };
        if (record.id === id && record.deleted === true) {
          return true;
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // File doesn't exist
  }
  return false;
}

/**
 * Register the delete command with the program.
 */
export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <ids...>')
    .description('Soft delete lessons (creates tombstone)')
    .option('--json', 'Output as JSON')
    .action(async (ids: string[], options: { json?: boolean }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);
      const lessonMap = new Map(lessons.map((l) => [l.id, l]));

      const deleted: string[] = [];
      const warnings: Array<{ id: string; message: string }> = [];

      for (const id of ids) {
        const lesson = lessonMap.get(id);

        if (!lesson) {
          // Check if already deleted or never existed
          const wasDeleted = await wasLessonDeleted(repoRoot, id);
          warnings.push({ id, message: wasDeleted ? 'already deleted' : 'not found' });
          continue;
        }

        // Create tombstone as full lesson copy with deleted: true and deletedAt
        // This ensures it passes schema validation in readLessons
        const tombstone: Lesson & { deleted: true; deletedAt: string } = {
          ...lesson,
          deleted: true,
          deletedAt: new Date().toISOString(),
        };

        // Append tombstone using appendLesson (casts to handle the deleted field)
        await appendLesson(repoRoot, tombstone as unknown as Lesson);

        deleted.push(id);
      }

      // Sync once at end
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
          process.exit(1);
        }
      }
    });
}
