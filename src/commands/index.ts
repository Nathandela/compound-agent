/**
 * Command modules for CLI.
 *
 * Each module exports a registration function that adds commands to the program.
 */

export { registerCaptureCommands } from './capture.js';
export { getPrimeContext, registerManagementCommands } from './management/index.js';
export { registerRemindCaptureCommand } from './remind-capture.js';
export { registerRetrievalCommands } from './retrieval.js';
export { registerSetupCommands } from './setup/index.js';
export type { ClaudeHooksResult } from './setup/index.js';

// Re-export shared utilities for use by cli.ts
export { getGlobalOpts, out } from './shared.js';
export type { GlobalOpts } from './shared.js';
