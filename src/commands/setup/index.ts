/**
 * Setup commands barrel export.
 *
 * Re-exports the registerSetupCommands function and types.
 */

import type { Command } from 'commander';

import { registerClaudeSubcommand } from './claude.js';
import { registerDownloadModelCommand } from './download-model.js';
import { registerHooksCommand } from './hooks.js';
import { registerInitCommand } from './init.js';
import { registerSetupAllCommand } from './setup-all.js';

// Re-export types
export type { ClaudeHooksResult } from './types.js';
export type { HookInstallResult } from './hooks.js';

// Re-export templates for tests
export { AGENTS_MD_TEMPLATE } from './templates.js';

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
