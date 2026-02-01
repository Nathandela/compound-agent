/**
 * Import command - Import lessons from a JSONL file
 */

import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';

import { getRepoRoot } from '../../cli-utils.js';
import { appendLesson, readLessons, syncIfNeeded } from '../../storage/index.js';
import { LessonSchema } from '../../types.js';
import type { Lesson } from '../../types.js';

/**
 * Register the import command with the program.
 */
export function registerImportCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import lessons from a JSONL file')
    .action(async (file: string) => {
      const repoRoot = getRepoRoot();

      // Read input file
      let content: string;
      try {
        content = await readFile(file, 'utf-8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          console.error(`Error: File not found: ${file}`);
        } else {
          console.error(`Error reading file: ${(err as Error).message}`);
        }
        process.exit(1);
      }

      // Get existing lesson IDs
      const { lessons: existingLessons } = await readLessons(repoRoot);
      const existingIds = new Set(existingLessons.map((l) => l.id));

      // Parse and validate each line
      const lines = content.split('\n');
      let imported = 0;
      let skipped = 0;
      let invalid = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          invalid++;
          continue;
        }

        // Validate schema
        const result = LessonSchema.safeParse(parsed);
        if (!result.success) {
          invalid++;
          continue;
        }

        const lesson: Lesson = result.data;

        // Skip if ID already exists
        if (existingIds.has(lesson.id)) {
          skipped++;
          continue;
        }

        // Append lesson
        await appendLesson(repoRoot, lesson);
        existingIds.add(lesson.id);
        imported++;
      }

      // Sync SQLite index after import
      await syncIfNeeded(repoRoot);

      // Format summary
      const lessonWord = imported === 1 ? 'lesson' : 'lessons';
      const parts: string[] = [];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (invalid > 0) parts.push(`${invalid} invalid`);

      if (parts.length > 0) {
        console.log(`Imported ${imported} ${lessonWord} (${parts.join(', ')})`);
      } else {
        console.log(`Imported ${imported} ${lessonWord}`);
      }
    });
}
