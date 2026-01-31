/**
 * JSONL storage layer for lessons
 *
 * Append-only storage with last-write-wins deduplication.
 * Source of truth - git trackable.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
 * Parse and validate a single JSON line.
 * @returns Parsed lesson or null if invalid
 */
function parseJsonLine(
  line: string,
  lineNumber: number,
  strict: boolean,
  onParseError?: (error: ParseError) => void
): Lesson | null {
  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    const parseError: ParseError = {
      line: lineNumber,
      message: `Invalid JSON: ${(err as Error).message}`,
      cause: err,
    };
    if (strict) {
      throw new Error(`Parse error on line ${lineNumber}: ${parseError.message}`);
    }
    onParseError?.(parseError);
    return null;
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
    onParseError?.(parseError);
    return null;
  }

  return result.data;
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
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    const lesson = parseJsonLine(trimmed, i + 1, strict, onParseError);
    if (!lesson) {
      skippedCount++;
      continue;
    }

    if (lesson.deleted) {
      lessons.delete(lesson.id);
    } else {
      lessons.set(lesson.id, lesson);
    }
  }

  return { lessons: Array.from(lessons.values()), skippedCount };
}
