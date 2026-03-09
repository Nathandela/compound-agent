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
  CLAUDE_PHASE_AUDIT_HOOK_CONFIG,
  CLAUDE_PHASE_GUARD_HOOK_CONFIG,
  CLAUDE_POST_READ_HOOK_CONFIG,
  CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG,
  CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG,
  CLAUDE_PRECOMPACT_HOOK_CONFIG,
  CLAUDE_REF_END_MARKER,
  CLAUDE_REF_START_MARKER,
  CLAUDE_USER_PROMPT_HOOK_CONFIG,
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
  const hookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse', 'PreToolUse', 'Stop'];

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
 * Check whether every required hook type/config is installed.
 * This is stricter than hasClaudeHook(), which only checks for any marker.
 */
export function hasAllCompoundAgentHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;

  return (
    hasHookTypeAny(hooks.SessionStart ?? [], ['ca prime']) &&
    hasHookTypeAny(hooks.PreCompact ?? [], ['ca prime']) &&
    hasHookTypeAny(hooks.UserPromptSubmit ?? [], ['ca hooks run user-prompt']) &&
    hasHookTypeAny(hooks.PostToolUseFailure ?? [], ['ca hooks run post-tool-failure']) &&
    hasHookTypeAny(hooks.PostToolUse ?? [], ['ca hooks run post-tool-success']) &&
    hasHookTypeAny(hooks.PostToolUse ?? [], ['ca hooks run post-read', 'ca hooks run read-tracker']) &&
    hasHookTypeAny(hooks.PreToolUse ?? [], ['ca hooks run phase-guard']) &&
    hasHookTypeAny(hooks.Stop ?? [], ['ca hooks run phase-audit', 'ca hooks run stop-audit'])
  );
}

/**
 * Add all hooks managed by compound-agent.
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
  if (!hasHookTypeAny(hooks.SessionStart, ['ca prime'])) {
    hooks.SessionStart.push(CLAUDE_HOOK_CONFIG);
  }

  // PreCompact - re-inject prime before compaction
  if (!hooks.PreCompact) {
    hooks.PreCompact = [];
  }
  if (!hasHookTypeAny(hooks.PreCompact, ['ca prime'])) {
    hooks.PreCompact.push(CLAUDE_PRECOMPACT_HOOK_CONFIG);
  }

  // UserPromptSubmit - gentle lesson tool reminders
  if (!hooks.UserPromptSubmit) {
    hooks.UserPromptSubmit = [];
  }
  if (!hasHookTypeAny(hooks.UserPromptSubmit, ['ca hooks run user-prompt'])) {
    hooks.UserPromptSubmit.push(CLAUDE_USER_PROMPT_HOOK_CONFIG);
  }

  // PostToolUseFailure - smart failure detection
  if (!hooks.PostToolUseFailure) {
    hooks.PostToolUseFailure = [];
  }
  if (!hasHookTypeAny(hooks.PostToolUseFailure, ['ca hooks run post-tool-failure'])) {
    hooks.PostToolUseFailure.push(CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG);
  }

  // PostToolUse - reset failure state on success
  if (!hooks.PostToolUse) {
    hooks.PostToolUse = [];
  }
  if (!hasHookTypeAny(hooks.PostToolUse, ['ca hooks run post-tool-success'])) {
    hooks.PostToolUse.push(CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG);
  }

  // PostToolUse - read tracker (tracks skill file reads)
  if (!hasHookTypeAny(hooks.PostToolUse, ['ca hooks run post-read', 'ca hooks run read-tracker'])) {
    hooks.PostToolUse.push(CLAUDE_POST_READ_HOOK_CONFIG);
  }

  // PreToolUse - phase guard (warns before Edit/Write without skill read)
  if (!hooks.PreToolUse) {
    hooks.PreToolUse = [];
  }
  if (!hasHookTypeAny(hooks.PreToolUse, ['ca hooks run phase-guard'])) {
    hooks.PreToolUse.push(CLAUDE_PHASE_GUARD_HOOK_CONFIG);
  }

  // Stop - audit hook (blocks stop when phase gate not passed)
  if (!hooks.Stop) {
    hooks.Stop = [];
  }
  if (!hasHookTypeAny(hooks.Stop, ['ca hooks run phase-audit', 'ca hooks run stop-audit'])) {
    hooks.Stop.push(CLAUDE_PHASE_AUDIT_HOOK_CONFIG);
  }

  // Note: remind-capture functionality is handled by git pre-commit hooks
  // (see installPreCommitHook in hooks.ts), not Claude Code hooks
}

/**
 * Check if a hook type already has a command containing any marker.
 */
function hasHookTypeAny(hookArray: unknown[], markers: string[]): boolean {
  return hookArray.some((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return hookEntry.hooks?.some((h) => markers.some((marker) => h.command?.includes(marker)));
  });
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
  const hookTypes = ['SessionStart', 'PreCompact', 'UserPromptSubmit', 'PostToolUseFailure', 'PostToolUse', 'PreToolUse', 'Stop'];

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

  if (hasAllCompoundAgentHooks(settings)) {
    return { installed: true, action: 'already_installed' };
  }

  try {
    addAllCompoundAgentHooks(settings);
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
