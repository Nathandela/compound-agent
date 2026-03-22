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
import { makeHookCommand, resolveHookRunnerPath } from './hook-runner-resolve.js';
import type { ClaudeHooksResult } from './types.js';

type HookCommandConfig = { matcher: string; hooks: Array<{ type: string; command: string }> };
type HookCommand = { type?: string; command?: string };
type HookEntry = { matcher?: string; hooks?: HookCommand[] } & Record<string, unknown>;

interface ManagedHookSpec {
  hookType: string;
  hookName?: string;
  matcher: string;
  legacyCommands?: string[];
  hookRunnerAliases?: string[];
  fallbackConfig: HookCommandConfig;
}

const MANAGED_HOOK_SPECS: ManagedHookSpec[] = [
  {
    hookType: 'SessionStart',
    matcher: '',
    legacyCommands: [
      'npx ca load-session 2>/dev/null || true',
      'npx compound-agent load-session 2>/dev/null || true',
    ],
    fallbackConfig: CLAUDE_HOOK_CONFIG,
  },
  {
    hookType: 'PreCompact',
    matcher: '',
    legacyCommands: [
      'npx ca load-session 2>/dev/null || true',
      'npx compound-agent load-session 2>/dev/null || true',
    ],
    fallbackConfig: CLAUDE_PRECOMPACT_HOOK_CONFIG,
  },
  {
    hookType: 'UserPromptSubmit',
    hookName: 'user-prompt',
    matcher: '',
    fallbackConfig: CLAUDE_USER_PROMPT_HOOK_CONFIG,
  },
  {
    hookType: 'PostToolUseFailure',
    hookName: 'post-tool-failure',
    matcher: 'Bash|Edit|Write',
    fallbackConfig: CLAUDE_POST_TOOL_FAILURE_HOOK_CONFIG,
  },
  {
    hookType: 'PostToolUse',
    hookName: 'post-tool-success',
    matcher: 'Bash|Edit|Write',
    fallbackConfig: CLAUDE_POST_TOOL_SUCCESS_HOOK_CONFIG,
  },
  {
    hookType: 'PostToolUse',
    hookName: 'post-read',
    matcher: 'Read',
    legacyCommands: [
      'npx ca hooks run read-tracker 2>/dev/null || true',
    ],
    hookRunnerAliases: ['read-tracker'],
    fallbackConfig: CLAUDE_POST_READ_HOOK_CONFIG,
  },
  {
    hookType: 'PreToolUse',
    hookName: 'phase-guard',
    matcher: 'Edit|Write',
    fallbackConfig: CLAUDE_PHASE_GUARD_HOOK_CONFIG,
  },
  {
    hookType: 'Stop',
    hookName: 'phase-audit',
    matcher: '',
    legacyCommands: [
      'npx ca hooks run stop-audit 2>/dev/null || true',
    ],
    hookRunnerAliases: ['stop-audit'],
    fallbackConfig: CLAUDE_PHASE_AUDIT_HOOK_CONFIG,
  },
];

const MANAGED_HOOK_TYPES = [...new Set(MANAGED_HOOK_SPECS.map((spec) => spec.hookType))];

export interface CompoundAgentHookStatus {
  hasAnyManagedHooks: boolean;
  hasAllRequiredHooks: boolean;
  hasAllDesiredHooks: boolean;
  hasIncompleteHooks: boolean;
  needsMigration: boolean;
}

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
 * Check if any managed hook command is installed.
 * Matches only exact commands emitted by current or legacy compound-agent setup.
 */
export function hasClaudeHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;

  return MANAGED_HOOK_SPECS.some((spec) => countMatchingCommands(hooks[spec.hookType] ?? [], spec) > 0);
}

/**
 * Check whether every required hook type/config is installed.
 * This is stricter than hasClaudeHook(), which only checks for any marker.
 */
export function hasAllCompoundAgentHooks(settings: Record<string, unknown>): boolean {
  return getCompoundAgentHookStatus(settings).hasAllRequiredHooks;
}

/**
 * Build a hook config entry for a given hook, using hook-runner when available.
 */
function buildHookEntry(spec: ManagedHookSpec, hookRunnerPath: string | undefined): HookCommandConfig {
  return {
    matcher: spec.matcher,
    hooks: [{
      type: 'command',
      command: getDesiredCommand(spec, hookRunnerPath),
    }],
  };
}

function getDesiredCommand(spec: ManagedHookSpec, hookRunnerPath: string | undefined): string {
  if (spec.hookName) {
    return makeHookCommand(hookRunnerPath, spec.hookName);
  }

  return spec.fallbackConfig.hooks[0]!.command;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHookRunnerCommandPattern(commandNames: string[]): RegExp {
  const namesPattern = commandNames.map(escapeRegExp).join('|');
  return new RegExp(`^node ".*(?:[/\\\\]|^)hook-runner\\.js" (?:${namesPattern}) 2>/dev/null \\|\\| true$`);
}

function getManagedCommandMatchers(spec: ManagedHookSpec, hookRunnerPath: string | undefined): Array<string | RegExp> {
  const matchers: Array<string | RegExp> = [spec.fallbackConfig.hooks[0]!.command];

  if (spec.legacyCommands) {
    matchers.push(...spec.legacyCommands);
  }

  if (spec.hookName) {
    const commandNames = [spec.hookName, ...(spec.hookRunnerAliases ?? [])];
    matchers.push(buildHookRunnerCommandPattern(commandNames));

    if (hookRunnerPath) {
      matchers.push(getDesiredCommand(spec, hookRunnerPath));
    }
  }

  return matchers;
}

function commandMatchesMatcher(command: string | undefined, matcher: string | RegExp): boolean {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  return typeof matcher === 'string' ? trimmed === matcher : matcher.test(trimmed);
}

function commandMatchesSpec(command: string | undefined, spec: ManagedHookSpec, hookRunnerPath: string | undefined): boolean {
  return getManagedCommandMatchers(spec, hookRunnerPath).some((matcher) => commandMatchesMatcher(command, matcher));
}

function countMatchingCommands(hookArray: unknown[], spec: ManagedHookSpec, hookRunnerPath = resolveHookRunnerPath()): number {
  return hookArray.reduce((count, entry) => {
    const hookEntry = entry as HookEntry;
    const matchingHooks = Array.isArray(hookEntry.hooks)
      ? hookEntry.hooks.filter((hook) => commandMatchesSpec(hook.command, spec, hookRunnerPath)).length
      : 0;
    return count + matchingHooks;
  }, 0);
}

function countDesiredCommands(hookArray: unknown[], desiredCommand: string): number {
  return hookArray.reduce((count, entry) => {
    const hookEntry = entry as HookEntry;
    const matchingHooks = Array.isArray(hookEntry.hooks)
      ? hookEntry.hooks.filter((hook) => typeof hook.command === 'string' && hook.command.trim() === desiredCommand).length
      : 0;
    return count + matchingHooks;
  }, 0);
}

function upsertManagedHook(
  hooks: Record<string, unknown[]>,
  spec: ManagedHookSpec,
  hookRunnerPath: string | undefined,
): void {
  const existingEntries = hooks[spec.hookType] ?? [];
  const rewrittenEntries: unknown[] = [];

  for (const entry of existingEntries) {
    const hookEntry = entry as HookEntry;
    if (!Array.isArray(hookEntry.hooks)) {
      rewrittenEntries.push(entry);
      continue;
    }

    const preservedHooks = hookEntry.hooks.filter((hook) => !commandMatchesSpec(hook.command, spec, hookRunnerPath));
    if (preservedHooks.length === hookEntry.hooks.length) {
      rewrittenEntries.push(entry);
      continue;
    }

    if (preservedHooks.length > 0) {
      rewrittenEntries.push({ ...hookEntry, hooks: preservedHooks });
    }
  }

  rewrittenEntries.push(buildHookEntry(spec, hookRunnerPath));
  hooks[spec.hookType] = rewrittenEntries;
}

/**
 * Add all hooks managed by compound-agent.
 * Note: PreCommit is handled by git hooks, not Claude Code hooks.
 *
 * @param settings - Claude Code settings object to modify in-place
 * @param hookRunnerPath - Optional resolved path to dist/hook-runner.js.
 *   When provided, hooks use `node <path>` instead of `npx ca hooks run`.
 */
export function addAllCompoundAgentHooks(
  settings: Record<string, unknown>,
  hookRunnerPath?: string,
): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  for (const spec of MANAGED_HOOK_SPECS) {
    upsertManagedHook(hooks, spec, hookRunnerPath);
  }

  // Note: remind-capture functionality is handled by git pre-commit hooks
  // (see installPreCommitHook in hooks.ts), not Claude Code hooks
}

export function getCompoundAgentHookStatus(
  settings: Record<string, unknown>,
  hookRunnerPath = resolveHookRunnerPath(),
): CompoundAgentHookStatus {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) {
    return {
      hasAnyManagedHooks: false,
      hasAllRequiredHooks: false,
      hasAllDesiredHooks: false,
      hasIncompleteHooks: false,
      needsMigration: false,
    };
  }

  let hasAnyManagedHooks = false;
  let hasAllRequiredHooks = true;
  let hasAllDesiredHooks = true;

  for (const spec of MANAGED_HOOK_SPECS) {
    const hookArray = hooks[spec.hookType] ?? [];
    const totalMatches = countMatchingCommands(hookArray, spec, hookRunnerPath);
    const desiredMatches = countDesiredCommands(hookArray, getDesiredCommand(spec, hookRunnerPath));

    hasAnyManagedHooks ||= totalMatches > 0;
    hasAllRequiredHooks &&= totalMatches > 0;
    hasAllDesiredHooks &&= totalMatches === 1 && desiredMatches === 1;
  }

  const hasIncompleteHooks = hasAnyManagedHooks && !hasAllRequiredHooks;

  return {
    hasAnyManagedHooks,
    hasAllRequiredHooks,
    hasAllDesiredHooks,
    hasIncompleteHooks,
    needsMigration: hasAllRequiredHooks && !hasAllDesiredHooks,
  };
}

/**
 * Remove our hooks from all hook arrays.
 * Removes only exact current/legacy managed hook commands from all hook types.
 */
export function removeCompoundAgentHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;

  let anyRemoved = false;
  const hookRunnerPath = resolveHookRunnerPath();

  for (const hookType of MANAGED_HOOK_TYPES) {
    const hookArray = hooks[hookType];
    if (!hookArray) continue;

    const hookSpecs = MANAGED_HOOK_SPECS.filter((spec) => spec.hookType === hookType);

    const rewrittenEntries: unknown[] = [];
    for (const entry of hookArray) {
      const hookEntry = entry as HookEntry;
      if (!Array.isArray(hookEntry.hooks)) {
        rewrittenEntries.push(entry);
        continue;
      }

      const preservedHooks = hookEntry.hooks.filter((hook) => {
        return !hookSpecs.some((spec) => commandMatchesSpec(hook.command, spec, hookRunnerPath));
      });
      if (preservedHooks.length !== hookEntry.hooks.length) {
        anyRemoved = true;
      }

      if (preservedHooks.length > 0) {
        if (preservedHooks.length === hookEntry.hooks.length) {
          rewrittenEntries.push(entry);
        } else {
          rewrittenEntries.push({ ...hookEntry, hooks: preservedHooks });
        }
      }
    }

    hooks[hookType] = rewrittenEntries;
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

  const hookRunnerPath = resolveHookRunnerPath();
  const before = JSON.stringify(settings);

  addAllCompoundAgentHooks(settings, hookRunnerPath);

  if (JSON.stringify(settings) === before) {
    return { installed: true, action: 'already_installed' };
  }

  try {
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
