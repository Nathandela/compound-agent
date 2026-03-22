/**
 * Setup Claude command - Configure Claude Code SessionStart hooks.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatError } from '../cli-error-format.js';
import { out } from '../commands/index.js';
import { getRepoRoot } from '../cli-utils.js';
import {
  addAllCompoundAgentHooks,
  getClaudeSettingsPath,
  getCompoundAgentHookStatus,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeCompoundAgentHook,
  hasClaudeHook,
  writeClaudeSettings,
} from './claude-helpers.js';
import { resolveHookRunnerPath } from './hook-runner-resolve.js';
import type { CompoundAgentHookStatus } from './claude-helpers.js';

/** Status check result */
interface StatusResult {
  settingsFile: string;
  exists: boolean;
  validJson: boolean;
  hookInstalled: boolean;
  hookNeedsMigration: boolean;
  hookIncomplete: boolean;
  slashCommands: {
    learnThat: boolean;
    checkThat: boolean;
  };
  status: 'connected' | 'partial' | 'disconnected';
}

// ============================================================================
// Action helpers
// ============================================================================

async function handleStatus(
  hookStatus: CompoundAgentHookStatus,
  displayPath: string,
  settingsPath: string,
  options: { json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();
  const learnThatMdPath = join(repoRoot, '.claude', 'commands', 'compound', 'learn-that.md');
  const checkThatMdPath = join(repoRoot, '.claude', 'commands', 'compound', 'check-that.md');

  const learnThatExists = existsSync(learnThatMdPath);
  const checkThatExists = existsSync(checkThatMdPath);

  let status: 'connected' | 'partial' | 'disconnected';
  if (hookStatus.hasAllDesiredHooks && learnThatExists && checkThatExists) {
    status = 'connected';
  } else if (hookStatus.hasAnyManagedHooks || learnThatExists || checkThatExists) {
    status = 'partial';
  } else {
    status = 'disconnected';
  }

  const result: StatusResult = {
    settingsFile: displayPath,
    exists: existsSync(settingsPath),
    validJson: true,
    hookInstalled: hookStatus.hasAllDesiredHooks,
    hookNeedsMigration: hookStatus.needsMigration,
    hookIncomplete: hookStatus.hasIncompleteHooks,
    slashCommands: { learnThat: learnThatExists, checkThat: checkThatExists },
    status,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Claude Code Integration Status');
  console.log('\u2500'.repeat(40));
  console.log('');
  console.log(`Hooks file: ${displayPath}`);
  console.log(`  ${result.exists ? '[ok]' : '[missing]'} File exists`);
  console.log(`  ${result.validJson ? '[ok]' : '[error]'} Valid JSON`);
  if (result.hookInstalled) {
    console.log('  [ok] Compound Agent hooks installed');
  } else if (result.hookIncomplete) {
    console.log('  [warn] Compound Agent hooks are incomplete');
  } else if (result.hookNeedsMigration) {
    console.log('  [warn] Compound Agent hooks need update');
  } else {
    console.log('  [warn] Compound Agent hooks not installed');
  }
  console.log('');
  console.log('Slash commands:');
  console.log(`  ${learnThatExists ? '[ok]' : '[warn]'} /compound:learn-that command`);
  console.log(`  ${checkThatExists ? '[ok]' : '[warn]'} /compound:check-that command`);
  console.log('');

  if (status === 'connected') {
    out.success('All checks passed. Integration is connected.');
  } else if (status === 'partial') {
    out.warn('Partial setup detected.');
    console.log('');
    if (result.hookIncomplete) {
      console.log("Run 'npx ca setup claude' to repair the missing hook entries.");
    } else if (result.hookNeedsMigration) {
      console.log("Run 'npx ca setup claude' to migrate hooks to the current runner.");
    } else {
      console.log("Run 'npx ca setup' to complete setup.");
    }
  } else {
    out.error('Not connected.');
    console.log('');
    console.log("Run 'npx ca setup' to set up Compound Agent.");
  }
}

async function handleUninstall(
  settings: Record<string, unknown>,
  settingsPath: string,
  hasManagedHook: boolean,
  displayPath: string,
  options: { global?: boolean; dryRun?: boolean; json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, wouldRemove: hasManagedHook, location: displayPath }));
    } else {
      if (hasManagedHook) {
        console.log(`Would remove compound-agent hooks from ${displayPath}`);
      } else {
        console.log('No compound-agent hooks to remove');
      }
    }
    return;
  }

  const removedHook = removeCompoundAgentHook(settings);
  if (removedHook) {
    await writeClaudeSettings(settingsPath, settings);
  }

  const removedAgents = await removeAgentsSection(repoRoot);
  const removedClaudeMd = await removeClaudeMdReference(repoRoot);

  const anyRemoved = removedHook || removedAgents || removedClaudeMd;

  if (anyRemoved) {
    if (options.json) {
      console.log(JSON.stringify({
        installed: false,
        location: displayPath,
        action: 'removed',
        agentsMdRemoved: removedAgents,
        claudeMdRemoved: removedClaudeMd,
      }));
    } else {
      out.success('Compound agent removed');
      if (removedHook) console.log(`  Hooks: ${displayPath}`);
      if (removedAgents) console.log('  AGENTS.md: Compound Agent section removed');
      if (removedClaudeMd) console.log('  CLAUDE.md: Compound Agent reference removed');
    }
  } else {
    if (options.json) {
      console.log(JSON.stringify({ installed: false, location: displayPath, action: 'unchanged' }));
    } else {
      out.info('No compound agent hooks to remove');
      if (options.global) {
        console.log('  Hint: Try without --global to check project settings.');
      } else {
        console.log('  Hint: Try with --global flag to check global settings.');
      }
    }
  }
}

async function handleInstall(
  settings: Record<string, unknown>,
  settingsPath: string,
  displayPath: string,
  options: { global?: boolean; dryRun?: boolean; json?: boolean }
): Promise<void> {
  const fileExists = existsSync(settingsPath);
  const hookRunnerPath = resolveHookRunnerPath();
  const before = JSON.stringify(settings);
  addAllCompoundAgentHooks(settings, hookRunnerPath);
  const changed = JSON.stringify(settings) !== before;

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, wouldInstall: changed, location: displayPath }));
    } else {
      if (!changed) {
        console.log('Compound agent hooks already installed');
      } else {
        console.log(`Would install compound-agent hooks to ${displayPath}`);
      }
    }
    return;
  }

  if (!changed) {
    if (options.json) {
      console.log(JSON.stringify({
        installed: true,
        location: displayPath,
        hooks: ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse', 'PreToolUse', 'Stop'],
        action: 'unchanged',
      }));
    } else {
      out.info('Compound agent hooks already installed');
      console.log(`  Location: ${displayPath}`);
    }
    return;
  }

  await writeClaudeSettings(settingsPath, settings);

  if (options.json) {
    console.log(JSON.stringify({
      installed: true,
      location: displayPath,
      hooks: ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse', 'PreToolUse', 'Stop'],
      action: fileExists ? 'updated' : 'created',
    }));
  } else {
    out.success(options.global ? 'Claude Code hooks installed (global)' : 'Claude Code hooks installed (project-level)');
    console.log(`  Location: ${displayPath}`);
    console.log('  Hooks: SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse, PreToolUse, Stop');
    console.log('');
    console.log('Lessons will be loaded automatically at session start.');
    if (!options.global) {
      console.log('');
      console.log('Note: Project hooks override global hooks.');
    }
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the claude subcommand on an existing setup command.
 */
export function registerClaudeSubcommand(setupCommand: Command): void {
  setupCommand
    .command('claude')
    .description('Install Claude Code hooks')
    .option('--global', 'Install to global ~/.claude/ instead of project')
    .option('--uninstall', 'Remove compound-agent hooks')
    .option('--status', 'Check status of Claude Code integration')
    .option('--dry-run', 'Show what would change without writing')
    .option('--json', 'Output as JSON')
    .action(async (options: { global?: boolean; uninstall?: boolean; status?: boolean; dryRun?: boolean; json?: boolean }) => {
      const settingsPath = getClaudeSettingsPath(options.global ?? false);
      const displayPath = options.global ? '~/.claude/settings.json' : '.claude/settings.json';

      let settings: Record<string, unknown>;
      try {
        settings = await readClaudeSettings(settingsPath);
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Failed to parse settings file' }));
        } else {
          console.error(formatError('setup', 'PARSE_ERROR', 'Failed to parse settings file', 'Check if JSON is valid'));
        }
        process.exitCode = 1;
        return;
      }

      const hookRunnerPath = resolveHookRunnerPath();
      const hookStatus = getCompoundAgentHookStatus(settings, hookRunnerPath);
      const hasManagedHook = hasClaudeHook(settings);

      if (options.status) {
        await handleStatus(hookStatus, displayPath, settingsPath, options);
      } else if (options.uninstall) {
        await handleUninstall(settings, settingsPath, hasManagedHook, displayPath, options);
      } else {
        await handleInstall(settings, settingsPath, displayPath, options);
      }
    });
}
