/**
 * Compaction and auto-archive for lessons
 *
 * Handles:
 * - Archiving old lessons (>90 days with 0 retrievals)
 * - Removing tombstones through JSONL rewrite
 * - Tracking compaction thresholds
 */

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Lesson } from '../types.js';
import { getLessonAgeDays } from '../../utils.js';

import { LESSONS_PATH, readLessons } from './jsonl.js';

/** Relative path to archive directory from repo root */
export const ARCHIVE_DIR = '.claude/lessons/archive';

/** Number of tombstones that triggers automatic compaction */
export const TOMBSTONE_THRESHOLD = 100;

/** Age threshold for archiving (in days) */
export const ARCHIVE_AGE_DAYS = 90;

/** Month offset for JavaScript's 0-indexed months */
const MONTH_INDEX_OFFSET = 1;

/** Padding length for month in archive filename (e.g., "01" not "1") */
const MONTH_PAD_LENGTH = 2;

/**
 * Result of a compaction operation
 */
export interface CompactResult {
  /** Number of lessons moved to archive */
  archived: number;
  /** Number of tombstones removed */
  tombstonesRemoved: number;
  /** Number of lessons remaining in index.jsonl */
  lessonsRemaining: number;
}

/**
 * Generate archive file path for a given date.
 * Format: .claude/lessons/archive/YYYY-MM.jsonl
 */
export function getArchivePath(repoRoot: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + MONTH_INDEX_OFFSET).padStart(MONTH_PAD_LENGTH, '0');
  return join(repoRoot, ARCHIVE_DIR, `${year}-${month}.jsonl`);
}

/**
 * Parse raw JSONL lines from the lessons file.
 * Returns all lines (including invalid ones) as parsed objects or null.
 */
async function parseRawJsonlLines(
  repoRoot: string
): Promise<Array<{ line: string; parsed: Record<string, unknown> | null }>> {
  const filePath = join(repoRoot, LESSONS_PATH);
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const results: Array<{ line: string; parsed: Record<string, unknown> | null }> = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      results.push({ line: trimmed, parsed });
    } catch {
      results.push({ line: trimmed, parsed: null });
    }
  }
  return results;
}

/**
 * Count the number of tombstones (deleted: true records) in the JSONL file.
 */
export async function countTombstones(repoRoot: string): Promise<number> {
  const lines = await parseRawJsonlLines(repoRoot);
  let count = 0;
  for (const { parsed } of lines) {
    if (parsed && parsed['deleted'] === true) {
      count++;
    }
  }
  return count;
}

/**
 * Check if compaction is needed based on tombstone count.
 */
export async function needsCompaction(repoRoot: string): Promise<boolean> {
  const count = await countTombstones(repoRoot);
  return count >= TOMBSTONE_THRESHOLD;
}

/**
 * Rewrite the JSONL file without tombstones.
 * Applies last-write-wins deduplication.
 */
export async function rewriteWithoutTombstones(repoRoot: string): Promise<number> {
  const filePath = join(repoRoot, LESSONS_PATH);
  const tempPath = filePath + '.tmp';

  // Read deduplicated lessons (already handles last-write-wins)
  const { lessons } = await readLessons(repoRoot);

  // Count tombstones before rewrite
  const tombstoneCount = await countTombstones(repoRoot);

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  // Write clean lessons to temp file
  const lines = lessons.map((lesson) => JSON.stringify(lesson) + '\n');
  await writeFile(tempPath, lines.join(''), 'utf-8');

  // Atomic rename
  await rename(tempPath, filePath);

  return tombstoneCount;
}

/**
 * Determine if a lesson should be archived based on age and retrieval count.
 * Lessons are archived if older than ARCHIVE_AGE_DAYS and never retrieved.
 *
 * @param lesson - The lesson to evaluate
 * @returns true if lesson should be archived
 */
function shouldArchive(lesson: Lesson): boolean {
  const ageDays = getLessonAgeDays(lesson);

  // Archive if: older than threshold AND never retrieved
  return ageDays > ARCHIVE_AGE_DAYS && (lesson.retrievalCount === undefined || lesson.retrievalCount === 0);
}

/**
 * Archive old lessons that haven't been retrieved.
 * Moves lessons >90 days old with 0 retrievals to archive files.
 * Returns the number of lessons archived.
 */
export async function archiveOldLessons(repoRoot: string): Promise<number> {
  const { lessons } = await readLessons(repoRoot);

  const toArchive: Lesson[] = [];
  const toKeep: Lesson[] = [];

  for (const lesson of lessons) {
    if (shouldArchive(lesson)) {
      toArchive.push(lesson);
    } else {
      toKeep.push(lesson);
    }
  }

  if (toArchive.length === 0) {
    return 0;
  }

  // Group lessons by archive file (YYYY-MM)
  const archiveGroups = new Map<string, Lesson[]>();
  for (const lesson of toArchive) {
    const created = new Date(lesson.created);
    const archivePath = getArchivePath(repoRoot, created);
    const group = archiveGroups.get(archivePath) ?? [];
    group.push(lesson);
    archiveGroups.set(archivePath, group);
  }

  // Create archive directory
  const archiveDir = join(repoRoot, ARCHIVE_DIR);
  await mkdir(archiveDir, { recursive: true });

  // Append to archive files
  for (const [archivePath, archiveLessons] of archiveGroups) {
    const lines = archiveLessons.map((l) => JSON.stringify(l) + '\n').join('');
    await appendFile(archivePath, lines, 'utf-8');
  }

  // Rewrite main file without archived lessons
  const filePath = join(repoRoot, LESSONS_PATH);
  const tempPath = filePath + '.tmp';
  await mkdir(dirname(filePath), { recursive: true });

  const lines = toKeep.map((lesson) => JSON.stringify(lesson) + '\n');
  await writeFile(tempPath, lines.join(''), 'utf-8');
  await rename(tempPath, filePath);

  return toArchive.length;
}

/**
 * Run full compaction: archive old lessons and remove tombstones.
 *
 * Reads the JSONL file exactly once, computes all operations in-memory,
 * then writes archive files and atomically replaces the main file.
 */
export async function compact(repoRoot: string): Promise<CompactResult> {
  const filePath = join(repoRoot, LESSONS_PATH);

  // 1. Read file ONCE
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return { archived: 0, tombstonesRemoved: 0, lessonsRemaining: 0 };
  }

  // 2. Parse all records in-memory with last-write-wins dedup
  const lessonMap = new Map<string, Lesson>();
  let tombstoneCount = 0;

  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (parsed['deleted'] === true) {
      lessonMap.delete(parsed['id'] as string);
      tombstoneCount++;
    } else if (parsed['id']) {
      lessonMap.set(parsed['id'] as string, parsed as unknown as Lesson);
    }
  }

  // 3. Split into archivable and kept
  const toArchive: Lesson[] = [];
  const toKeep: Lesson[] = [];

  for (const lesson of lessonMap.values()) {
    if (shouldArchive(lesson)) {
      toArchive.push(lesson);
    } else {
      toKeep.push(lesson);
    }
  }

  // 4. Write archive files
  if (toArchive.length > 0) {
    const archiveGroups = new Map<string, Lesson[]>();
    for (const lesson of toArchive) {
      const created = new Date(lesson.created);
      const archivePath = getArchivePath(repoRoot, created);
      const group = archiveGroups.get(archivePath) ?? [];
      group.push(lesson);
      archiveGroups.set(archivePath, group);
    }

    const archiveDir = join(repoRoot, ARCHIVE_DIR);
    await mkdir(archiveDir, { recursive: true });

    for (const [archivePath, archiveLessons] of archiveGroups) {
      const lines = archiveLessons.map((l) => JSON.stringify(l) + '\n').join('');
      await appendFile(archivePath, lines, 'utf-8');
    }
  }

  // 5. Atomic write of main JSONL with only kept lessons
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = filePath + '.tmp';
  const lines = toKeep.map((lesson) => JSON.stringify(lesson) + '\n');
  await writeFile(tempPath, lines.join(''), 'utf-8');
  await rename(tempPath, filePath);

  return {
    archived: toArchive.length,
    tombstonesRemoved: tombstoneCount,
    lessonsRemaining: toKeep.length,
  };
}
