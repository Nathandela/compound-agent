import { join } from 'node:path';

import { Command } from 'commander';

import { registerCompoundCommands } from './commands/compound.js';
import {
  registerCaptureCommands,
  registerManagementCommands,
  registerPhaseCheckCommand,
  registerRetrievalCommands,
  registerSetupCommands,
} from './commands/index.js';
import { registerImproveCommands } from './commands/improve.js';
import { registerLoopCommands } from './commands/loop.js';
import { registerWatchCommand } from './commands/watch.js';
import { VERSION } from './version.js';
import { getRepoRoot } from './cli-utils.js';
import { type UpdateCheckResult, checkForUpdate, formatUpdateNotification, shouldCheckForUpdate } from './update-check.js';
import { commandNeedsSqlite } from './cli-preflight.js';
import { unloadEmbeddingResources } from './memory/embeddings/index.js';
import { closeDb, ensureSqliteAvailable } from './memory/storage/index.js';
import { printNativeBuildDiagnostic } from './native-diagnostic.js';

/**
 * Release heavyweight CLI resources.
 *
 * Safe to call repeatedly even if the resources were never initialized.
 */
export async function cleanupCliResources(): Promise<void> {
  try {
    await unloadEmbeddingResources();
  } catch {
    // Ignore cleanup errors during shutdown.
  }

  try {
    closeDb();
  } catch {
    // Ignore errors - database may never have been opened.
  }
}

/**
 * Attach signal handlers that release resources before exiting.
 */
export function attachSignalHandlers(): void {
  const handleSignal = (exitCode: number) => {
    void cleanupCliResources().finally(() => process.exit(exitCode));
  };

  process.on('SIGINT', () => handleSignal(0));
  process.on('SIGTERM', () => handleSignal(0));
}

/**
 * Build the configured CLI program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .option('-v, --verbose', 'Show detailed output')
    .option('-q, --quiet', 'Suppress non-essential output');

  program
    .name('ca')
    .description('Semantically-intelligent workflow plugin for Claude Code')
    .version(VERSION);

  registerCaptureCommands(program);
  registerRetrievalCommands(program);
  registerManagementCommands(program);
  registerSetupCommands(program);
  registerCompoundCommands(program);
  registerImproveCommands(program);
  registerLoopCommands(program);
  registerWatchCommand(program);
  registerPhaseCheckCommand(program);

  program.hook('preAction', (_thisCommand, actionCommand) => {
    if (!commandNeedsSqlite(actionCommand)) return;

    try {
      ensureSqliteAvailable();
    } catch (err) {
      let root: string | undefined;
      try {
        root = getRepoRoot();
      } catch {
        // Fall back to cwd inside printNativeBuildDiagnostic.
      }
      printNativeBuildDiagnostic(err, root);
      process.exit(1);
    }
  });

  return program;
}

/**
 * Parse CLI arguments and always release resources before returning.
 */
export async function runProgram(program: Command, argv: readonly string[] = process.argv): Promise<void> {
  // Start update check concurrently with command execution (TTY only).
  // Fired before parseAsync so the fetch runs in parallel with the command.
  let updatePromise: Promise<UpdateCheckResult | null> | null = null;
  if (shouldCheckForUpdate()) {
    try {
      const cacheDir = join(getRepoRoot(), '.claude', '.cache');
      updatePromise = checkForUpdate(cacheDir);
    } catch {
      // getRepoRoot() can fail outside a git repo -- update check is non-critical.
    }
  }

  try {
    await program.parseAsync(argv);

    if (updatePromise) {
      try {
        const result = await updatePromise;
        if (result?.updateAvailable) {
          console.log(formatUpdateNotification(result.current, result.latest));
        }
      } catch {
        // Never let update check break the CLI.
      }
    }
  } finally {
    await cleanupCliResources();
  }
}
