/**
 * Command modules for CLI.
 *
 * Each module exports a registration function that adds commands to the program.
 */

import type { Command } from 'commander';

import {
  registerClaudeSubcommand,
  registerGeminiSubcommand,
  registerDownloadModelCommand,
  registerHooksCommand,
  registerInitCommand,
  registerSetupAllCommand,
} from '../setup/index.js';

import { registerCrudCommands } from './management-crud.js';
import { registerDoctorCommand } from './doctor.js';
import { registerInvalidationCommands } from './management-invalidation.js';
import { registerIOCommands } from './management-io.js';
import { registerMaintenanceCommands } from './management-maintenance.js';
import { registerPrimeCommand } from './management-prime.js';
import { registerAuditCommands } from './audit.js';
import { registerReviewerCommand } from './reviewer.js';
import { registerRulesCommands } from './rules.js';
import { registerTestSummaryCommand } from './test-summary.js';
import { registerVerifyGatesCommand } from './verify-gates.js';
import { registerAboutCommand } from './about.js';
import { registerFeedbackCommand } from './feedback.js';
import { registerKnowledgeCommand } from './knowledge.js';
import { registerKnowledgeIndexCommand } from './knowledge-index.js';
import { registerCleanLessonsCommand } from './clean-lessons.js';
import { registerInstallBeadsCommand } from './install-beads.js';


export { registerCaptureCommands } from './capture.js';
export { expectedGateForPhase, getPhaseState, registerPhaseCheckCommand, updatePhaseState } from './phase-check.js';
export { registerRetrievalCommands } from './retrieval.js';

// Re-export types and helpers from management modules
export { formatLessonHuman } from './management-helpers.js';
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
  registerGeminiSubcommand(setupCommand);

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
  registerDoctorCommand(program);
  registerReviewerCommand(program);
  registerRulesCommands(program);
  registerTestSummaryCommand(program);
  registerVerifyGatesCommand(program);
  registerAboutCommand(program);
  registerFeedbackCommand(program);
  registerKnowledgeCommand(program);
  registerKnowledgeIndexCommand(program);
  registerCleanLessonsCommand(program);
  registerInstallBeadsCommand(program);

  // Deprecation stub: worktree feature removed (superseded by Claude Code native EnterWorktree)
  program.command('worktree').description('(removed) Use Claude Code native worktree support').action(() => {
    console.error('ca worktree has been removed. Use Claude Code\'s native EnterWorktree support instead.');
    process.exitCode = 1;
  });
}
