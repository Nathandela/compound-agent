/**
 * Uninstall command - Remove all generated compound-agent files.
 * NEVER removes .claude/lessons/ (user data).
 */

import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getClaudeSettingsPath,
  hasClaudeHook,
  readClaudeSettings,
  removeAgentsSection,
  removeClaudeMdReference,
  removeCompoundAgentHook,
  writeClaudeSettings,
} from './claude-helpers.js';
import { GENERATED_MARKER } from './primitives.js';
import { LEGACY_ROOT_SLASH_COMMANDS } from './templates.js';

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
