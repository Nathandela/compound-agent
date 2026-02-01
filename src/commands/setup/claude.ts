/**
 * Setup Claude command - Configure Claude Code SessionStart hooks.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { out } from '../shared.js';
import { getRepoRoot } from '../../cli-utils.js';
import {
  addLearningAgentHook,
  getClaudeSettingsPath,
  hasClaudeHook,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeLearningAgentHook,
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
    checkPlan: boolean;
  };
  status: 'connected' | 'partial' | 'disconnected';
}

/**
 * Register the setup claude command on the program.
 */
export function registerClaudeCommand(program: Command): void {
  const setupCommand = program.command('setup').description('Setup integrations');

  setupCommand
    .command('claude')
    .description('Install Claude Code SessionStart hooks')
    .option('--global', 'Install to global ~/.claude/ instead of project')
    .option('--uninstall', 'Remove learning-agent hooks')
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
          out.error('Failed to parse settings file. Check if JSON is valid.');
        }
        process.exit(1);
      }

      const alreadyInstalled = hasClaudeHook(settings);

      // Handle status check
      if (options.status) {
        const repoRoot = getRepoRoot();
        const learnMdPath = join(repoRoot, '.claude', 'commands', 'learn.md');
        const checkPlanMdPath = join(repoRoot, '.claude', 'commands', 'check-plan.md');

        const learnExists = existsSync(learnMdPath);
        const checkPlanExists = existsSync(checkPlanMdPath);

        // Determine overall status
        let status: 'connected' | 'partial' | 'disconnected';
        if (alreadyInstalled && learnExists && checkPlanExists) {
          status = 'connected';
        } else if (alreadyInstalled || learnExists || checkPlanExists) {
          status = 'partial';
        } else {
          status = 'disconnected';
        }

        const result: StatusResult = {
          settingsFile: displayPath,
          exists: existsSync(settingsPath),
          validJson: true, // We already parsed it above
          hookInstalled: alreadyInstalled,
          slashCommands: {
            learn: learnExists,
            checkPlan: checkPlanExists,
          },
          status,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('Claude Code Integration Status');
          console.log('─'.repeat(40));
          console.log('');
          console.log(`Settings file: ${displayPath}`);
          console.log(`  ${result.exists ? '[ok]' : '[missing]'} File exists`);
          console.log(`  ${result.validJson ? '[ok]' : '[error]'} Valid JSON`);
          console.log(`  ${result.hookInstalled ? '[ok]' : '[warn]'} SessionStart hook installed`);
          console.log('');
          console.log('Slash commands:');
          console.log(`  ${learnExists ? '[ok]' : '[warn]'} /learn command`);
          console.log(`  ${checkPlanExists ? '[ok]' : '[warn]'} /check-plan command`);
          console.log('');

          if (status === 'connected') {
            out.success('All checks passed. Integration is connected.');
          } else if (status === 'partial') {
            out.warn('Partial setup detected.');
            console.log('');
            console.log("Run 'npx lna init' to complete setup.");
          } else {
            out.error('Not connected.');
            console.log('');
            console.log("Run 'npx lna init' to set up Learning Agent.");
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
              console.log(`Would remove learning-agent hooks from ${displayPath}`);
            } else {
              console.log('No learning-agent hooks to remove');
            }
          }
          return;
        }

        const removedHook = removeLearningAgentHook(settings);
        if (removedHook) {
          await writeClaudeSettings(settingsPath, settings);
        }

        // Also remove AGENTS.md section and CLAUDE.md reference (e2r)
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
            out.success('Learning agent hooks removed');
            if (removedHook) {
              console.log(`  Settings: ${displayPath}`);
            }
            if (removedAgents) {
              console.log('  AGENTS.md: Learning Agent section removed');
            }
            if (removedClaudeMd) {
              console.log('  CLAUDE.md: Learning Agent reference removed');
            }
          }
        } else {
          if (options.json) {
            console.log(JSON.stringify({ installed: false, location: displayPath, action: 'unchanged' }));
          } else {
            out.info('No learning agent hooks to remove');
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
            console.log('Learning agent hooks already installed');
          } else {
            console.log(`Would install learning-agent hooks to ${displayPath}`);
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
          out.info('Learning agent hooks already installed');
          console.log(`  Location: ${displayPath}`);
        }
        return;
      }

      // Add hook
      const fileExists = existsSync(settingsPath);
      addLearningAgentHook(settings);
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
