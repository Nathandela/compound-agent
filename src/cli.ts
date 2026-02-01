#!/usr/bin/env node
/**
 * Learning Agent CLI
 *
 * Entry point that registers all commands from the cli module.
 *
 * Commands:
 *   init             - Initialize learning-agent in a repository
 *   learn <insight>  - Capture a new lesson
 *   search <query>   - Search lessons by keyword
 *   list             - List all lessons
 *   detect --input   - Detect learning triggers from input
 *   capture          - Capture lesson from trigger/insight or input file
 *   compact          - Archive old lessons and remove tombstones
 *   load-session     - Load high-severity lessons for session context
 *   check-plan       - Check plan against relevant lessons
 *   setup            - Setup integrations (Claude Code hooks)
 *   hooks            - Git hooks management
 *   stats            - Show statistics
 *   show             - Show a specific lesson
 *   update           - Update a lesson
 *   delete           - Delete a lesson
 *   rebuild          - Rebuild the SQLite index
 *   export           - Export lessons to JSON
 *   import           - Import lessons from JSON
 *   download-model   - Download the embedding model
 */

import { Command } from 'commander';

import {
  registerCaptureCommand,
  registerCheckPlanCommand,
  registerCompactCommand,
  registerDeleteCommand,
  registerDetectCommand,
  registerDownloadModelCommand,
  registerExportCommand,
  registerHooksCommand,
  registerImportCommand,
  registerInitCommand,
  registerLearnCommand,
  registerListCommand,
  registerLoadSessionCommand,
  registerRebuildCommand,
  registerSearchCommand,
  registerSetupCommand,
  registerShowCommand,
  registerStatsCommand,
  registerUpdateCommand,
} from './cli/index.js';
import { VERSION } from './index.js';

// ============================================================================
// Program Setup
// ============================================================================

const program = new Command();

program
  .name('learning-agent')
  .description('Learning system for Claude Code session memory')
  .version(VERSION)
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Minimal output');

// ============================================================================
// Register Commands
// ============================================================================

// Core commands
registerInitCommand(program);
registerLearnCommand(program);
registerCaptureCommand(program);
registerDetectCommand(program);

// CRUD operations
registerListCommand(program);
registerSearchCommand(program);
registerShowCommand(program);
registerUpdateCommand(program);
registerDeleteCommand(program);

// Session and plan commands
registerLoadSessionCommand(program);
registerCheckPlanCommand(program);

// Maintenance commands
registerStatsCommand(program);
registerRebuildCommand(program);
registerCompactCommand(program);

// Data management
registerExportCommand(program);
registerImportCommand(program);
registerDownloadModelCommand(program);

// Integration commands
registerSetupCommand(program);
registerHooksCommand(program);

// ============================================================================
// Run
// ============================================================================

program.parse();
