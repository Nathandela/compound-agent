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

/** Options for reading lessons */
export interface ReadLessonsOptions {
  /** If true, throw on first parse error. Default: false (skip errors) */
  strict?: boolean;
  /** Callback for each parse error in non-strict mode */
  onParseError?: (error: ParseError) => void;
}

/** Parse error details */
export interface ParseError {
  /** 1-based line number */
  line: number;
  /** Error message */
  message: string;
  /** Original error */
  cause: unknown;
}

/** Result of reading lessons */
export interface ReadLessonsResult {
  /** Successfully parsed lessons */
  lessons: Lesson[];
  /** Number of lines skipped due to errors */
  skippedCount: number;
}

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
 * Returns result object with lessons and skippedCount.
 *
 * @param repoRoot - Repository root directory
 * @param options - Optional settings for error handling
 * @returns Result with lessons array and count of skipped lines
 */
export async function readLessons(
  repoRoot: string,
  options: ReadLessonsOptions = {}
): Promise<ReadLessonsResult> {
  const { strict = false, onParseError } = options;
  const filePath = join(repoRoot, LESSONS_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { lessons: [], skippedCount: 0 };
    }
    throw err;
  }

  const lessons = new Map<string, Lesson>();
  let skippedCount = 0;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lineNumber = i + 1; // 1-based line number

    // Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const parseError: ParseError = {
        line: lineNumber,
        message: `Invalid JSON: ${(err as Error).message}`,
        cause: err,
      };

      if (strict) {
        throw new Error(`Parse error on line ${lineNumber}: ${parseError.message}`);
      }

      skippedCount++;
      onParseError?.(parseError);
      continue;
    }

    // Validate against schema
    const result = LessonSchema.safeParse(parsed);

    if (!result.success) {
      const parseError: ParseError = {
        line: lineNumber,
        message: `Schema validation failed: ${result.error.message}`,
        cause: result.error,
      };

      if (strict) {
        throw new Error(`Parse error on line ${lineNumber}: ${parseError.message}`);
      }

      skippedCount++;
      onParseError?.(parseError);
      continue;
    }

    const lesson = result.data;
    if (lesson.deleted) {
      lessons.delete(lesson.id);
    } else {
      lessons.set(lesson.id, lesson);
    }
  }

  return { lessons: Array.from(lessons.values()), skippedCount };
}
