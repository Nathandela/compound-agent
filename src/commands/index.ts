/**
 * Command modules for CLI.
 *
 * Each module exports a registration function that adds commands to the program.
 */

import type { Command } from 'commander';

import { registerClaudeSubcommand } from './setup-claude.js';
import { registerDownloadModelCommand } from './setup-download-model.js';
import { registerHooksCommand } from './setup-hooks.js';
import { registerInitCommand } from './setup-init.js';
import { registerSetupAllCommand } from './setup-all.js';

import { registerCrudCommands } from './management-crud.js';
import { registerInvalidationCommands } from './management-invalidation.js';
import { registerIOCommands } from './management-io.js';
import { registerMaintenanceCommands } from './management-maintenance.js';
import { registerPrimeCommand } from './management-prime.js';

export { registerCaptureCommands } from './capture.js';
export { registerRemindCaptureCommand } from './remind-capture.js';
export { registerRetrievalCommands } from './retrieval.js';

// Re-export types and helpers from flattened modules
export type { ClaudeHooksResult } from './setup-types.js';
export { formatLessonHuman, wasLessonDeleted } from './management-helpers.js';
export { getPrimeContext } from './management-prime.js';
export type { HookInstallResult } from './setup-hooks.js';

// Re-export shared utilities for use by cli.ts
export { getGlobalOpts, out } from './shared.js';
export type { GlobalOpts } from './shared.js';

/**
 * Register all setup commands on the program.
 */
export function registerSetupCommands(program: Command): void {
  registerInitCommand(program);
  registerHooksCommand(program);

  // Create the main setup command with one-shot action
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
}
