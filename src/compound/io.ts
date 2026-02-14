/**
 * I/O module for CctPattern persistence.
 *
 * Append-only JSONL storage, following the same pattern as
 * src/memory/storage/jsonl.ts.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CCT_PATTERNS_PATH, CctPatternSchema, type CctPattern } from './types.js';

/**
 * Read all CCT patterns from the JSONL file.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of CctPattern objects
 */
export async function readCctPatterns(repoRoot: string): Promise<CctPattern[]> {
  const filePath = join(repoRoot, CCT_PATTERNS_PATH);

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const patterns: CctPattern[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = JSON.parse(trimmed) as unknown;
    const result = CctPatternSchema.safeParse(parsed);
    if (result.success) {
      patterns.push(result.data);
    }
  }

  return patterns;
}

/**
 * Append CCT patterns to the JSONL file (append-only).
 *
 * @param repoRoot - Repository root directory
 * @param patterns - Patterns to append
 */
export async function writeCctPatterns(repoRoot: string, patterns: CctPattern[]): Promise<void> {
  const filePath = join(repoRoot, CCT_PATTERNS_PATH);
  await mkdir(dirname(filePath), { recursive: true });

  const lines = patterns.map((p) => JSON.stringify(p) + '\n').join('');
  await appendFile(filePath, lines, 'utf-8');
}
