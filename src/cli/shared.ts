/**
 * Shared CLI utilities and constants
 *
 * This module provides common functionality used across CLI commands:
 * - Output formatters (success, error, info, warn)
 * - Global options handling
 * - Constants for formatting and limits
 * - Hook configuration
 */

import chalk from 'chalk';
import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { getRepoRoot } from '../cli-utils.js';

// ============================================================================
// Output Formatting
// ============================================================================

/** Output helper functions for consistent formatting */
export const out = {
  success: (msg: string): void => console.log(chalk.green('[ok]'), msg),
  error: (msg: string): void => console.error(chalk.red('[error]'), msg),
  info: (msg: string): void => console.log(chalk.blue('[info]'), msg),
  warn: (msg: string): void => console.log(chalk.yellow('[warn]'), msg),
};

// ============================================================================
// Global Options
// ============================================================================

/** Global options interface */
export interface GlobalOpts {
  verbose: boolean;
  quiet: boolean;
}

/**
 * Get global options from command.
 */
export function getGlobalOpts(cmd: Command): GlobalOpts {
  const opts = cmd.optsWithGlobals() as { verbose?: boolean; quiet?: boolean };
  return {
    verbose: opts.verbose ?? false,
    quiet: opts.quiet ?? false,
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Default limit for search results */
export const DEFAULT_SEARCH_LIMIT = '10';

/** Default limit for list results */
export const DEFAULT_LIST_LIMIT = '20';

/** Default limit for check-plan results */
export const DEFAULT_CHECK_PLAN_LIMIT = '5';

/** Length of ISO date prefix (YYYY-MM-DD) */
export const ISO_DATE_PREFIX_LENGTH = 10;

/** Decimal places for average calculations */
export const AVG_DECIMAL_PLACES = 1;

/** Decimal places for relevance scores */
export const RELEVANCE_DECIMAL_PLACES = 2;

/** Indentation for JSON pretty-printing */
export const JSON_INDENT_SPACES = 2;

// ============================================================================
// Hook Constants
// ============================================================================

/** Pre-commit hook reminder message */
export const PRE_COMMIT_MESSAGE = `Before committing, have you captured any valuable lessons from this session?
Consider: corrections, mistakes, or insights worth remembering.

To capture a lesson:
  npx lna capture --trigger "what happened" --insight "what to do" --yes`;

/** Pre-commit hook shell script template */
export const PRE_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Learning Agent pre-commit hook
# Reminds Claude to consider capturing lessons before commits

npx lna hooks run pre-commit
`;

/** Marker to identify our hook in Claude Code settings (v0.2.1+: uses lna alias) */
export const CLAUDE_HOOK_MARKER = 'lna load-session';

/** Legacy marker for backward compatibility with v0.2.0 hooks */
export const CLAUDE_HOOK_MARKER_LEGACY = 'learning-agent load-session';

/** Claude Code SessionStart hook configuration */
export const CLAUDE_HOOK_CONFIG = {
  matcher: 'startup|resume|compact',
  hooks: [
    {
      type: 'command',
      command: 'npx lna load-session 2>/dev/null || true',
    },
  ],
};

/** Marker comment to identify our hook in git hooks */
export const HOOK_MARKER = '# Learning Agent pre-commit hook';

// ============================================================================
// Claude Settings Helpers
// ============================================================================

/**
 * Get path to Claude Code settings file.
 */
export function getClaudeSettingsPath(global: boolean): string {
  if (global) {
    return join(homedir(), '.claude', 'settings.json');
  }
  const repoRoot = getRepoRoot();
  return join(repoRoot, '.claude', 'settings.json');
}

/**
 * Read Claude Code settings from file.
 */
export async function readClaudeSettings(settingsPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const content = await readFile(settingsPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Check if settings contain learning-agent hooks.
 */
export function hasClaudeHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  return hooks.SessionStart.some((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return hookEntry.hooks?.some((h) =>
      h.command?.includes(CLAUDE_HOOK_MARKER) || h.command?.includes(CLAUDE_HOOK_MARKER_LEGACY)
    );
  });
}

/**
 * Add learning-agent hook to settings.
 */
export function addLearningAgentHook(settings: Record<string, unknown>): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;
  if (!hooks.SessionStart) {
    hooks.SessionStart = [];
  }
  hooks.SessionStart.push(CLAUDE_HOOK_CONFIG);
}

/**
 * Remove learning-agent hooks from settings.
 * Returns true if any hooks were removed.
 */
export function removeLearningAgentHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  const originalLength = hooks.SessionStart.length;
  hooks.SessionStart = hooks.SessionStart.filter((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return !hookEntry.hooks?.some((h) =>
      h.command?.includes(CLAUDE_HOOK_MARKER) || h.command?.includes(CLAUDE_HOOK_MARKER_LEGACY)
    );
  });

  return hooks.SessionStart.length < originalLength;
}

/**
 * Write Claude Code settings atomically.
 */
export async function writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  const dir = dirname(settingsPath);
  await mkdir(dir, { recursive: true });

  const tempPath = settingsPath + '.tmp';
  await writeFile(tempPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  await rename(tempPath, settingsPath);
}
