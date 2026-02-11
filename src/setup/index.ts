/**
 * Setup command modules.
 *
 * Re-exports the registration functions used by the CLI command index.
 */

export { registerSetupAllCommand } from './all.js';
export { registerClaudeSubcommand } from './claude.js';
export { registerDownloadModelCommand } from './download-model.js';
export { registerHooksCommand } from './hooks.js';
export { registerInitCommand } from './init.js';

// Re-export types and helpers consumed by other modules
export type { ClaudeHooksResult } from './types.js';
export type { HookInstallResult } from './hooks.js';
