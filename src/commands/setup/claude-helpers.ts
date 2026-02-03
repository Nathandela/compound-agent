/**
 * Claude Code settings helpers.
 *
 * Functions for reading, writing, and manipulating Claude Code settings.json.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { getRepoRoot } from '../../cli-utils.js';
import {
  AGENTS_SECTION_END_MARKER,
  AGENTS_SECTION_START_MARKER,
  CLAUDE_HOOK_CONFIG,
  CLAUDE_HOOK_MARKERS,
  CLAUDE_PRECOMPACT_HOOK_CONFIG,
  CLAUDE_REF_END_MARKER,
  CLAUDE_REF_START_MARKER,
  MCP_SERVER_CONFIG,
} from './templates.js';
import type { ClaudeHooksResult } from './types.js';

/**
 * Get the path to Claude Code settings file.
 *
 * @param global - If true, return global path (~/.claude/settings.json).
 *                 If false (default), return project-local path (.claude/settings.json).
 */
export function getClaudeSettingsPath(global: boolean): string {
  if (global) {
    return join(homedir(), '.claude', 'settings.json');
  }
  const repoRoot = getRepoRoot();
  return join(repoRoot, '.claude', 'settings.json');
}

/**
 * Read and parse Claude Code settings.
 */
export async function readClaudeSettings(settingsPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const content = await readFile(settingsPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Check if our hook is already installed.
 * Checks for both current (lna) and legacy (learning-agent) markers.
 */
export function hasClaudeHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  return hooks.SessionStart.some((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return hookEntry.hooks?.some((h) =>
      CLAUDE_HOOK_MARKERS.some((marker) => h.command?.includes(marker))
    );
  });
}

/**
 * Add our hook to SessionStart array.
 */
export function addLearningAgentHook(settings: Record<string, unknown>): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;
  if (!hooks.SessionStart) {
    hooks.SessionStart = [];
  }
  hooks.SessionStart.push(CLAUDE_HOOK_CONFIG);
}

/**
 * Add all v0.2.4 hooks: SessionStart, PreCompact.
 * Note: PreCommit is handled by git hooks, not Claude Code hooks.
 */
export function addAllLearningAgentHooks(settings: Record<string, unknown>): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  // SessionStart - prime context
  if (!hooks.SessionStart) {
    hooks.SessionStart = [];
  }
  if (!hasHookType(hooks.SessionStart, 'lna prime')) {
    hooks.SessionStart.push(CLAUDE_HOOK_CONFIG);
  }

  // PreCompact - re-inject prime before compaction
  if (!hooks.PreCompact) {
    hooks.PreCompact = [];
  }
  if (!hasHookType(hooks.PreCompact, 'lna prime')) {
    hooks.PreCompact.push(CLAUDE_PRECOMPACT_HOOK_CONFIG);
  }

  // Note: remind-capture functionality is handled by git pre-commit hooks
  // (see installPreCommitHook in hooks.ts), not Claude Code hooks
}

/**
 * Check if a hook type already has a command containing the marker.
 */
function hasHookType(hookArray: unknown[], marker: string): boolean {
  return hookArray.some((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return hookEntry.hooks?.some((h) => h.command?.includes(marker));
  });
}

/**
 * Add MCP server configuration to settings.
 */
export function addMcpServer(settings: Record<string, unknown>): boolean {
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  const mcpServers = settings.mcpServers as Record<string, unknown>;

  if (mcpServers['learning-agent']) {
    return false; // Already configured
  }

  Object.assign(mcpServers, MCP_SERVER_CONFIG);
  return true;
}

/**
 * Check if MCP server is already configured.
 */
export function hasMcpServer(settings: Record<string, unknown>): boolean {
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  return !!mcpServers?.['learning-agent'];
}

/**
 * Remove MCP server configuration from settings.
 */
export function removeMcpServer(settings: Record<string, unknown>): boolean {
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers?.['learning-agent']) {
    return false;
  }
  delete mcpServers['learning-agent'];
  return true;
}

/**
 * Remove our hook from SessionStart array.
 * Removes both current (lna) and legacy (learning-agent) hooks.
 */
export function removeLearningAgentHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  const originalLength = hooks.SessionStart.length;
  hooks.SessionStart = hooks.SessionStart.filter((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return !hookEntry.hooks?.some((h) =>
      CLAUDE_HOOK_MARKERS.some((marker) => h.command?.includes(marker))
    );
  });

  return hooks.SessionStart.length < originalLength;
}

/**
 * Write Claude Code settings atomically.
 */
export async function writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  const dir = dirname(settingsPath);
  await mkdir(dir, { recursive: true });

  // Write to temp file, then rename (atomic)
  const tempPath = settingsPath + '.tmp';
  await writeFile(tempPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  await rename(tempPath, settingsPath);
}

/**
 * Install Claude hooks for init command.
 * Handles errors gracefully - returns error info instead of throwing.
 * @param repoRoot - Repository root path
 * @returns Result indicating success/failure
 */
export async function installClaudeHooksForInit(repoRoot: string): Promise<ClaudeHooksResult> {
  const settingsPath = join(repoRoot, '.claude', 'settings.json');

  let settings: Record<string, unknown>;
  try {
    settings = await readClaudeSettings(settingsPath);
  } catch {
    return { installed: false, action: 'error', error: 'Failed to parse settings.json' };
  }

  if (hasClaudeHook(settings)) {
    return { installed: true, action: 'already_installed' };
  }

  try {
    addLearningAgentHook(settings);
    await writeClaudeSettings(settingsPath, settings);
    return { installed: true, action: 'installed' };
  } catch (err) {
    return { installed: false, action: 'error', error: String(err) };
  }
}

// ============================================================================
// AGENTS.md and CLAUDE.md Cleanup (e2r)
// ============================================================================

/**
 * Remove Learning Agent section from AGENTS.md.
 * Uses markers to find and remove the section.
 *
 * @param repoRoot - Repository root path
 * @returns true if section was removed, false if not found
 */
export async function removeAgentsSection(repoRoot: string): Promise<boolean> {
  const agentsPath = join(repoRoot, 'AGENTS.md');

  if (!existsSync(agentsPath)) {
    return false;
  }

  const content = await readFile(agentsPath, 'utf-8');
  const startIdx = content.indexOf(AGENTS_SECTION_START_MARKER);
  const endIdx = content.indexOf(AGENTS_SECTION_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    return false;
  }

  // Remove from start marker to end marker (inclusive)
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + AGENTS_SECTION_END_MARKER.length);

  // Clean up: remove trailing newlines from before, keep single newline separation
  const newContent = (before.trimEnd() + after).trim();

  // Only write if file would not be empty
  if (newContent.length > 0) {
    await writeFile(agentsPath, newContent + '\n', 'utf-8');
  } else {
    // File would be empty - could optionally delete it
    await writeFile(agentsPath, '', 'utf-8');
  }

  return true;
}

/**
 * Remove Learning Agent reference from CLAUDE.md.
 * Uses markers to find and remove the reference section.
 *
 * @param repoRoot - Repository root path
 * @returns true if reference was removed, false if not found
 */
export async function removeClaudeMdReference(repoRoot: string): Promise<boolean> {
  const claudeMdPath = join(repoRoot, '.claude', 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return false;
  }

  const content = await readFile(claudeMdPath, 'utf-8');
  const startIdx = content.indexOf(CLAUDE_REF_START_MARKER);
  const endIdx = content.indexOf(CLAUDE_REF_END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    return false;
  }

  // Remove from start marker to end marker (inclusive)
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + CLAUDE_REF_END_MARKER.length);

  // Clean up: remove trailing newlines from before, keep single newline separation
  const newContent = (before.trimEnd() + after).trim();

  // Only write if file would not be empty
  if (newContent.length > 0) {
    await writeFile(claudeMdPath, newContent + '\n', 'utf-8');
  } else {
    await writeFile(claudeMdPath, '', 'utf-8');
  }

  return true;
}
