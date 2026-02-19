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
import { out } from '../commands/index.js';
import {
  addAllCompoundAgentHooks,
  getClaudeSettingsPath,
  hasAllCompoundAgentHooks,
  hasClaudeHook,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeCompoundAgentHook,
  writeClaudeSettings,
} from './claude-helpers.js';
import { installPreCommitHook, type HookInstallResult } from './hooks.js';
import {
  createPluginManifest,
  ensureClaudeMdReference,
  ensurePnpmBuildConfig,
  GENERATED_MARKER,
  installAgentRoleSkills,
  installAgentTemplates,
  installPhaseSkills,
  installWorkflowCommands,
  updateAgentsMd,
  type PnpmConfigResult,
} from './primitives.js';
import { LEGACY_ROOT_SLASH_COMMANDS } from './templates.js';
import { AGENT_TEMPLATES, AGENT_ROLE_SKILLS, WORKFLOW_COMMANDS, PHASE_SKILLS } from './templates/index.js';

/** Result of one-shot setup */
interface SetupResult {
  lessonsDir: string;
  agentsMd: boolean;
  hooks: boolean;
  gitHooks: HookInstallResult['status'] | 'skipped';
  model: 'downloaded' | 'already_exists' | 'failed' | 'skipped';
  pnpmConfig: PnpmConfigResult;
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

  // 9. Install pre-commit git hook
  let gitHooks: HookInstallResult['status'] | 'skipped' = 'skipped';
  if (!options.skipHooks) {
    gitHooks = (await installPreCommitHook(repoRoot)).status;
  }

  // 10. Configure Claude settings (hooks in settings.json)
  const { hooks } = await configureClaudeSettings();

  // 11. Download model (unless skipped)
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
  };
}

/**
 * Remove all generated files and configuration.
 * NEVER removes .claude/lessons/ (user data).
 */
export async function runUninstall(repoRoot: string, dryRun: boolean): Promise<string[]> {
  const actions: string[] = [];

  // Remove generated directories
  const dirsToRemove = [
    join(repoRoot, '.claude', 'agents', 'compound'),
    join(repoRoot, '.claude', 'commands', 'compound'),
    join(repoRoot, '.claude', 'skills', 'compound'),
  ];
  for (const dir of dirsToRemove) {
    if (existsSync(dir)) {
      if (!dryRun) await rm(dir, { recursive: true, force: true });
      actions.push(`Removed ${dir}`);
    }
  }

  // Remove legacy root-level slash commands (v1.0 migration)
  // Only remove generated files — user-authored files are preserved.
  for (const filename of LEGACY_ROOT_SLASH_COMMANDS) {
    const filePath = join(repoRoot, '.claude', 'commands', filename);
    if (existsSync(filePath)) {
      const content = await readFile(filePath, 'utf-8');
      if (content.startsWith(GENERATED_MARKER)) {
        if (!dryRun) await rm(filePath);
        actions.push(`Removed ${filePath}`);
      }
    }
  }

  // Remove plugin.json
  const pluginPath = join(repoRoot, '.claude', 'plugin.json');
  if (existsSync(pluginPath)) {
    if (!dryRun) await rm(pluginPath);
    actions.push(`Removed ${pluginPath}`);
  }

  // Remove hooks from settings.json
  const settingsPath = getClaudeSettingsPath(false);
  try {
    const settings = await readClaudeSettings(settingsPath);
    if (hasClaudeHook(settings)) {
      if (!dryRun) {
        removeCompoundAgentHook(settings);
        await writeClaudeSettings(settingsPath, settings);
      }
      actions.push('Removed compound-agent hooks from settings.json');
    }
  } catch {
    // settings.json may not exist
  }

  // Remove AGENTS.md section
  if (!dryRun) {
    const removed = await removeAgentsSection(repoRoot);
    if (removed) actions.push('Removed compound-agent section from AGENTS.md');
  } else {
    const agentsPath = join(repoRoot, 'AGENTS.md');
    if (existsSync(agentsPath)) {
      const content = await readFile(agentsPath, 'utf-8');
      if (content.includes('compound-agent:start')) {
        actions.push('Removed compound-agent section from AGENTS.md');
      }
    }
  }

  // Remove CLAUDE.md reference
  if (!dryRun) {
    const removed = await removeClaudeMdReference(repoRoot);
    if (removed) actions.push('Removed compound-agent reference from CLAUDE.md');
  } else {
    const claudeMdPath = join(repoRoot, '.claude', 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const content = await readFile(claudeMdPath, 'utf-8');
      if (content.includes('compound-agent:claude-ref:start')) {
        actions.push('Removed compound-agent reference from CLAUDE.md');
      }
    }
  }

  return actions;
}

/**
 * Update generated files with latest templates.
 * Files with GENERATED_MARKER are overwritten, user-customized files are skipped.
 */
export async function runUpdate(repoRoot: string, dryRun: boolean): Promise<{ updated: number; added: number; skipped: number; configUpdated: boolean }> {
  let updated = 0;
  let added = 0;
  let skipped = 0;

  async function processFile(filePath: string, content: string): Promise<void> {
    const markedContent = GENERATED_MARKER + content;
    if (!existsSync(filePath)) {
      if (!dryRun) {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, markedContent, 'utf-8');
      }
      added++;
    } else {
      const existing = await readFile(filePath, 'utf-8');
      if (existing.startsWith(GENERATED_MARKER)) {
        if (existing !== markedContent) {
          if (!dryRun) await writeFile(filePath, markedContent, 'utf-8');
          updated++;
        }
      } else {
        skipped++;
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

  return { updated, added, skipped, configUpdated };
}

/**
 * Show installation status.
 */
export async function runStatus(repoRoot: string): Promise<void> {
  const agentsDir = join(repoRoot, '.claude', 'agents', 'compound');
  const commandsDir = join(repoRoot, '.claude', 'commands', 'compound');
  const skillsDir = join(repoRoot, '.claude', 'skills', 'compound');
  const pluginPath = join(repoRoot, '.claude', 'plugin.json');

  console.log('Compound Agent Status:');
  console.log(`  Agent templates:    ${existsSync(agentsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Workflow commands:  ${existsSync(commandsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Phase skills:       ${existsSync(skillsDir) ? 'installed' : 'not installed'}`);
  console.log(`  Plugin manifest:    ${existsSync(pluginPath) ? 'installed' : 'not installed'}`);

  const settingsPath = getClaudeSettingsPath(false);
  let hooksInstalled = false;
  try {
    const settings = await readClaudeSettings(settingsPath);
    hooksInstalled = hasAllCompoundAgentHooks(settings);
  } catch {
    // No settings
  }
  console.log(`  Hooks:              ${hooksInstalled ? 'installed' : 'not installed'}`);
}

function printSetupGitHooksStatus(gitHooks: HookInstallResult['status'] | 'skipped'): void {
  if (gitHooks === 'skipped') {
    console.log('  Git hooks: Skipped (--skip-hooks)');
    return;
  }
  if (gitHooks === 'not_git_repo') {
    console.log('  Git hooks: Skipped (not a git repository)');
    return;
  }
  if (gitHooks === 'installed') {
    console.log('  Git hooks: Installed');
    return;
  }
  if (gitHooks === 'appended') {
    console.log('  Git hooks: Appended to existing pre-commit hook');
    return;
  }
  console.log('  Git hooks: Already configured');
}

function printPnpmConfigStatus(result: PnpmConfigResult): void {
  if (!result.isPnpm) return; // Not a pnpm project, nothing to report
  if (result.alreadyConfigured) {
    console.log('  pnpm config: onlyBuiltDependencies already configured');
  } else if (result.added.length > 0) {
    console.log(`  pnpm config: Added onlyBuiltDependencies [${result.added.join(', ')}]`);
  }
}

/**
 * Register the one-shot setup action as the default subcommand of setup.
 * Using a default subcommand prevents its options (--uninstall, --dry-run)
 * from being consumed by the parent when other subcommands like "claude"
 * define the same flags.
 */
// eslint-disable-next-line max-lines-per-function -- command router keeps related setup flows in one place
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
    .action(async (options: {
      skipModel?: boolean;
      skipHooks?: boolean;
      uninstall?: boolean;
      update?: boolean;
      status?: boolean;
      dryRun?: boolean;
    }) => {
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
        if (result.updated === 0 && result.added === 0) {
          console.log(`${prefix}All generated files are up to date.`);
        } else {
          if (result.updated > 0) console.log(`  ${prefix}Updated: ${result.updated} file(s)`);
          if (result.added > 0) console.log(`  ${prefix}Added: ${result.added} file(s)`);
        }
        if (result.skipped > 0) console.log(`  Skipped: ${result.skipped} user-customized file(s)`);
        if (result.configUpdated) console.log(`  ${prefix}Config: hooks updated`);
        return;
      }

      if (options.status) {
        await runStatus(repoRoot);
        return;
      }

      // Default: full setup
      const result = await runSetup({ skipModel: options.skipModel, skipHooks: options.skipHooks });

      out.success('Compound agent setup complete');
      console.log(`  Lessons directory: ${result.lessonsDir}`);
      console.log(`  AGENTS.md: ${result.agentsMd ? 'Updated' : 'Already configured'}`);
      console.log(`  Claude hooks: ${result.hooks ? 'Installed' : 'Already configured'}`);
      printSetupGitHooksStatus(result.gitHooks);
      printPnpmConfigStatus(result.pnpmConfig);
      switch (result.model) {
        case 'skipped':
          console.log('  Model: Skipped (--skip-model)');
          break;
        case 'downloaded':
          console.log('  Model: Downloaded');
          break;
        case 'already_exists':
          console.log('  Model: Already exists');
          break;
        case 'failed':
          console.log('  Model: Download failed (run `ca download-model` manually)');
          break;
      }
      console.log('');
      console.log('Next steps:');
      console.log('  1. Restart Claude Code to load hooks');
      console.log('  2. Use `npx ca search` and `npx ca learn` commands');
    });
}
