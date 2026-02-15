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
 */

import { Command } from 'commander';

import { registerCompoundCommands } from './commands/compound.js';
import {
  registerCaptureCommands,
  registerManagementCommands,
  registerRetrievalCommands,
  registerSetupCommands,
} from './commands/index.js';
import { VERSION } from './index.js';
import { closeDb } from './memory/storage/index.js';

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

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
