/**
 * JSONL storage layer for lessons
 *
 * Append-only storage with last-write-wins deduplication.
 * Source of truth - git trackable.
 */

import { appendFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { LessonSchema, type Lesson } from '../types.js';

/** Relative path to lessons file from repo root */
export const LESSONS_PATH = '.claude/lessons/index.jsonl';

/**
 * Append a lesson to the JSONL file.
 * Creates directory structure if missing.
 */
export async function appendLesson(repoRoot: string, lesson: Lesson): Promise<void> {
  const filePath = join(repoRoot, LESSONS_PATH);
  await mkdir(dirname(filePath), { recursive: true });

  const line = JSON.stringify(lesson) + '\n';
  await appendFile(filePath, line, 'utf-8');
}

/**
 * Read all non-deleted lessons from the JSONL file.
 * Applies last-write-wins deduplication by ID.
 * Returns empty array if file doesn't exist.
 */
export async function readLessons(repoRoot: string): Promise<Lesson[]> {
  const filePath = join(repoRoot, LESSONS_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const lessons = new Map<string, Lesson>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = JSON.parse(trimmed);
    const result = LessonSchema.safeParse(parsed);

    if (result.success) {
      const lesson = result.data;
      if (lesson.deleted) {
        lessons.delete(lesson.id);
      } else {
        lessons.set(lesson.id, lesson);
      }
    }
  }

  return Array.from(lessons.values());
}
