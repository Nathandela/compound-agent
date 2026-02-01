/**
 * Setup commands barrel export.
 *
 * Re-exports the registerSetupCommands function and types.
 */

import type { Command } from 'commander';

import { registerClaudeCommand } from './claude.js';
import { registerDownloadModelCommand } from './download-model.js';
import { registerHooksCommand } from './hooks.js';
import { registerInitCommand } from './init.js';

// Re-export types
export type { ClaudeHooksResult } from './types.js';

// Re-export templates for tests
export { AGENTS_MD_TEMPLATE } from './templates.js';

/**
 * Register all setup commands on the program.
 */
export function registerSetupCommands(program: Command): void {
  registerInitCommand(program);
  registerHooksCommand(program);
  registerClaudeCommand(program);
  registerDownloadModelCommand(program);
}
