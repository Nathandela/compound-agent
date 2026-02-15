/**
 * Command modules for CLI.
 *
 * Each module exports a registration function that adds commands to the program.
 */

import type { Command } from 'commander';

import {
  registerClaudeSubcommand,
  registerDownloadModelCommand,
  registerHooksCommand,
  registerInitCommand,
  registerSetupAllCommand,
} from '../setup/index.js';

import { registerCrudCommands } from './management-crud.js';
import { registerInvalidationCommands } from './management-invalidation.js';
import { registerIOCommands } from './management-io.js';
import { registerMaintenanceCommands } from './management-maintenance.js';
import { registerPrimeCommand } from './management-prime.js';
import { registerAuditCommands } from './audit.js';
import { registerReviewerCommand } from './reviewer.js';
import { registerRulesCommands } from './rules.js';
import { registerTestSummaryCommand } from './test-summary.js';

export { registerCaptureCommands } from './capture.js';
export { registerRetrievalCommands } from './retrieval.js';

// Re-export types and helpers from management modules
export { formatLessonHuman, wasLessonDeleted } from './management-helpers.js';
export { getPrimeContext } from './management-prime.js';

// Re-export shared utilities for use by cli.ts
export { getGlobalOpts, out } from './shared.js';
export type { GlobalOpts } from './shared.js';

/**
 * Register all setup commands on the program.
 */
export function registerSetupCommands(program: Command): void {
  registerInitCommand(program);
  registerHooksCommand(program);

  // Create the main setup command. The "all" action is registered as the
  // default subcommand so its options (--uninstall, --dry-run) don't
  // conflict with identically-named options on the "claude" subcommand.
  const setupCommand = program.command('setup');
  registerSetupAllCommand(setupCommand);

  // Add subcommands to setup
  registerClaudeSubcommand(setupCommand);

  registerDownloadModelCommand(program);
}

/**
 * Register all management commands on the program.
 */
export function registerManagementCommands(program: Command): void {
  registerInvalidationCommands(program);
  registerMaintenanceCommands(program);
  registerIOCommands(program);
  registerPrimeCommand(program);
  registerCrudCommands(program);
  registerAuditCommands(program);
  registerReviewerCommand(program);
  registerRulesCommands(program);
  registerTestSummaryCommand(program);
}
