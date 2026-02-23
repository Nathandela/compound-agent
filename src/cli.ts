#!/usr/bin/env node
/**
 * Compound Agent CLI
 *
 * Semantically-intelligent workflow plugin for Claude Code.
 *
 * Commands:
 *   Capture:    learn, capture, detect
 *   Retrieval:  search, list, check-plan, load-session
 *   Management: wrong, validate, compact, stats, rebuild, export, import, show, update, delete
 *   Setup:      init, setup claude, hooks, download-model
 *   Reviewer:   reviewer enable, reviewer disable, reviewer list
 *   Loop:       loop
 *   Health:     doctor
 */

import { Command } from 'commander';

import { registerCompoundCommands } from './commands/compound.js';
import {
  registerCaptureCommands,
  registerLoopCommands,
  registerManagementCommands,
  registerPhaseCheckCommand,
  registerRetrievalCommands,
  registerSetupCommands,
} from './commands/index.js';
import { VERSION } from './version.js';
import { getRepoRoot } from './cli-utils.js';
import { commandNeedsSqlite } from './cli-preflight.js';
import { closeDb, ensureSqliteAvailable } from './memory/storage/index.js';
import { printNativeBuildDiagnostic } from './native-diagnostic.js';

// ============================================================================
// Resource Cleanup
// ============================================================================

/**
 * Cleanup function to release database resources.
 * Safe to call even if database was never opened.
 *
 * Note: We only close the SQLite database here. The embedding model
 * (node-llama-cpp) handles its own cleanup and calling unloadEmbedding()
 * during signal handlers can cause issues with the native addon.
 */
function cleanup(): void {
  try {
    closeDb();
  } catch {
    // Ignore errors - database may never have been opened
  }
}

// Register cleanup for interrupt signals only (not 'exit')
// The 'exit' handler can interfere with normal process shutdown
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// ============================================================================
// Program Setup
// ============================================================================

const program = new Command();

// Add global options
program
  .option('-v, --verbose', 'Show detailed output')
  .option('-q, --quiet', 'Suppress non-essential output');

program
  .name('ca')
  .description('Semantically-intelligent workflow plugin for Claude Code')
  .version(VERSION);

// ============================================================================
// Register Command Modules
// ============================================================================

registerCaptureCommands(program);
registerRetrievalCommands(program);
registerManagementCommands(program);
registerSetupCommands(program);
registerCompoundCommands(program);
registerLoopCommands(program);
registerPhaseCheckCommand(program);

// ============================================================================
// Native Module Preflight Check
// ============================================================================

program.hook('preAction', (_thisCommand, actionCommand) => {
  if (!commandNeedsSqlite(actionCommand)) return;

  try {
    ensureSqliteAvailable();
  } catch (err) {
    // Pass repo root for accurate package manager detection from subdirectories
    let root: string | undefined;
    try { root = getRepoRoot(); } catch { /* fallback to cwd via default param */ }
    printNativeBuildDiagnostic(err, root);
    process.exit(1);
  }
});

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
