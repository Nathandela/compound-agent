/**
 * Setup module barrel export.
 *
 * Re-exports registration functions for CLI command setup.
 */

export { registerSetupAllCommand } from './all.js';
export { playInstallBanner } from './banner.js';
export { checkBeadsAvailable, checkBeadsInitialized, checkBeadsHealthy, runFullBeadsCheck, type BeadsCheckResult, type BeadsFullCheck } from './beads-check.js';
export { ensureGitignore, type GitignoreResult } from './gitignore.js';
export { checkUserScope, type ScopeCheckResult } from './scope-check.js';
export {
  getClaudeSettingsPath,
  hasAllCompoundAgentHooks,
  hasClaudeHook,
  readClaudeSettings,
} from './claude-helpers.js';
export { printBeadsFullStatus, printScopeStatus } from './display-utils.js';
export { registerClaudeSubcommand } from './claude.js';
export { registerDownloadModelCommand } from './download-model.js';
export { processPhaseGuard } from './hooks-phase-guard.js';
export { processReadTracker } from './hooks-read-tracker.js';
export { processStopAudit } from './hooks-stop-audit.js';
export { registerHooksCommand } from './hooks.js';
export { registerInitCommand } from './init.js';
