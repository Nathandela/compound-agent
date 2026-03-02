/**
 * Tests for CLI native module preflight check.
 *
 * TDD: Tests for commandNeedsSqlite and preAction hook behavior.
 */

import { describe, expect, it } from 'vitest';
import { Command } from 'commander';

import { commandNeedsSqlite } from './cli-preflight.js';

/**
 * Helper: create a Commander command hierarchy and return the leaf command.
 */
function makeCommand(name: string, parentName?: string): Command {
  if (parentName) {
    const parent = new Command(parentName);
    const child = new Command(name);
    parent.addCommand(child);
    return child;
  }
  return new Command(name);
}

describe('commandNeedsSqlite', () => {
  // ============================================================================
  // Commands that need SQLite
  // ============================================================================

  // Exhaustive: every command in NEEDS_SQLITE must return true.
  // This catches typos in the set.
  const sqliteCommands = [
    'learn', 'capture', 'detect',
    'search', 'list', 'load-session', 'check-plan',
    'knowledge', 'index-docs',
    'show', 'update', 'delete',
    'wrong', 'validate',
    'compact', 'rebuild', 'stats', 'prime', 'clean-lessons',
    'export', 'import',
    'audit', 'compound',
  ];

  for (const cmd of sqliteCommands) {
    it(`returns true for "${cmd}" command`, () => {
      expect(commandNeedsSqlite(makeCommand(cmd))).toBe(true);
    });
  }

  // ============================================================================
  // Commands that do NOT need SQLite
  // ============================================================================

  it('returns false for "setup" command', () => {
    expect(commandNeedsSqlite(makeCommand('setup'))).toBe(false);
  });

  it('returns false for "init" command', () => {
    expect(commandNeedsSqlite(makeCommand('init'))).toBe(false);
  });

  it('returns false for "doctor" command', () => {
    expect(commandNeedsSqlite(makeCommand('doctor'))).toBe(false);
  });

  it('returns false for "about" command', () => {
    expect(commandNeedsSqlite(makeCommand('about'))).toBe(false);
  });

  it('returns false for "reviewer" command', () => {
    expect(commandNeedsSqlite(makeCommand('reviewer'))).toBe(false);
  });

  it('returns false for "rules" command', () => {
    expect(commandNeedsSqlite(makeCommand('rules'))).toBe(false);
  });

  it('returns false for "verify-gates" command', () => {
    expect(commandNeedsSqlite(makeCommand('verify-gates'))).toBe(false);
  });

  it('returns false for "test-summary" command', () => {
    expect(commandNeedsSqlite(makeCommand('test-summary'))).toBe(false);
  });

  it('returns false for "loop" command', () => {
    expect(commandNeedsSqlite(makeCommand('loop'))).toBe(false);
  });

  it('returns false for "hooks" command', () => {
    expect(commandNeedsSqlite(makeCommand('hooks'))).toBe(false);
  });

  it('returns false for "download-model" command', () => {
    expect(commandNeedsSqlite(makeCommand('download-model'))).toBe(false);
  });

  it('returns false for "worktree" deprecation stub', () => {
    expect(commandNeedsSqlite(makeCommand('worktree'))).toBe(false);
  });

  // ============================================================================
  // Subcommand hierarchy
  // ============================================================================

  it('returns false for subcommands of safe parents (e.g., "all" under "setup")', () => {
    expect(commandNeedsSqlite(makeCommand('all', 'setup'))).toBe(false);
  });

  it('returns false for "claude" subcommand under "setup"', () => {
    expect(commandNeedsSqlite(makeCommand('claude', 'setup'))).toBe(false);
  });

  it('returns false for "enable" subcommand under "reviewer"', () => {
    expect(commandNeedsSqlite(makeCommand('enable', 'reviewer'))).toBe(false);
  });

  it('returns true for a subcommand when parent is in NEEDS_SQLITE', () => {
    // e.g. if "compound" had subcommands, the child inherits the requirement
    expect(commandNeedsSqlite(makeCommand('run', 'compound'))).toBe(true);
  });

  // ============================================================================
  // Unknown commands (should be safe by default)
  // ============================================================================

  it('returns false for unknown commands (fail-safe default)', () => {
    expect(commandNeedsSqlite(makeCommand('some-new-command'))).toBe(false);
  });
});
