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
import { playInstallBanner } from './banner.js';
import { runFullBeadsCheck, type BeadsFullCheck } from './beads-check.js';
import { printBeadsFullStatus, printGitignoreStatus, printScopeStatus } from './display-utils.js';
import { installClaudeHooksForInit } from './claude-helpers.js';
import { ensureGitignore, type GitignoreResult } from './gitignore.js';
import { installPreCommitHook, installPostCommitHook, type HookInstallResult } from './hooks.js';
import {
  createPluginManifest,
  ensureClaudeMdReference,
  ensurePnpmBuildConfig,
  installAgentRoleSkills,
  installAgentTemplates,
  installDocTemplates,
  installPhaseSkills,
  installResearchDocs,
  installWorkflowCommands,
  updateAgentsMd,
  type PnpmConfigResult,
} from './primitives.js';
import { checkUserScope } from './scope-check.js';
import type { ClaudeHooksResult } from './types.js';
import { runUpgrade, detectExistingInstall, type UpgradeResult } from './upgrade.js';

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
// Model & Background Embedding Helpers
// ============================================================================

type ModelStatus = 'downloaded' | 'exists' | 'failed' | 'skipped';

/** Download embedding model and optionally trigger background embedding. */
async function handleModelAndEmbed(
  repoRoot: string,
  opts: { skipModel?: boolean; quiet: boolean; json?: boolean },
): Promise<ModelStatus> {
  if (opts.skipModel) return 'skipped';

  let status: ModelStatus = 'skipped';
  try {
    const { isModelAvailable, resolveModel } = await import('../memory/embeddings/index.js');
    if (isModelAvailable()) {
      status = 'exists';
      if (!opts.quiet && !opts.json) console.log('  Embedding model: already exists');
    } else {
      if (!opts.quiet && !opts.json) out.info('Downloading embedding model...');
      await resolveModel({ cli: !opts.json });
      status = 'downloaded';
      if (!opts.quiet && !opts.json) out.info('Embedding model downloaded.');
    }
  } catch (err) {
    status = 'failed';
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[compound-agent] Embedding model download failed: ' + msg);
    console.error('[compound-agent] Run `npx ca download-model` manually.');
  }

  // Trigger background embedding if docs/ exists and model available
  if (status !== 'failed') {
    try {
      const { indexAndSpawnEmbed } = await import('../memory/knowledge/embed-background.js');
      const spawnResult = await indexAndSpawnEmbed(repoRoot);
      if (spawnResult?.spawned && !opts.quiet && !opts.json) {
        out.info('Embedding in progress (background). You can start working.');
      }
    } catch {
      // Non-fatal: don't break init if background embedding fails to spawn
    }
  }

  return status;
}

// ============================================================================
// Action Handler
// ============================================================================

async function initAction(
  cmd: Command,
  options: { skipAgents?: boolean; skipHooks?: boolean; skipClaude?: boolean; skipModel?: boolean; json?: boolean; update?: boolean }
): Promise<void> {
  const repoRoot = getRepoRoot();
  const { quiet } = getGlobalOpts(cmd);

  // Pre-flight checks
  const scopeResult = checkUserScope(repoRoot);

  // Upgrade detection
  let upgradeResult: UpgradeResult | null = null;
  if (options.update || detectExistingInstall(repoRoot)) {
    upgradeResult = await runUpgrade(repoRoot);
    if (!quiet && !options.json && upgradeResult.isUpgrade) {
      console.log(`  ${upgradeResult.message}`);
      if (!options.update) {
        console.log('  Tip: Run with --update to regenerate managed files with latest templates.');
      }
    }
  }

  if (!quiet && !options.json && process.stdout.isTTY) {
    await playInstallBanner();
  }

  // Ensure pnpm native build config before anything else
  const pnpmConfig = await ensurePnpmBuildConfig(repoRoot);

  await createLessonsDirectory(repoRoot);
  await createIndexFile(repoRoot);
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));

  let agentsMdUpdated = false;
  if (!options.skipAgents) {
    agentsMdUpdated = await updateAgentsMd(repoRoot);
    await ensureClaudeMdReference(repoRoot);
    await createPluginManifest(repoRoot);
    await installAgentTemplates(repoRoot);
    await installWorkflowCommands(repoRoot);
    await installPhaseSkills(repoRoot);
    await installAgentRoleSkills(repoRoot);
    await installDocTemplates(repoRoot);
    await installResearchDocs(repoRoot);
  }

  let hookResult: HookInstallResult | null = null;
  if (!options.skipHooks) {
    hookResult = await installPreCommitHook(repoRoot);
    await installPostCommitHook(repoRoot);
  }

  let claudeHooksResult: ClaudeHooksResult = { installed: false, action: 'error', error: 'skipped' };
  if (!options.skipClaude) {
    claudeHooksResult = await installClaudeHooksForInit(repoRoot);
  }

  const gitignoreResult = await ensureGitignore(repoRoot);
  const modelStatus = await handleModelAndEmbed(repoRoot, { skipModel: options.skipModel, quiet, json: options.json });
  const fullBeads = runFullBeadsCheck(repoRoot);

  if (options.json) {
    printInitJson({ lessonsDir, agentsMdUpdated, hookResult, claudeHooksResult, pnpmConfig, fullBeads, scopeResult, upgradeResult, gitignoreResult, modelStatus });
    return;
  }

  if (quiet) return;

  out.success('Compound agent initialized');
  console.log(`  Lessons directory: ${lessonsDir}`);
  printAgentsMdStatus(agentsMdUpdated, options.skipAgents);
  printHookStatus(hookResult, options.skipHooks);
  printClaudeHooksStatus(claudeHooksResult, options.skipClaude);
  printModelStatus(modelStatus, options.skipModel);
  printPnpmConfigStatus(pnpmConfig);
  printGitignoreStatus(gitignoreResult);
  printBeadsFullStatus(fullBeads);
  printScopeStatus(scopeResult);
}

function printInitJson(ctx: {
  lessonsDir: string; agentsMdUpdated: boolean; hookResult: HookInstallResult | null;
  claudeHooksResult: ClaudeHooksResult; pnpmConfig: PnpmConfigResult;
  fullBeads: BeadsFullCheck; scopeResult: { isUserScope: boolean };
  upgradeResult: UpgradeResult | null; gitignoreResult: GitignoreResult;
  modelStatus: string;
}): void {
  const claudeHooksInstalled = ctx.claudeHooksResult.action === 'installed';
  const hooksChanged = ctx.hookResult?.status === 'installed' || ctx.hookResult?.status === 'appended';
  console.log(JSON.stringify({
    initialized: true, lessonsDir: ctx.lessonsDir, agentsMd: ctx.agentsMdUpdated,
    hooks: hooksChanged, hookStatus: ctx.hookResult?.status ?? 'skipped',
    claudeHooks: claudeHooksInstalled,
    model: ctx.modelStatus,
    pnpmConfig: ctx.pnpmConfig.isPnpm ? { added: ctx.pnpmConfig.added, alreadyConfigured: ctx.pnpmConfig.alreadyConfigured } : null,
    beadsAvailable: ctx.fullBeads.cliAvailable, beadsInitialized: ctx.fullBeads.initialized, beadsHealthy: ctx.fullBeads.healthy,
    userScope: ctx.scopeResult.isUserScope,
    upgrade: ctx.upgradeResult ? { isUpgrade: ctx.upgradeResult.isUpgrade, removedCommands: ctx.upgradeResult.removedCommands, strippedHeaders: ctx.upgradeResult.strippedHeaders } : null,
    gitignore: ctx.gitignoreResult.added,
  }));
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

function printModelStatus(status: string, skipped?: boolean): void {
  if (skipped) {
    console.log('  Embedding model: Skipped (--skip-model)');
  } else if (status === 'exists') {
    // Already printed inline during download check
  } else if (status === 'downloaded') {
    // Already printed inline during download
  } else if (status === 'failed') {
    // Already printed inline via console.error
  }
}

function printPnpmConfigStatus(result: PnpmConfigResult): void {
  if (!result.isPnpm) return;
  if (result.alreadyConfigured) {
    console.log('  pnpm config: onlyBuiltDependencies already configured');
  } else if (result.added.length > 0) {
    console.log(`  pnpm config: Added onlyBuiltDependencies [${result.added.join(', ')}]`);
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
    .option('--skip-model', 'Skip embedding model download')
    .option('--json', 'Output result as JSON')
    .option('--update', 'Run upgrade logic on existing install')
    .action(async function (this: Command, options: { skipAgents?: boolean; skipHooks?: boolean; skipClaude?: boolean; skipModel?: boolean; json?: boolean; update?: boolean }) {
      await initAction(this, options);
    });
}
