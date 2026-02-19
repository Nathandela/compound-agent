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
  hasAllCompoundAgentHooks,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeCompoundAgentHook,
  writeClaudeSettings,
} from './claude-helpers.js';

/** Status check result */
interface StatusResult {
  settingsFile: string;
  exists: boolean;
  validJson: boolean;
  hookInstalled: boolean;
  slashCommands: {
    learn: boolean;
    search: boolean;
  };
  status: 'connected' | 'partial' | 'disconnected';
}

// ============================================================================
// Action helpers
// ============================================================================

async function handleStatus(
  alreadyInstalled: boolean,
  displayPath: string,
  settingsPath: string,
  options: { json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();
  const learnMdPath = join(repoRoot, '.claude', 'commands', 'learn.md');
  const searchMdPath = join(repoRoot, '.claude', 'commands', 'search.md');

  const learnExists = existsSync(learnMdPath);
  const searchExists = existsSync(searchMdPath);

  let status: 'connected' | 'partial' | 'disconnected';
  if (alreadyInstalled && learnExists && searchExists) {
    status = 'connected';
  } else if (alreadyInstalled || learnExists || searchExists) {
    status = 'partial';
  } else {
    status = 'disconnected';
  }

  const result: StatusResult = {
    settingsFile: displayPath,
    exists: existsSync(settingsPath),
    validJson: true,
    hookInstalled: alreadyInstalled,
    slashCommands: { learn: learnExists, search: searchExists },
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
  console.log(`  ${result.hookInstalled ? '[ok]' : '[warn]'} Compound Agent hooks installed`);
  console.log('');
  console.log('Slash commands:');
  console.log(`  ${learnExists ? '[ok]' : '[warn]'} /learn command`);
  console.log(`  ${searchExists ? '[ok]' : '[warn]'} /search command`);
  console.log('');

  if (status === 'connected') {
    out.success('All checks passed. Integration is connected.');
  } else if (status === 'partial') {
    out.warn('Partial setup detected.');
    console.log('');
    console.log("Run 'npx ca setup' to complete setup.");
  } else {
    out.error('Not connected.');
    console.log('');
    console.log("Run 'npx ca setup' to set up Compound Agent.");
  }
}

async function handleUninstall(
  settings: Record<string, unknown>,
  settingsPath: string,
  alreadyInstalled: boolean,
  displayPath: string,
  options: { global?: boolean; dryRun?: boolean; json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();

  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, wouldRemove: alreadyInstalled, location: displayPath }));
    } else {
      if (alreadyInstalled) {
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
  alreadyInstalled: boolean,
  displayPath: string,
  options: { global?: boolean; dryRun?: boolean; json?: boolean }
): Promise<void> {
  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, wouldInstall: !alreadyInstalled, location: displayPath }));
    } else {
      if (alreadyInstalled) {
        console.log('Compound agent hooks already installed');
      } else {
        console.log(`Would install compound-agent hooks to ${displayPath}`);
      }
    }
    return;
  }

  if (alreadyInstalled) {
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

  const fileExists = existsSync(settingsPath);
  addAllCompoundAgentHooks(settings);
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

      const alreadyInstalled = hasAllCompoundAgentHooks(settings);

      if (options.status) {
        await handleStatus(alreadyInstalled, displayPath, settingsPath, options);
      } else if (options.uninstall) {
        await handleUninstall(settings, settingsPath, alreadyInstalled, displayPath, options);
      } else {
        await handleInstall(settings, settingsPath, alreadyInstalled, displayPath, options);
      }
    });
}
