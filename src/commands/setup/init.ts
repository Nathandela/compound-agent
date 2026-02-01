/**
 * Init command - Initialize learning-agent in a repository.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { LESSONS_PATH } from '../../storage/index.js';
import { getGlobalOpts, out } from '../shared.js';
import { installClaudeHooksForInit } from './claude-helpers.js';
import { installPreCommitHook } from './hooks.js';
import {
  AGENTS_MD_TEMPLATE,
  CLAUDE_MD_REFERENCE,
  CLAUDE_REF_START_MARKER,
  LEARNING_AGENT_SECTION_HEADER,
  PLUGIN_MANIFEST,
  SLASH_COMMANDS,
} from './templates.js';
import type { ClaudeHooksResult } from './types.js';

/**
 * Check if AGENTS.md already has the Learning Agent section.
 */
function hasLearningAgentSection(content: string): boolean {
  return content.includes(LEARNING_AGENT_SECTION_HEADER);
}

/**
 * Check if CLAUDE.md already has the Learning Agent reference.
 */
function hasClaudeMdReference(content: string): boolean {
  return content.includes('Learning Agent') || content.includes(CLAUDE_REF_START_MARKER);
}

/**
 * Ensure CLAUDE.md has a reference to AGENTS.md for Learning Agent workflow.
 * Creates CLAUDE.md if it doesn't exist, appends reference if not present.
 * Uses markers for clean uninstall support.
 */
async function ensureClaudeMdReference(repoRoot: string): Promise<boolean> {
  const claudeMdPath = join(repoRoot, '.claude', 'CLAUDE.md');

  // Ensure .claude directory exists
  await mkdir(join(repoRoot, '.claude'), { recursive: true });

  if (!existsSync(claudeMdPath)) {
    // Create new CLAUDE.md with reference
    const content = `# Project Instructions
${CLAUDE_MD_REFERENCE}`;
    await writeFile(claudeMdPath, content, 'utf-8');
    return true;
  }

  // File exists - check if reference is already present
  const content = await readFile(claudeMdPath, 'utf-8');
  if (hasClaudeMdReference(content)) {
    return false; // Already has reference
  }

  // Append reference
  const newContent = content.trimEnd() + '\n' + CLAUDE_MD_REFERENCE;
  await writeFile(claudeMdPath, newContent, 'utf-8');
  return true;
}

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
 * Create or update AGENTS.md with Learning Agent section.
 */
async function updateAgentsMd(repoRoot: string): Promise<boolean> {
  const agentsPath = join(repoRoot, 'AGENTS.md');
  let content = '';
  let existed = false;

  if (existsSync(agentsPath)) {
    content = await readFile(agentsPath, 'utf-8');
    existed = true;
    if (hasLearningAgentSection(content)) {
      return false; // Already has section, no update needed
    }
  }

  // Append the template
  const newContent = existed ? content.trimEnd() + '\n' + AGENTS_MD_TEMPLATE : AGENTS_MD_TEMPLATE.trim() + '\n';
  await writeFile(agentsPath, newContent, 'utf-8');
  return true;
}

/**
 * Create plugin.json in .claude/ directory.
 * Idempotent: does not overwrite existing file.
 *
 * @returns true if plugin.json was created
 */
async function createPluginManifest(repoRoot: string): Promise<boolean> {
  const pluginPath = join(repoRoot, '.claude', 'plugin.json');

  // Ensure .claude directory exists
  await mkdir(join(repoRoot, '.claude'), { recursive: true });

  if (existsSync(pluginPath)) {
    return false; // Already exists
  }

  await writeFile(pluginPath, JSON.stringify(PLUGIN_MANIFEST, null, 2) + '\n', 'utf-8');
  return true;
}

/**
 * Create slash commands in .claude/commands/ directory.
 * Idempotent: does not overwrite existing files.
 *
 * @returns true if any commands were created
 */
async function createSlashCommands(repoRoot: string): Promise<boolean> {
  const commandsDir = join(repoRoot, '.claude', 'commands');
  await mkdir(commandsDir, { recursive: true });

  let created = false;

  for (const [filename, content] of Object.entries(SLASH_COMMANDS)) {
    const filePath = join(commandsDir, filename);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, 'utf-8');
      created = true;
    }
  }

  return created;
}

/**
 * Register the init command on the program.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize learning-agent in this repository')
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
      let hooksInstalled = false;
      if (!options.skipHooks) {
        hooksInstalled = await installPreCommitHook(repoRoot);
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
        console.log(JSON.stringify({
          initialized: true,
          lessonsDir,
          agentsMd: agentsMdUpdated,
          slashCommands: slashCommandsCreated || !options.skipAgents,
          hooks: hooksInstalled,
          claudeHooks: claudeHooksInstalled,
        }));
      } else if (!quiet) {
        out.success('Learning agent initialized');
        console.log(`  Lessons directory: ${lessonsDir}`);
        if (agentsMdUpdated) {
          console.log('  AGENTS.md: Updated with Learning Agent section');
        } else if (options.skipAgents) {
          console.log('  AGENTS.md: Skipped (--skip-agents)');
        } else {
          console.log('  AGENTS.md: Already has Learning Agent section');
        }
        if (slashCommandsCreated) {
          console.log('  Slash commands: Created (/learn, /check-plan, /list, /prime)');
        } else if (options.skipAgents) {
          console.log('  Slash commands: Skipped (--skip-agents)');
        } else {
          console.log('  Slash commands: Already exist');
        }
        if (hooksInstalled) {
          console.log('  Git hooks: pre-commit hook installed');
        } else if (options.skipHooks) {
          console.log('  Git hooks: Skipped (--skip-hooks)');
        } else {
          console.log('  Git hooks: Already installed or not a git repo');
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
