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

  let newContent: string;
  const sectionIdx = lines.findIndex(l => l.trim() === SECTION_COMMENT);

  if (sectionIdx >= 0) {
    // Append to existing section: find last contiguous non-empty pattern line after the comment
    let insertAfter = sectionIdx;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) break;
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) break;
      insertAfter = i;
    }
    lines.splice(insertAfter + 1, 0, ...missing);
    newContent = lines.join('\n');
  } else {
    const section = [SECTION_COMMENT, ...missing].join('\n');
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    newContent = content + separator + section + '\n';
  }

  await writeFile(gitignorePath, newContent, 'utf-8');

  return { added: missing };
}
