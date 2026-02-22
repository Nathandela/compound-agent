/**
 * PostToolUseFailure hook: cross-process failure tracking with memory tip.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Threshold constants */
const SAME_TARGET_THRESHOLD = 2;
const TOTAL_FAILURE_THRESHOLD = 3;

/** State file name for cross-process persistence */
export const STATE_FILE_NAME = '.ca-failure-state.json';

/** Max age for state file before it's considered stale (1 hour) */
const STATE_MAX_AGE_MS = 60 * 60 * 1000;

/** Persisted failure state shape */
export interface FailureState {
  count: number;
  lastTarget: string | null;
  sameTargetCount: number;
  timestamp: number;
}

/** In-memory failure counters (fallback when no stateDir provided) */
let failureCount = 0;
let lastFailedTarget: string | null = null;
let sameTargetCount = 0;

/** Default (empty) failure state */
function defaultState(): FailureState {
  return { count: 0, lastTarget: null, sameTargetCount: 0, timestamp: Date.now() };
}

/** Read failure state from file. Returns defaults on any error or if stale. */
export function readFailureState(stateDir: string): FailureState {
  try {
    const filePath = join(stateDir, STATE_FILE_NAME);
    if (!existsSync(filePath)) return defaultState();
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as FailureState;
    // Check staleness
    if (Date.now() - parsed.timestamp > STATE_MAX_AGE_MS) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

/** Write failure state to file. Silently ignores errors. */
export function writeFailureState(stateDir: string, state: FailureState): void {
  try {
    const filePath = join(stateDir, STATE_FILE_NAME);
    writeFileSync(filePath, JSON.stringify(state), 'utf-8');
  } catch {
    // Fall back silently - never crash the hook process
  }
}

/** Delete state file. Silently ignores errors. */
function deleteStateFile(stateDir: string): void {
  try {
    const filePath = join(stateDir, STATE_FILE_NAME);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Fall back silently
  }
}

/** Tip message for failures */
const FAILURE_TIP = 'Tip: Multiple failures detected. `npx ca search` may have solutions for similar issues.';

/**
 * PostToolUseFailure hook output format.
 */
export interface PostToolFailureHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PostToolUseFailure';
    additionalContext?: string;
  };
}

/** Reset failure state (exported for testing). Deletes state file when stateDir provided. */
export function resetFailureState(stateDir?: string): void {
  failureCount = 0;
  lastFailedTarget = null;
  sameTargetCount = 0;
  if (stateDir) deleteStateFile(stateDir);
}

/** Extract a failure target from tool name and input */
function getFailureTarget(toolName: string, toolInput: Record<string, unknown>): string | null {
  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    const trimmed = toolInput.command.trim();
    const firstSpace = trimmed.indexOf(' ');
    return firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  }
  if ((toolName === 'Edit' || toolName === 'Write') && typeof toolInput.file_path === 'string') {
    return toolInput.file_path;
  }
  return null;
}

/**
 * Process a tool failure and determine if a tip should be shown.
 * When stateDir is provided, persists state to file for cross-process tracking.
 */
export function processToolFailure(
  toolName: string,
  toolInput: Record<string, unknown>,
  stateDir?: string
): PostToolFailureHookOutput {
  // Load persisted state if stateDir provided, otherwise use in-memory
  if (stateDir) {
    const persisted = readFailureState(stateDir);
    failureCount = persisted.count;
    lastFailedTarget = persisted.lastTarget;
    sameTargetCount = persisted.sameTargetCount;
  }

  failureCount++;
  const target = getFailureTarget(toolName, toolInput);
  if (target !== null && target === lastFailedTarget) {
    sameTargetCount++;
  } else {
    sameTargetCount = 1;
    lastFailedTarget = target;
  }
  const shouldShowTip =
    sameTargetCount >= SAME_TARGET_THRESHOLD ||
    failureCount >= TOTAL_FAILURE_THRESHOLD;
  if (shouldShowTip) {
    resetFailureState(stateDir);
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: FAILURE_TIP,
      },
    };
  }

  // Persist updated state if stateDir provided
  if (stateDir) {
    writeFailureState(stateDir, {
      count: failureCount,
      lastTarget: lastFailedTarget,
      sameTargetCount,
      timestamp: Date.now(),
    });
  }

  return {};
}

/**
 * Process a tool success - clear failure state.
 * When stateDir is provided, deletes the state file.
 */
export function processToolSuccess(stateDir?: string): void {
  resetFailureState(stateDir);
}
