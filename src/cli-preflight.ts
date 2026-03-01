/**
 * Native module preflight check logic.
 *
 * Extracted from cli.ts so tests can import without triggering
 * Commander's program.parse() side effect.
 */

import type { Command } from 'commander';

/**
 * Commands that require SQLite (better-sqlite3) to function.
 * Only these commands trigger the native module preflight check.
 *
 * Inverted from a "safe" set so new commands work by default without
 * native modules. If a new command needs SQLite, it should be added here;
 * otherwise it will still get the error from ensureSqliteAvailable() at
 * call time, just with a less polished message.
 */
const NEEDS_SQLITE = new Set([
  // Capture
  'learn', 'capture', 'detect',
  // Retrieval
  'search', 'list', 'load-session', 'check-plan',
  // Knowledge
  'knowledge', 'index-docs',
  // Management - CRUD
  'show', 'update', 'delete',
  // Management - invalidation
  'wrong', 'validate',
  // Management - maintenance
  'compact', 'rebuild', 'stats', 'prime', 'clean-lessons',
  // Management - IO
  'export', 'import',
  // Audit & compound
  'audit', 'compound',
]);

/**
 * Check if a command (or any of its ancestors) needs SQLite.
 */
export function commandNeedsSqlite(cmd: Command): boolean {
  let current: Command | null = cmd;
  while (current) {
    if (NEEDS_SQLITE.has(current.name())) return true;
    current = current.parent;
  }
  return false;
}
