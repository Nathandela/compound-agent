/**
 * JSONL storage layer for memory items
 *
 * Append-only storage with last-write-wins deduplication.
 * Source of truth - git trackable.
 *
 * Primary API:
 *   appendMemoryItem() - Append any memory item type
 *   readMemoryItems()  - Read all non-deleted memory items
 *
 * Backward-compatible API:
 *   appendLesson()     - Append a lesson (delegates to appendMemoryItem)
 *   readLessons()      - Read lesson-type items only
 *
 * Deletion: append the item with `deleted: true` and `deletedAt`.
 * Read path also accepts old minimal tombstone records for backward compat.
 * Legacy type:'quick'/'full' records are converted to type:'lesson' on read.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  MemoryItemRecordSchema,
  type Lesson,
  type LessonRecord,
  type MemoryItem,
} from '../types.js';

/** Relative path to lessons file from repo root */
export const LESSONS_PATH = '.claude/lessons/index.jsonl';

/** Options for reading memory items */
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

/** Result of reading lessons (backward-compat) */
export interface ReadLessonsResult {
  /** Successfully parsed lessons */
  lessons: Lesson[];
  /** Number of lines skipped due to errors */
  skippedCount: number;
}

/** Result of reading memory items */
export interface ReadMemoryItemsResult {
  /** Successfully parsed memory items */
  items: MemoryItem[];
  /** IDs that were tombstoned (deleted) */
  deletedIds: Set<string>;
  /** Number of lines skipped due to errors */
  skippedCount: number;
}


/**
 * Append a memory item to the JSONL file.
 * Creates directory structure if missing.
 * Primary write function for all memory item types.
 *
 * @param repoRoot - Repository root directory
 * @param item - Memory item to append (any type: lesson, solution, pattern, preference)
 */
export async function appendMemoryItem(repoRoot: string, item: MemoryItem): Promise<void> {
  const filePath = join(repoRoot, LESSONS_PATH);
  await mkdir(dirname(filePath), { recursive: true });

  const line = JSON.stringify(item) + '\n';
  await appendFile(filePath, line, 'utf-8');
}

/**
 * Append a lesson to the JSONL file.
 * Backward-compatible wrapper around appendMemoryItem.
 *
 * @param repoRoot - Repository root directory
 * @param lesson - Lesson to append
 */
export async function appendLesson(repoRoot: string, lesson: Lesson): Promise<void> {
  return appendMemoryItem(repoRoot, lesson);
}

/**
 * Parse and validate a single JSON line.
 *
 * Accepts:
 * - New memory item types (lesson, solution, pattern, preference)
 * - Legacy lessons (type: 'quick' | 'full')
 * - Canonical tombstones ({ id, deleted: true, deletedAt })
 * - Legacy tombstones (full record with deleted:true)
 *
 * @returns Parsed record or null if invalid
 */
function parseJsonLine(
  line: string,
  lineNumber: number,
  strict: boolean,
  onParseError?: (error: ParseError) => void
): LessonRecord | null {
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

  // Validate against MemoryItemRecordSchema (accepts all types + legacy)
  const result = MemoryItemRecordSchema.safeParse(parsed);
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
 * Convert a parsed record to a MemoryItem.
 * Legacy type:'quick'/'full' records are converted to type:'lesson'.
 * Returns null for tombstone-only records (no MemoryItem data).
 */
function toMemoryItem(record: LessonRecord): MemoryItem | null {
  // Tombstone records that are minimal (no type field) cannot be converted
  if (record.deleted === true) {
    return null;
  }

  // Legacy type conversion: quick/full -> lesson
  if (record.type === 'quick' || record.type === 'full') {
    return { ...record, type: 'lesson' } as MemoryItem;
  }

  // Already a valid MemoryItem type
  return record as MemoryItem;
}

/**
 * Read all non-deleted memory items from the JSONL file.
 * Primary read function for the unified memory API.
 *
 * Applies last-write-wins deduplication by ID.
 * Converts legacy type:'quick'/'full' to type:'lesson'.
 *
 * Handles tombstone formats:
 * - Canonical: { id, deleted: true, deletedAt }
 * - Legacy: Full record with deleted:true field
 *
 * @param repoRoot - Repository root directory
 * @param options - Optional settings for error handling
 * @returns Result with items array and count of skipped lines
 */
export async function readMemoryItems(
  repoRoot: string,
  options: ReadLessonsOptions = {}
): Promise<ReadMemoryItemsResult> {
  const { strict = false, onParseError } = options;
  const filePath = join(repoRoot, LESSONS_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], deletedIds: new Set<string>(), skippedCount: 0 };
    }
    throw err;
  }

  const items = new Map<string, MemoryItem>();
  const deletedIds = new Set<string>();
  let skippedCount = 0;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    const record = parseJsonLine(trimmed, i + 1, strict, onParseError);
    if (!record) {
      skippedCount++;
      continue;
    }

    // Check if record is a tombstone (canonical or legacy)
    if (record.deleted === true) {
      items.delete(record.id);
      deletedIds.add(record.id);
    } else {
      const item = toMemoryItem(record);
      if (item) {
        items.set(record.id, item);
      }
    }
  }

  return { items: Array.from(items.values()), deletedIds, skippedCount };
}

/**
 * Read all non-deleted lessons from the JSONL file.
 * Backward-compatible wrapper that filters to lesson-type items only.
 *
 * @param repoRoot - Repository root directory
 * @param options - Optional settings for error handling
 * @returns Result with lessons array and count of skipped lines
 */
export async function readLessons(
  repoRoot: string,
  options: ReadLessonsOptions = {}
): Promise<ReadLessonsResult> {
  const result = await readMemoryItems(repoRoot, options);

  // Filter to lesson-type items only
  const lessons = result.items.filter((item): item is Lesson => item.type === 'lesson');

  return { lessons, skippedCount: result.skippedCount };
}
