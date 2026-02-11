/**
 * Init command - Initialize compound-agent in a repository.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { LESSONS_PATH } from '../storage/index.js';
import { getGlobalOpts, out } from './shared.js';
import { installClaudeHooksForInit } from './setup-claude-helpers.js';
import { installPreCommitHook, type HookInstallResult } from './setup-hooks.js';
import {
  createPluginManifest,
  createSlashCommands,
  ensureClaudeMdReference,
  updateAgentsMd,
} from './setup-primitives.js';
import type { ClaudeHooksResult } from './setup-types.js';

/**
 * Create the lessons directory structure.
 */
async function createLessonsDirectory(repoRoot: string): Promise<void> {
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));
  await mkdir(lessonsDir, { recursive: true });
}

/**
 * Create empty index.jsonl if it doesn't exist.
 */
async function createIndexFile(repoRoot: string): Promise<void> {
  const indexPath = join(repoRoot, LESSONS_PATH);
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '', 'utf-8');
  }
}

/**
 * Register the init command on the program.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize compound-agent in this repository')
    .option('--skip-agents', 'Skip AGENTS.md modification')
    .option('--skip-hooks', 'Skip git hooks installation')
    .option('--skip-claude', 'Skip Claude Code hooks installation')
    .option('--json', 'Output result as JSON')
    .action(async function (this: Command, options: { skipAgents?: boolean; skipHooks?: boolean; skipClaude?: boolean; json?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      // Create directory structure
      await createLessonsDirectory(repoRoot);
      await createIndexFile(repoRoot);
      const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));

      // Update AGENTS.md unless skipped
      let agentsMdUpdated = false;
      if (!options.skipAgents) {
        agentsMdUpdated = await updateAgentsMd(repoRoot);
      }

      // Ensure CLAUDE.md has reference to AGENTS.md (lfy)
      if (!options.skipAgents) {
        await ensureClaudeMdReference(repoRoot);
      }

      // Create slash commands unless skipped (8lp, 6nw)
      let slashCommandsCreated = false;
      if (!options.skipAgents) {
        slashCommandsCreated = await createSlashCommands(repoRoot);
      }

      // Create plugin manifest (ctv)
      if (!options.skipAgents) {
        await createPluginManifest(repoRoot);
      }

      // Install git hooks unless skipped
      let hookResult: HookInstallResult | null = null;
      if (!options.skipHooks) {
        hookResult = await installPreCommitHook(repoRoot);
      }

      // Install Claude hooks unless skipped (f8a)
      let claudeHooksResult: ClaudeHooksResult = { installed: false, action: 'error', error: 'skipped' };
      if (!options.skipClaude) {
        claudeHooksResult = await installClaudeHooksForInit(repoRoot);
      }

      // Output
      if (options.json) {
        // claudeHooks: true only if we actually installed (not already_installed)
        const claudeHooksInstalled = claudeHooksResult.action === 'installed';
        // hooks: true if we installed or appended (made changes)
        const hooksChanged = hookResult?.status === 'installed' || hookResult?.status === 'appended';
        console.log(JSON.stringify({
          initialized: true,
          lessonsDir,
          agentsMd: agentsMdUpdated,
          slashCommands: slashCommandsCreated || !options.skipAgents,
          hooks: hooksChanged,
          hookStatus: hookResult?.status ?? 'skipped',
          claudeHooks: claudeHooksInstalled,
        }));
      } else if (!quiet) {
        out.success('Compound agent initialized');
        console.log(`  Lessons directory: ${lessonsDir}`);
        if (agentsMdUpdated) {
          console.log('  AGENTS.md: Updated with Compound Agent section');
        } else if (options.skipAgents) {
          console.log('  AGENTS.md: Skipped (--skip-agents)');
        } else {
          console.log('  AGENTS.md: Already has Compound Agent section');
        }
        if (slashCommandsCreated) {
          console.log('  Slash commands: Created (/learn, /check-plan, /list, /prime)');
        } else if (options.skipAgents) {
          console.log('  Slash commands: Skipped (--skip-agents)');
        } else {
          console.log('  Slash commands: Already exist');
        }
        if (options.skipHooks) {
          console.log('  Git hooks: Skipped (--skip-hooks)');
        } else if (hookResult?.status === 'installed') {
          console.log('  Git hooks: Installed');
        } else if (hookResult?.status === 'appended') {
          console.log('  Git hooks: Appended to existing pre-commit hook');
        } else if (hookResult?.status === 'already_installed') {
          console.log('  Git hooks: Already installed');
        } else if (hookResult?.status === 'not_git_repo') {
          console.log('  Git hooks: Skipped (not a git repository)');
        }
        // Claude hooks status
        if (options.skipClaude) {
          console.log('  Claude hooks: Skipped (--skip-claude)');
        } else if (claudeHooksResult.action === 'installed') {
          console.log('  Claude hooks: Installed to .claude/settings.json');
        } else if (claudeHooksResult.action === 'already_installed') {
          console.log('  Claude hooks: Already installed');
        } else if (claudeHooksResult.error) {
          console.log(`  Claude hooks: Error - ${claudeHooksResult.error}`);
        }
      }
    });
}
