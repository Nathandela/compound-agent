/**
 * Init command - Initialize compound-agent in a repository.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { LESSONS_PATH } from '../memory/storage/index.js';
import { getGlobalOpts, out } from '../commands/index.js';
import { installClaudeHooksForInit } from './claude-helpers.js';
import { installPreCommitHook, type HookInstallResult } from './hooks.js';
import {
  createPluginManifest,
  ensureClaudeMdReference,
  installAgentRoleSkills,
  installAgentTemplates,
  installPhaseSkills,
  installWorkflowCommands,
  updateAgentsMd,
} from './primitives.js';
import type { ClaudeHooksResult } from './types.js';

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

// ============================================================================
// Action Handler
// ============================================================================

async function initAction(
  cmd: Command,
  options: { skipAgents?: boolean; skipHooks?: boolean; skipClaude?: boolean; json?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();
  const { quiet } = getGlobalOpts(cmd);

  await createLessonsDirectory(repoRoot);
  await createIndexFile(repoRoot);
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));

  let agentsMdUpdated = false;
  if (!options.skipAgents) {
    agentsMdUpdated = await updateAgentsMd(repoRoot);
  }

  if (!options.skipAgents) {
    await ensureClaudeMdReference(repoRoot);
  }

  if (!options.skipAgents) {
    await createPluginManifest(repoRoot);
    await installAgentTemplates(repoRoot);
    await installWorkflowCommands(repoRoot);
    await installPhaseSkills(repoRoot);
    await installAgentRoleSkills(repoRoot);
  }

  let hookResult: HookInstallResult | null = null;
  if (!options.skipHooks) {
    hookResult = await installPreCommitHook(repoRoot);
  }

  let claudeHooksResult: ClaudeHooksResult = { installed: false, action: 'error', error: 'skipped' };
  if (!options.skipClaude) {
    claudeHooksResult = await installClaudeHooksForInit(repoRoot);
  }

  if (options.json) {
    const claudeHooksInstalled = claudeHooksResult.action === 'installed';
    const hooksChanged = hookResult?.status === 'installed' || hookResult?.status === 'appended';
    console.log(JSON.stringify({
      initialized: true,
      lessonsDir,
      agentsMd: agentsMdUpdated,
      hooks: hooksChanged,
      hookStatus: hookResult?.status ?? 'skipped',
      claudeHooks: claudeHooksInstalled,
    }));
    return;
  }

  if (quiet) return;

  out.success('Compound agent initialized');
  console.log(`  Lessons directory: ${lessonsDir}`);
  printAgentsMdStatus(agentsMdUpdated, options.skipAgents);
  printHookStatus(hookResult, options.skipHooks);
  printClaudeHooksStatus(claudeHooksResult, options.skipClaude);
}

function printAgentsMdStatus(updated: boolean, skipped?: boolean): void {
  if (updated) {
    console.log('  AGENTS.md: Updated with Compound Agent section');
  } else if (skipped) {
    console.log('  AGENTS.md: Skipped (--skip-agents)');
  } else {
    console.log('  AGENTS.md: Already has Compound Agent section');
  }
}

function printHookStatus(hookResult: HookInstallResult | null, skipped?: boolean): void {
  if (skipped) {
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
}

function printClaudeHooksStatus(result: ClaudeHooksResult, skipped?: boolean): void {
  if (skipped) {
    console.log('  Claude hooks: Skipped (--skip-claude)');
  } else if (result.action === 'installed') {
    console.log('  Claude hooks: Installed to .claude/settings.json');
  } else if (result.action === 'already_installed') {
    console.log('  Claude hooks: Already installed');
  } else if (result.error) {
    console.log(`  Claude hooks: Error - ${result.error}`);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

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
      await initAction(this, options);
    });
}
