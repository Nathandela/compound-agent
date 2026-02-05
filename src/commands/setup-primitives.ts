/**
 * Shared primitives for setup commands.
 * Used by both init.ts and setup-all.ts to avoid duplication.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AGENTS_MD_TEMPLATE,
  CLAUDE_MD_REFERENCE,
  CLAUDE_REF_START_MARKER,
  LEARNING_AGENT_SECTION_HEADER,
  PLUGIN_MANIFEST,
  SLASH_COMMANDS,
} from './setup-templates.js';

/**
 * Check if AGENTS.md already has the Learning Agent section.
 */
export function hasLearningAgentSection(content: string): boolean {
  return content.includes(LEARNING_AGENT_SECTION_HEADER);
}

/**
 * Check if CLAUDE.md already has the Learning Agent reference.
 */
export function hasClaudeMdReference(content: string): boolean {
  return content.includes('Learning Agent') || content.includes(CLAUDE_REF_START_MARKER);
}

/**
 * Create or update AGENTS.md with Learning Agent section.
 */
export async function updateAgentsMd(repoRoot: string): Promise<boolean> {
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
 * Ensure CLAUDE.md has a reference to AGENTS.md for Learning Agent workflow.
 * Creates CLAUDE.md if it doesn't exist, appends reference if not present.
 * Uses markers for clean uninstall support.
 */
export async function ensureClaudeMdReference(repoRoot: string): Promise<boolean> {
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
 * Create plugin.json in .claude/ directory.
 * Idempotent: does not overwrite existing file.
 *
 * @returns true if plugin.json was created
 */
export async function createPluginManifest(repoRoot: string): Promise<boolean> {
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
export async function createSlashCommands(repoRoot: string): Promise<boolean> {
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
