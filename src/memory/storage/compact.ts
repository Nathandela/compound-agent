/**
 * Tombstone removal and JSONL rewrite
 *
 * Handles:
 * - Removing tombstones through JSONL rewrite
 * - Tracking compaction thresholds
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { MemoryItemSchema } from '../types.js';
import type { MemoryItem } from '../types.js';

import { LESSONS_PATH } from './jsonl.js';

/** Number of tombstones that triggers automatic compaction */
export const TOMBSTONE_THRESHOLD = 100;

/**
 * Result of a compaction operation
 */
export interface CompactResult {
  /** Number of lessons moved to archive (always 0, kept for API compat) */
  archived: number;
  /** Number of tombstones removed */
  tombstonesRemoved: number;
  /** Number of lessons remaining in index.jsonl */
  lessonsRemaining: number;
  /** Number of records dropped due to invalid schema */
  droppedInvalid: number;
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
 * Run compaction: remove tombstones and invalid records, rewrite JSONL.
 *
 * Reads the JSONL file exactly once, deduplicates in-memory,
 * then atomically replaces the main file.
 */
export async function compact(repoRoot: string): Promise<CompactResult> {
  const filePath = join(repoRoot, LESSONS_PATH);

  // 1. Read file ONCE
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return { archived: 0, tombstonesRemoved: 0, lessonsRemaining: 0, droppedInvalid: 0 };
  }

  // 2. Parse all records in-memory with last-write-wins dedup
  const lessonMap = new Map<string, MemoryItem>();
  let tombstoneCount = 0;
  let droppedCount = 0;

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
    } else {
      const result = MemoryItemSchema.safeParse(parsed);
      if (result.success) {
        lessonMap.set(result.data.id, result.data);
      } else {
        droppedCount++;
      }
    }
  }

  // 3. Collect all remaining lessons
  const toKeep = [...lessonMap.values()];

  // 4. Atomic write of main JSONL with only kept lessons
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = filePath + '.tmp';
  const lines = toKeep.map((lesson) => JSON.stringify(lesson) + '\n');
  await writeFile(tempPath, lines.join(''), 'utf-8');
  await rename(tempPath, filePath);

  return {
    archived: 0,
    tombstonesRemoved: tombstoneCount,
    lessonsRemaining: toKeep.length,
    droppedInvalid: droppedCount,
  };
}
