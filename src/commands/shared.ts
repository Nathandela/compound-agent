/**
 * Shared types, constants, and utilities for CLI commands.
 */

import chalk from 'chalk';
import type { Command } from 'commander';

// Re-export centralized utilities (utils.ts remains in src/ root)
export { getLessonAgeDays, MS_PER_DAY } from '../utils.js';

// ============================================================================
// Output Formatting Helpers
// ============================================================================

/** Output helper functions for consistent formatting */
export const out = {
  success: (msg: string): void => console.log(chalk.green('[ok]'), msg),
  error: (msg: string): void => console.error(chalk.red('[error]'), msg),
  info: (msg: string): void => console.log(chalk.blue('[info]'), msg),
  warn: (msg: string): void => console.log(chalk.yellow('[warn]'), msg),
};

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

/** Default limit for search results */
export const DEFAULT_CHECK_PLAN_LIMIT = '5';

/** Threshold for lesson count warning (context pollution prevention) */
export const LESSON_COUNT_WARNING_THRESHOLD = 20;

/** Age threshold in days for flagging old lessons */
export const AGE_FLAG_THRESHOLD_DAYS = 90;

/** Length of ISO date prefix (YYYY-MM-DD) */
export const ISO_DATE_PREFIX_LENGTH = 10;

/** Decimal places for average calculations */
export const AVG_DECIMAL_PLACES = 1;

/** Decimal places for relevance scores */
export const RELEVANCE_DECIMAL_PLACES = 2;

/** Indentation for JSON pretty-printing */
export const JSON_INDENT_SPACES = 2;
