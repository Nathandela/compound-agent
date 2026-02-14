/**
 * Setup module barrel export.
 *
 * Re-exports registration functions for CLI command setup.
 */

export { registerSetupAllCommand } from './all.js';
export { registerClaudeSubcommand } from './claude.js';
export { registerDownloadModelCommand } from './download-model.js';
export { registerHooksCommand } from './hooks.js';
export { registerInitCommand } from './init.js';
