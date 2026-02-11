/**
 * I/O commands: export, import
 *
 * Commands for importing and exporting lessons.
 */

import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { appendLesson, readLessons } from '../memory/storage/index.js';
import { LessonSchema } from '../memory/types.js';
import type { Lesson } from '../memory/types.js';

import { JSON_INDENT_SPACES } from './shared.js';

/**
 * Register I/O commands on the program.
 */
export function registerIOCommands(program: Command): void {
  /**
   * Export command - Export lessons as JSON to stdout.
   *
   * @example npx ca export
   * @example npx ca export --since 2024-01-15
   * @example npx ca export --tags typescript,testing
   */
  program
    .command('export')
    .description('Export lessons as JSON to stdout')
    .option('--since <date>', 'Only include lessons created after this date (ISO8601)')
    .option('--tags <tags>', 'Filter by tags (comma-separated, OR logic)')
    .action(async (options: { since?: string; tags?: string }) => {
      const repoRoot = getRepoRoot();

      const { lessons } = await readLessons(repoRoot);

      let filtered = lessons;

      // Filter by date if --since provided
      if (options.since) {
        const sinceDate = new Date(options.since);
        if (Number.isNaN(sinceDate.getTime())) {
          console.error(`Invalid date format: ${options.since}. Use ISO8601 format (e.g., 2024-01-15).`);
          process.exit(1);
        }
        filtered = filtered.filter((lesson) => new Date(lesson.created) >= sinceDate);
      }

      // Filter by tags if --tags provided (OR logic)
      if (options.tags) {
        const filterTags = options.tags.split(',').map((t) => t.trim());
        filtered = filtered.filter((lesson) => lesson.tags.some((tag) => filterTags.includes(tag)));
      }

      // Output JSON to stdout (portable format for sharing)
      console.log(JSON.stringify(filtered, null, JSON_INDENT_SPACES));
    });

  /**
   * Import command - Import lessons from a JSONL file.
   *
   * @example npx ca import lessons.jsonl
   */
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
