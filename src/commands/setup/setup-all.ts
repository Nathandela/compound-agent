/**
 * One-shot setup command - Configure everything for learning-agent.
 *
 * Combines: init + Claude hooks + MCP server + optionally model download.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { isModelAvailable, resolveModel } from '../../embeddings/model.js';
import { LESSONS_PATH } from '../../storage/index.js';
import { out } from '../shared.js';
import {
  addAllLearningAgentHooks,
  addMcpServerToMcpJson,
  getClaudeSettingsPath,
  hasClaudeHook,
  hasMcpServerInMcpJson,
  readClaudeSettings,
  writeClaudeSettings,
} from './claude-helpers.js';
import {
  createPluginManifest,
  createSlashCommands,
  ensureClaudeMdReference,
  updateAgentsMd,
} from './setup-primitives.js';

/** Result of one-shot setup */
interface SetupResult {
  lessonsDir: string;
  agentsMd: boolean;
  hooks: boolean;
  mcpServer: boolean;
  model: boolean | 'skipped';
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
 * Configure Claude Code settings: hooks in settings.json, MCP in .mcp.json.
 * Per Claude Code docs, hooks go in .claude/settings.json, MCP goes in .mcp.json.
 */
async function configureClaudeSettings(repoRoot: string): Promise<{ hooks: boolean; mcpServer: boolean }> {
  // 1. Configure hooks in .claude/settings.json
  const settingsPath = getClaudeSettingsPath(false);
  let settings: Record<string, unknown>;
  try {
    settings = await readClaudeSettings(settingsPath);
  } catch {
    settings = {};
  }

  const hadHooks = hasClaudeHook(settings);
  addAllLearningAgentHooks(settings);
  await writeClaudeSettings(settingsPath, settings);

  // 2. Configure MCP in .mcp.json (project scope, shareable)
  const hadMcp = await hasMcpServerInMcpJson(repoRoot);
  const mcpAdded = await addMcpServerToMcpJson(repoRoot);

  return {
    hooks: !hadHooks,
    mcpServer: mcpAdded && !hadMcp,
  };
}

/**
 * Run one-shot setup.
 */
export async function runSetup(options: { skipModel?: boolean }): Promise<SetupResult> {
  const repoRoot = getRepoRoot();

  // 1. Initialize lessons directory
  const lessonsDir = await ensureLessonsDirectory(repoRoot);

  // 2. Update AGENTS.md
  const agentsMdUpdated = await updateAgentsMd(repoRoot);

  // 3. Ensure CLAUDE.md reference
  await ensureClaudeMdReference(repoRoot);

  // 4. Create plugin manifest
  await createPluginManifest(repoRoot);

  // 5. Create slash commands
  await createSlashCommands(repoRoot);

  // 6. Configure Claude settings (hooks in settings.json, MCP in .mcp.json)
  const { hooks, mcpServer } = await configureClaudeSettings(repoRoot);

  // 7. Download model (unless skipped)
  let modelDownloaded: boolean | 'skipped' = 'skipped';
  if (!options.skipModel) {
    try {
      const alreadyExisted = isModelAvailable();
      if (!alreadyExisted) {
        await resolveModel({ cli: false });
      }
      modelDownloaded = !alreadyExisted;
    } catch {
      modelDownloaded = false;
    }
  }

  return {
    lessonsDir,
    agentsMd: agentsMdUpdated,
    hooks,
    mcpServer,
    model: modelDownloaded,
  };
}

/**
 * Register the one-shot setup action on the setup command.
 * Note: Does not use --json to avoid conflicts with subcommand options.
 */
export function registerSetupAllCommand(setupCommand: Command): void {
  setupCommand
    .description('One-shot setup: init + hooks + MCP server + model')
    .option('--skip-model', 'Skip embedding model download')
    .action(async (options: { skipModel?: boolean }) => {
      const result = await runSetup({ skipModel: options.skipModel });

      // Always human-readable output for one-shot setup
      out.success('Learning agent setup complete');
      console.log(`  Lessons directory: ${result.lessonsDir}`);
      console.log(`  AGENTS.md: ${result.agentsMd ? 'Updated' : 'Already configured'}`);
      console.log(`  Claude hooks: ${result.hooks ? 'Installed' : 'Already configured'}`);
      console.log(`  MCP server: ${result.mcpServer ? 'Registered in .mcp.json' : 'Already configured'}`);
      if (result.model === 'skipped') {
        console.log('  Model: Skipped (--skip-model)');
      } else {
        console.log(`  Model: ${result.model ? 'Downloaded' : 'Already exists'}`);
      }
      console.log('');
      console.log('Next steps:');
      console.log('  1. Restart Claude Code to load MCP tools');
      console.log('  2. Use `lesson_search` and `lesson_capture` tools');
    });
}
