/**
 * Simple glob-like file finder using Node.js built-in fs.
 *
 * Supports basic glob patterns: **, *, and extension matching.
 * No external dependencies required.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Convert a simple glob pattern to a regex.
 * Supports: ** (any path), * (any segment), .ext matching.
 *
 * @param glob - Glob pattern (e.g., "**\/*.ts", "src/*.js")
 * @returns RegExp that matches the pattern
 */
export function globToRegex(glob: string): RegExp {
  const pattern = glob
    .replace(/\./g, '\\.')     // escape dots
    .replace(/\*\*\//g, '(.+/)?')  // ** matches any directory depth
    .replace(/\*/g, '[^/]*');  // * matches within a single segment
  return new RegExp(`^${pattern}$`);
}

/**
 * Find files in baseDir matching a glob pattern.
 *
 * @param baseDir - Root directory to search from
 * @param glob - Glob pattern to match
 * @returns Array of relative file paths matching the pattern
 */
export function findFiles(baseDir: string, glob: string): string[] {
  const regex = globToRegex(glob);
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      // Skip hidden directories and node_modules
      if (entry.startsWith('.') || entry === 'node_modules') continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const relPath = relative(baseDir, fullPath);
        if (regex.test(relPath)) {
          results.push(relPath);
        }
      }
    }
  }

  walk(baseDir);
  return results.sort();
}
