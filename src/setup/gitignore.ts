/**
 * .gitignore injection - ensures required patterns exist.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Patterns compound-agent needs in .gitignore. */
const REQUIRED_PATTERNS = ['node_modules/', '.claude/.cache/', '.claude/.ca-*.json'];

/** Section comment marker. */
const SECTION_COMMENT = '# compound-agent';

/** Result of ensureGitignore operation. */
export interface GitignoreResult {
  /** Patterns that were added. */
  added: string[];
}

/**
 * Ensure .gitignore has required patterns.
 *
 * - Creates .gitignore if missing
 * - Appends missing patterns under a section comment
 * - Never duplicates existing patterns
 */
export async function ensureGitignore(repoRoot: string): Promise<GitignoreResult> {
  const gitignorePath = join(repoRoot, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = await readFile(gitignorePath, 'utf-8');
  }

  const lines = content.split('\n');
  const existingPatterns = new Set(lines.map(l => l.trim()));

  const missing = REQUIRED_PATTERNS.filter(p => !existingPatterns.has(p));

  if (missing.length === 0) {
    return { added: [] };
  }

  const section = [SECTION_COMMENT, ...missing].join('\n');
  const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
  const newContent = content + separator + section + '\n';

  await writeFile(gitignorePath, newContent, 'utf-8');

  return { added: missing };
}
