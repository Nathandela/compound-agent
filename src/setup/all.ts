/**
 * One-shot setup command - Configure everything for compound-agent.
 *
 * Combines: init + Claude hooks + optionally model download.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { isModelAvailable, resolveModel } from '../memory/embeddings/index.js';
import { LESSONS_PATH } from '../memory/storage/index.js';
import { getGlobalOpts, out } from '../commands/index.js';
import { playInstallBanner } from './banner.js';
import { checkBeadsAvailable, type BeadsCheckResult } from './beads-check.js';
import { printGitignoreStatus, printPnpmConfigStatus, printSetupGitHooksStatus, runStatus } from './display-utils.js';
import {
  addAllCompoundAgentHooks,
  getClaudeSettingsPath,
  hasAllCompoundAgentHooks,
  readClaudeSettings,
  writeClaudeSettings,
} from './claude-helpers.js';
import { ensureGitignore, type GitignoreResult } from './gitignore.js';
import { installPreCommitHook, type HookInstallResult } from './hooks.js';
import {
  createPluginManifest,
  ensureClaudeMdReference,
  ensurePnpmBuildConfig,
  GENERATED_MARKER,
  installAgentRoleSkills,
  installAgentTemplates,
  installDocTemplates,
  installPhaseSkills,
  installWorkflowCommands,
  updateAgentsMd,
  type PnpmConfigResult,
} from './primitives.js';
import { checkUserScope, type ScopeCheckResult } from './scope-check.js';
import { LEGACY_ROOT_SLASH_COMMANDS } from './templates.js';
import { AGENT_TEMPLATES, AGENT_ROLE_SKILLS, WORKFLOW_COMMANDS, PHASE_SKILLS } from './templates/index.js';
import { runUninstall } from './uninstall.js';
import { runUpgrade, detectExistingInstall, type UpgradeResult } from './upgrade.js';

/** Result of one-shot setup */
interface SetupResult {
  lessonsDir: string;
  agentsMd: boolean;
  hooks: boolean;
  gitHooks: HookInstallResult['status'] | 'skipped';
  model: 'downloaded' | 'already_exists' | 'failed' | 'skipped';
  pnpmConfig: PnpmConfigResult;
  beads: BeadsCheckResult;
  scope: ScopeCheckResult;
  upgrade: UpgradeResult | null;
  gitignore: GitignoreResult;
}

/**
 * Ensure lessons directory and index file exist.
 */
async function ensureLessonsDirectory(repoRoot: string): Promise<string> {
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));
  await mkdir(lessonsDir, { recursive: true });

  const indexPath = join(repoRoot, LESSONS_PATH);
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '', 'utf-8');
  }

  return lessonsDir;
}

/**
 * Configure Claude Code settings: hooks in settings.json.
 */
async function configureClaudeSettings(): Promise<{ hooks: boolean }> {
  const settingsPath = getClaudeSettingsPath(false);
  let settings: Record<string, unknown>;
  try {
    settings = await readClaudeSettings(settingsPath);
  } catch {
    settings = {};
  }

  const hadHooks = hasAllCompoundAgentHooks(settings);
  addAllCompoundAgentHooks(settings);
  await writeClaudeSettings(settingsPath, settings);

  return {
    hooks: !hadHooks,
  };
}

/**
 * Run one-shot setup.
 */
export async function runSetup(options: { skipModel?: boolean; skipHooks?: boolean }): Promise<SetupResult> {
  const repoRoot = getRepoRoot();

  // Pre-flight checks
  const scope = checkUserScope(repoRoot);
  const beads = checkBeadsAvailable();

  // Upgrade detection
  let upgrade: UpgradeResult | null = null;
  if (detectExistingInstall(repoRoot)) {
    upgrade = await runUpgrade(repoRoot);
  }

  // 0. Ensure pnpm native build config (before anything that needs native addons)
  const pnpmConfig = await ensurePnpmBuildConfig(repoRoot);

  // 1. Initialize lessons directory
  const lessonsDir = await ensureLessonsDirectory(repoRoot);

  // 2. Update AGENTS.md
  const agentsMdUpdated = await updateAgentsMd(repoRoot);

  // 3. Ensure CLAUDE.md reference
  await ensureClaudeMdReference(repoRoot);

  // 4. Create plugin manifest
  await createPluginManifest(repoRoot);

  // 5. Install agent templates
  await installAgentTemplates(repoRoot);

  // 6. Install workflow commands (includes utility commands)
  await installWorkflowCommands(repoRoot);

  // 7. Install phase skills
  await installPhaseSkills(repoRoot);

  // 8. Install agent role skills
  await installAgentRoleSkills(repoRoot);

  // 9. Install documentation templates
  await installDocTemplates(repoRoot);

  // 10. Install pre-commit git hook
  let gitHooks: HookInstallResult['status'] | 'skipped' = 'skipped';
  if (!options.skipHooks) {
    gitHooks = (await installPreCommitHook(repoRoot)).status;
  }

  // 11. Configure Claude settings (hooks in settings.json)
  const { hooks } = await configureClaudeSettings();

  // 12. Ensure .gitignore has required patterns
  const gitignore = await ensureGitignore(repoRoot);

  // 13. Download model (unless skipped)
  let modelStatus: 'downloaded' | 'already_exists' | 'failed' | 'skipped' = 'skipped';
  if (!options.skipModel) {
    try {
      const alreadyExisted = isModelAvailable();
      if (!alreadyExisted) {
        await resolveModel({ cli: false });
        modelStatus = 'downloaded';
      } else {
        modelStatus = 'already_exists';
      }
    } catch {
      modelStatus = 'failed';
    }
  }

  return {
    lessonsDir,
    agentsMd: agentsMdUpdated,
    hooks,
    gitHooks,
    model: modelStatus,
    pnpmConfig,
    beads,
    scope,
    upgrade,
    gitignore,
  };
}


/**
 * Update generated files with latest templates.
 * Files inside compound/ subdirectories are always managed and overwritten.
 */
export async function runUpdate(repoRoot: string, dryRun: boolean): Promise<{
  updated: number;
  added: number;
  configUpdated: boolean;
  upgrade: UpgradeResult;
  gitignore: GitignoreResult;
}> {
  // Run upgrade pipeline (deprecated commands, headers, doc version)
  const upgrade = await runUpgrade(repoRoot);

  let updated = 0;
  let added = 0;

  async function processFile(filePath: string, content: string): Promise<void> {
    if (!existsSync(filePath)) {
      if (!dryRun) {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, 'utf-8');
      }
      added++;
    } else {
      const existing = await readFile(filePath, 'utf-8');
      // Strip any legacy marker for comparison
      const cleanExisting = existing.startsWith(GENERATED_MARKER)
        ? existing.slice(GENERATED_MARKER.length)
        : existing;
      if (cleanExisting !== content) {
        if (!dryRun) await writeFile(filePath, content, 'utf-8');
        updated++;
      }
    }
  }

  for (const [filename, content] of Object.entries(AGENT_TEMPLATES)) {
    await processFile(join(repoRoot, '.claude', 'agents', 'compound', filename), content);
  }
  for (const [filename, content] of Object.entries(WORKFLOW_COMMANDS)) {
    await processFile(join(repoRoot, '.claude', 'commands', 'compound', filename), content);
  }
  for (const [phase, content] of Object.entries(PHASE_SKILLS)) {
    await processFile(join(repoRoot, '.claude', 'skills', 'compound', phase, 'SKILL.md'), content);
  }
  for (const [name, content] of Object.entries(AGENT_ROLE_SKILLS)) {
    await processFile(join(repoRoot, '.claude', 'skills', 'compound', 'agents', name, 'SKILL.md'), content);
  }

  // Migration: clean up legacy root-level slash commands from v1.0
  // Only remove files that were generated by compound-agent (have the marker).
  // User-authored files with the same name are preserved.
  for (const filename of LEGACY_ROOT_SLASH_COMMANDS) {
    const filePath = join(repoRoot, '.claude', 'commands', filename);
    if (existsSync(filePath)) {
      const content = await readFile(filePath, 'utf-8');
      if (content.startsWith(GENERATED_MARKER)) {
        if (!dryRun) await rm(filePath);
      }
    }
  }

  // Ensure hooks config is current
  let configUpdated = false;
  if (!dryRun) {
    const { hooks } = await configureClaudeSettings();
    configUpdated = hooks;
  }

  // Ensure .gitignore has required patterns
  const gitignore = dryRun ? { added: [] } : await ensureGitignore(repoRoot);

  return { updated, added, configUpdated, upgrade, gitignore };
}


const MODEL_STATUS_MSG: Record<string, string> = {
  skipped: 'Skipped (--skip-model)',
  downloaded: 'Downloaded',
  already_exists: 'Already exists',
  failed: 'Download failed (run `ca download-model` manually)',
};

async function printSetupResult(result: SetupResult, quiet: boolean): Promise<void> {
  if (!quiet) {
    if (result.scope.isUserScope) console.log(`  ${result.scope.message}`);
    if (!result.beads.available) console.log(`  ${result.beads.message}`);
    if (result.upgrade?.isUpgrade) console.log(`  ${result.upgrade.message}`);
    if (process.stdout.isTTY) await playInstallBanner();
  }
  out.success('Compound agent setup complete');
  console.log(`  Lessons directory: ${result.lessonsDir}`);
  console.log(`  AGENTS.md: ${result.agentsMd ? 'Updated' : 'Already configured'}`);
  console.log(`  Claude hooks: ${result.hooks ? 'Installed' : 'Already configured'}`);
  printSetupGitHooksStatus(result.gitHooks);
  printPnpmConfigStatus(result.pnpmConfig);
  printGitignoreStatus(result.gitignore);
  console.log(`  Model: ${MODEL_STATUS_MSG[result.model]}`);
  console.log('\nNext steps:\n  1. Restart Claude Code to load hooks\n  2. Use `npx ca search` and `npx ca learn` commands');
}

/**
 * Register the one-shot setup action as the default subcommand of setup.
 * Using a default subcommand prevents its options (--uninstall, --dry-run)
 * from being consumed by the parent when other subcommands like "claude"
 * define the same flags.
 */
export function registerSetupAllCommand(setupCommand: Command): void {
  setupCommand.description('One-shot setup: init + hooks + model');

  setupCommand
    .command('all', { isDefault: true })
    .description('Run full setup (default)')
    .option('--skip-model', 'Skip embedding model download')
    .option('--skip-hooks', 'Skip git hooks installation')
    .option('--uninstall', 'Remove all generated files and configuration')
    .option('--update', 'Regenerate files (preserves user customizations)')
    .option('--status', 'Show installation status')
    .option('--dry-run', 'Show what would change without changing')
    .action(async function (this: Command, options: {
      skipModel?: boolean;
      skipHooks?: boolean;
      uninstall?: boolean;
      update?: boolean;
      status?: boolean;
      dryRun?: boolean;
    }) {
      const repoRoot = getRepoRoot();
      const dryRun = options.dryRun ?? false;

      if (options.uninstall) {
        const prefix = dryRun ? '[dry-run] Would have: ' : '';
        const actions = await runUninstall(repoRoot, dryRun);
        if (actions.length === 0) {
          console.log('Nothing to uninstall.');
        } else {
          for (const action of actions) {
            console.log(`  ${prefix}${action}`);
          }
          out.success(dryRun ? 'Dry run complete (no changes made)' : 'Uninstall complete');
        }
        return;
      }

      if (options.update) {
        const result = await runUpdate(repoRoot, dryRun);
        const prefix = dryRun ? '[dry-run] ' : '';
        if (result.upgrade.isUpgrade) {
          console.log(`  ${prefix}${result.upgrade.message}`);
        }
        if (result.updated === 0 && result.added === 0) {
          console.log(`${prefix}All generated files are up to date.`);
        } else {
          if (result.updated > 0) console.log(`  ${prefix}Updated: ${result.updated} file(s)`);
          if (result.added > 0) console.log(`  ${prefix}Added: ${result.added} file(s)`);
        }
        if (result.gitignore.added.length > 0) {
          console.log(`  ${prefix}.gitignore: Added [${result.gitignore.added.join(', ')}]`);
        }
        if (result.configUpdated) console.log(`  ${prefix}Config: hooks updated`);
        return;
      }

      if (options.status) {
        await runStatus(repoRoot);
        return;
      }

      // Default: full setup
      const result = await runSetup({ skipModel: options.skipModel, skipHooks: options.skipHooks });
      const { quiet } = getGlobalOpts(this);
      await printSetupResult(result, quiet);
    });
}
