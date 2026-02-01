#!/usr/bin/env node
/**
 * Learning Agent CLI
 *
 * Repository-scoped learning system for Claude Code.
 *
 * Commands:
 *   Capture:    learn, capture, detect
 *   Retrieval:  search, list, check-plan, load-session
 *   Management: wrong, validate, compact, stats, rebuild, export, import, show, update, delete
 *   Setup:      init, setup claude, hooks, download-model
 */

import { Command } from 'commander';

import {
  registerCaptureCommands,
  registerManagementCommands,
  registerRetrievalCommands,
  registerSetupCommands,
} from './commands/index.js';
import { VERSION } from './index.js';

// ============================================================================
// Program Setup
// ============================================================================

const program = new Command();

// Add global options
program
  .option('-v, --verbose', 'Show detailed output')
  .option('-q, --quiet', 'Suppress non-essential output');

program
  .name('learning-agent')
  .description('Repository-scoped learning system for Claude Code')
  .version(VERSION);

// ============================================================================
// Register Command Modules
// ============================================================================

registerCaptureCommands(program);
registerRetrievalCommands(program);
registerManagementCommands(program);
registerSetupCommands(program);

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
