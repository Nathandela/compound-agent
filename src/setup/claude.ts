/**
 * Setup Claude command - Configure Claude Code SessionStart hooks.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { formatError } from '../cli-error-format.js';
import { out } from '../commands/shared.js';
import { getRepoRoot } from '../cli-utils.js';
import {
  addCompoundAgentHook,
  getClaudeSettingsPath,
  getMcpJsonPath,
  hasClaudeHook,
  hasMcpServerInMcpJson,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeCompoundAgentHook,
  removeMcpServerFromMcpJson,
  writeClaudeSettings,
} from './claude-helpers.js';

/** Status check result */
interface StatusResult {
  settingsFile: string;
  mcpFile: string;
  exists: boolean;
  validJson: boolean;
  hookInstalled: boolean;
  mcpInstalled: boolean;
  slashCommands: {
    learn: boolean;
    search: boolean;
  };
  status: 'connected' | 'partial' | 'disconnected';
}

/**
 * Register the claude subcommand on an existing setup command.
 */
export function registerClaudeSubcommand(setupCommand: Command): void {
  setupCommand
    .command('claude')
    .description('Install Claude Code SessionStart hooks')
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
        process.exit(1);
      }

      const alreadyInstalled = hasClaudeHook(settings);

      // Handle status check
      if (options.status) {
        const repoRoot = getRepoRoot();
        const learnMdPath = join(repoRoot, '.claude', 'commands', 'learn.md');
        // search replaces deprecated check-plan
        const searchMdPath = join(repoRoot, '.claude', 'commands', 'search.md');
        const mcpPath = getMcpJsonPath(repoRoot);

        const learnExists = existsSync(learnMdPath);
        const searchExists = existsSync(searchMdPath);
        const mcpExists = existsSync(mcpPath);
        const mcpInstalled = mcpExists && await hasMcpServerInMcpJson(repoRoot);

        // Determine overall status (hooks + MCP + slash commands)
        let status: 'connected' | 'partial' | 'disconnected';
        if (alreadyInstalled && mcpInstalled && learnExists && searchExists) {
          status = 'connected';
        } else if (alreadyInstalled || mcpInstalled || learnExists || searchExists) {
          status = 'partial';
        } else {
          status = 'disconnected';
        }

        const result: StatusResult = {
          settingsFile: displayPath,
          mcpFile: '.mcp.json',
          exists: existsSync(settingsPath),
          validJson: true, // We already parsed it above
          hookInstalled: alreadyInstalled,
          mcpInstalled,
          slashCommands: {
            learn: learnExists,
            search: searchExists,
          },
          status,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('Claude Code Integration Status');
          console.log('─'.repeat(40));
          console.log('');
          console.log(`Hooks file: ${displayPath}`);
          console.log(`  ${result.exists ? '[ok]' : '[missing]'} File exists`);
          console.log(`  ${result.validJson ? '[ok]' : '[error]'} Valid JSON`);
          console.log(`  ${result.hookInstalled ? '[ok]' : '[warn]'} SessionStart hook installed`);
          console.log('');
          console.log('MCP config: .mcp.json');
          console.log(`  ${mcpExists ? '[ok]' : '[missing]'} File exists`);
          console.log(`  ${mcpInstalled ? '[ok]' : '[warn]'} compound-agent MCP server`);
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
        return;
      }

      // Handle uninstall
      if (options.uninstall) {
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

        // Also remove MCP from .mcp.json
        const removedMcp = await removeMcpServerFromMcpJson(repoRoot);

        // Also remove AGENTS.md section and CLAUDE.md reference (e2r)
        const removedAgents = await removeAgentsSection(repoRoot);
        const removedClaudeMd = await removeClaudeMdReference(repoRoot);

        const anyRemoved = removedHook || removedMcp || removedAgents || removedClaudeMd;

        if (anyRemoved) {
          if (options.json) {
            console.log(JSON.stringify({
              installed: false,
              location: displayPath,
              action: 'removed',
              mcpRemoved: removedMcp,
              agentsMdRemoved: removedAgents,
              claudeMdRemoved: removedClaudeMd,
            }));
          } else {
            out.success('Compound agent removed');
            if (removedHook) {
              console.log(`  Hooks: ${displayPath}`);
            }
            if (removedMcp) {
              console.log('  MCP: .mcp.json');
            }
            if (removedAgents) {
              console.log('  AGENTS.md: Compound Agent section removed');
            }
            if (removedClaudeMd) {
              console.log('  CLAUDE.md: Compound Agent reference removed');
            }
          }
        } else {
          if (options.json) {
            console.log(JSON.stringify({ installed: false, location: displayPath, action: 'unchanged' }));
          } else {
            out.info('No compound agent hooks to remove');
            // Suggest the other scope if no hooks found
            if (options.global) {
              console.log('  Hint: Try without --global to check project settings.');
            } else {
              console.log('  Hint: Try with --global flag to check global settings.');
            }
          }
        }
        return;
      }

      // Handle install
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
            hooks: ['SessionStart'],
            action: 'unchanged',
          }));
        } else {
          out.info('Compound agent hooks already installed');
          console.log(`  Location: ${displayPath}`);
        }
        return;
      }

      // Add hook
      const fileExists = existsSync(settingsPath);
      addCompoundAgentHook(settings);
      await writeClaudeSettings(settingsPath, settings);

      if (options.json) {
        console.log(JSON.stringify({
          installed: true,
          location: displayPath,
          hooks: ['SessionStart'],
          action: fileExists ? 'updated' : 'created',
        }));
      } else {
        out.success(options.global ? 'Claude Code hooks installed (global)' : 'Claude Code hooks installed (project-level)');
        console.log(`  Location: ${displayPath}`);
        console.log('  Hook: SessionStart (startup|resume|compact)');
        console.log('');
        console.log('Lessons will be loaded automatically at session start.');
        if (!options.global) {
          console.log('');
          console.log('Note: Project hooks override global hooks.');
        }
      }
    });
}
