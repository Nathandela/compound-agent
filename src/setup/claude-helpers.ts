/**
 * Claude Code settings helpers.
 *
 * Functions for reading, writing, and manipulating Claude Code settings.json.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { getRepoRoot } from '../cli-utils.js';
import {
  AGENTS_SECTION_END_MARKER,
  AGENTS_SECTION_START_MARKER,
  CLAUDE_HOOK_CONFIG,
  CLAUDE_HOOK_MARKERS,
  CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG,
  CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG,
  CLAUDE_PRECOMPACT_HOOK_CONFIG,
  CLAUDE_REF_END_MARKER,
  CLAUDE_REF_START_MARKER,
  CLAUDE_USER_PROMPT_HOOK_CONFIG,
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
 * Checks for both current (ca) and legacy (compound-agent) markers in any hook type.
 */
export function hasClaudeHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;

  // Check all hook types we manage
  const hookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse'];

  return hookTypes.some((hookType) => {
    const hookArray = hooks[hookType];
    if (!hookArray) return false;

    return hookArray.some((entry) => {
      const hookEntry = entry as { hooks?: Array<{ command?: string }> };
      return hookEntry.hooks?.some((h) =>
        CLAUDE_HOOK_MARKERS.some((marker) => h.command?.includes(marker))
      );
    });
  });
}

/**
 * Add our hook to SessionStart array.
 */
export function addCompoundAgentHook(settings: Record<string, unknown>): void {
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
 * Add all v0.2.8 hooks: SessionStart, PreCompact, UserPromptSubmit, PostToolUseFailure, PostToolUse.
 * Note: PreCommit is handled by git hooks, not Claude Code hooks.
 */
export function addAllCompoundAgentHooks(settings: Record<string, unknown>): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  // SessionStart - prime context
  if (!hooks.SessionStart) {
    hooks.SessionStart = [];
  }
  if (!hasHookType(hooks.SessionStart, 'ca prime')) {
    hooks.SessionStart.push(CLAUDE_HOOK_CONFIG);
  }

  // PreCompact - re-inject prime before compaction
  if (!hooks.PreCompact) {
    hooks.PreCompact = [];
  }
  if (!hasHookType(hooks.PreCompact, 'ca prime')) {
    hooks.PreCompact.push(CLAUDE_PRECOMPACT_HOOK_CONFIG);
  }

  // UserPromptSubmit - gentle lesson tool reminders (v0.2.8)
  if (!hooks.UserPromptSubmit) {
    hooks.UserPromptSubmit = [];
  }
  if (!hasHookType(hooks.UserPromptSubmit, 'ca hooks run user-prompt')) {
    hooks.UserPromptSubmit.push(CLAUDE_USER_PROMPT_HOOK_CONFIG);
  }

  // PostToolUseFailure - smart failure detection (v0.2.8)
  if (!hooks.PostToolUseFailure) {
    hooks.PostToolUseFailure = [];
  }
  if (!hasHookType(hooks.PostToolUseFailure, 'ca hooks run post-tool-failure')) {
    hooks.PostToolUseFailure.push(CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG);
  }

  // PostToolUse - reset failure state on success (v0.2.8)
  if (!hooks.PostToolUse) {
    hooks.PostToolUse = [];
  }
  if (!hasHookType(hooks.PostToolUse, 'ca hooks run post-tool-success')) {
    hooks.PostToolUse.push(CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG);
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

// ============================================================================
// MCP Configuration (.mcp.json - project scope)
// ============================================================================

/**
 * Get the path to .mcp.json (project-scope MCP config).
 * This is the correct location for MCP servers per Claude Code docs.
 */
export function getMcpJsonPath(repoRoot?: string): string {
  const root = repoRoot ?? getRepoRoot();
  return join(root, '.mcp.json');
}

/**
 * Read and parse .mcp.json.
 */
export async function readMcpJson(mcpPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(mcpPath)) {
    return {};
  }
  const content = await readFile(mcpPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Write .mcp.json atomically.
 */
export async function writeMcpJson(mcpPath: string, config: Record<string, unknown>): Promise<void> {
  const tempPath = mcpPath + '.tmp';
  await writeFile(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await rename(tempPath, mcpPath);
}

/**
 * Add MCP server configuration to .mcp.json.
 * Returns true if added, false if already exists.
 */
export async function addMcpServerToMcpJson(repoRoot?: string): Promise<boolean> {
  const mcpPath = getMcpJsonPath(repoRoot);
  const config = await readMcpJson(mcpPath);

  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  const mcpServers = config.mcpServers as Record<string, unknown>;

  if (mcpServers['compound-agent']) {
    return false; // Already configured
  }

  Object.assign(mcpServers, MCP_SERVER_CONFIG);
  await writeMcpJson(mcpPath, config);
  return true;
}

/**
 * Check if MCP server is configured in .mcp.json.
 */
export async function hasMcpServerInMcpJson(repoRoot?: string): Promise<boolean> {
  const mcpPath = getMcpJsonPath(repoRoot);
  const config = await readMcpJson(mcpPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  return !!mcpServers?.['compound-agent'];
}

/**
 * Remove MCP server from .mcp.json.
 */
export async function removeMcpServerFromMcpJson(repoRoot?: string): Promise<boolean> {
  const mcpPath = getMcpJsonPath(repoRoot);
  const config = await readMcpJson(mcpPath);
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;

  if (!mcpServers?.['compound-agent']) {
    return false;
  }

  delete mcpServers['compound-agent'];
  await writeMcpJson(mcpPath, config);
  return true;
}

// Legacy functions for backwards compatibility (settings.json)
// These are deprecated - use the McpJson functions above

/**
 * @deprecated Use addMcpServerToMcpJson instead
 */
export function addMcpServer(settings: Record<string, unknown>): boolean {
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  const mcpServers = settings.mcpServers as Record<string, unknown>;

  if (mcpServers['compound-agent']) {
    return false; // Already configured
  }

  Object.assign(mcpServers, MCP_SERVER_CONFIG);
  return true;
}

/**
 * @deprecated Use hasMcpServerInMcpJson instead
 */
export function hasMcpServer(settings: Record<string, unknown>): boolean {
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  return !!mcpServers?.['compound-agent'];
}

/**
 * @deprecated Use removeMcpServerFromMcpJson instead
 */
export function removeMcpServer(settings: Record<string, unknown>): boolean {
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers?.['compound-agent']) {
    return false;
  }
  delete mcpServers['compound-agent'];
  return true;
}

/**
 * Remove our hooks from all hook arrays.
 * Removes both current (ca) and legacy (compound-agent) hooks from all hook types.
 */
export function removeCompoundAgentHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;

  let anyRemoved = false;

  // Hook types we manage
  const hookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse'];

  for (const hookType of hookTypes) {
    if (!hooks[hookType]) continue;

    const originalLength = hooks[hookType].length;
    hooks[hookType] = hooks[hookType].filter((entry) => {
      const hookEntry = entry as { hooks?: Array<{ command?: string }> };
      return !hookEntry.hooks?.some((h) =>
        CLAUDE_HOOK_MARKERS.some((marker) => h.command?.includes(marker))
      );
    });

    if (hooks[hookType].length < originalLength) {
      anyRemoved = true;
    }
  }

  return anyRemoved;
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
    addCompoundAgentHook(settings);
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
