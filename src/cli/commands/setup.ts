/**
 * Setup command - Setup integrations (Claude Code hooks)
 */

import type { Command } from 'commander';
import { existsSync } from 'node:fs';

import {
  addLearningAgentHook,
  getClaudeSettingsPath,
  hasClaudeHook,
  out,
  readClaudeSettings,
  removeLearningAgentHook,
  writeClaudeSettings,
} from '../shared.js';

/**
 * Register the setup command with the program.
 */
export function registerSetupCommand(program: Command): void {
  const setupCommand = program.command('setup').description('Setup integrations');

  setupCommand
    .command('claude')
    .description('Install Claude Code SessionStart hooks')
    .option('--global', 'Install to global ~/.claude/ instead of project')
    .option('--uninstall', 'Remove learning-agent hooks')
    .option('--dry-run', 'Show what would change without writing')
    .option('--json', 'Output as JSON')
    .action(async (options: { global?: boolean; uninstall?: boolean; dryRun?: boolean; json?: boolean }) => {
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

      // Handle uninstall
      if (options.uninstall) {
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

        const removed = removeLearningAgentHook(settings);
        if (removed) {
          await writeClaudeSettings(settingsPath, settings);
          if (options.json) {
            console.log(JSON.stringify({ installed: false, location: displayPath, action: 'removed' }));
          } else {
            out.success('Learning agent hooks removed');
            console.log(`  Location: ${displayPath}`);
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
