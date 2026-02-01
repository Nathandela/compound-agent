/**
 * CLI module exports
 *
 * Re-exports all CLI utilities and command registration functions.
 */

// Shared utilities
export * from './shared.js';

// Command registration functions
export { registerStatsCommand } from './commands/stats.js';
export { registerListCommand } from './commands/list.js';
export { registerSearchCommand } from './commands/search.js';
export { registerRebuildCommand } from './commands/rebuild.js';
export { registerExportCommand } from './commands/export.js';
export { registerImportCommand } from './commands/import.js';
export { registerCompactCommand } from './commands/compact.js';
export { registerDownloadModelCommand } from './commands/download-model.js';
export { registerShowCommand } from './commands/show.js';
export { registerUpdateCommand } from './commands/update.js';
export { registerDeleteCommand } from './commands/delete.js';
export { registerLearnCommand } from './commands/learn.js';
export { registerDetectCommand } from './commands/detect.js';
export { registerCaptureCommand } from './commands/capture.js';
export { registerInitCommand } from './commands/init.js';
export { registerHooksCommand } from './commands/hooks.js';
export { registerSetupCommand } from './commands/setup.js';
export { registerLoadSessionCommand } from './commands/load-session.js';
export { registerCheckPlanCommand } from './commands/check-plan.js';
