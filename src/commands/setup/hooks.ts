/**
 * Hooks command - Git hooks management.
 */

import { chmodSync, existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

import { out } from '../shared.js';
import {
  HOOK_MARKER,
  LEARNING_AGENT_HOOK_BLOCK,
  PRE_COMMIT_HOOK_TEMPLATE,
  PRE_COMMIT_MESSAGE,
} from './templates.js';

/** Make hook file executable (mode 0o755) */
const HOOK_FILE_MODE = 0o755;

/**
 * Result of pre-commit hook installation.
 * Discriminated union for clear status messages.
 */
export type HookInstallResult =
  | { status: 'installed' }
  | { status: 'already_installed' }
  | { status: 'not_git_repo' }
  | { status: 'appended' };

// ============================================================================
// UserPromptSubmit Hook: Gentle lesson tool reminders
// ============================================================================

/** Patterns that suggest user is correcting Claude */
const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\bno[,.]?\s/i,
  /\bwrong\b/i,
  /\bthat'?s not right\b/i,
  /\bthat'?s incorrect\b/i,
  /\buse .+ instead\b/i,
  /\bi told you\b/i,
  /\bi already said\b/i,
  /\bnot like that\b/i,
  /\byou forgot\b/i,
  /\byou missed\b/i,
  /\bstop\b/i,
  /\bwait\b/i,
];

/** Patterns that suggest user wants planning/implementation */
const PLANNING_PATTERNS = [
  // Decision language
  /\bdecide\b/i,
  /\bchoose\b/i,
  /\bpick\b/i,
  /\bwhich approach\b/i,
  /\bwhat do you think\b/i,
  /\bshould we\b/i,
  /\bwould you\b/i,
  /\bhow should\b/i,
  /\bwhat'?s the best\b/i,
  // Implementation language
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\brefactor\b/i,
  /\bfix\b/i,
  /\badd feature\b/i,
  /\bwrite\b/i,
  /\bdevelop\b/i,
  /\bset up\b/i,
];

/** Reminder messages */
const CORRECTION_REMINDER =
  'Remember: You have lesson tools available - lesson_capture to save insights, lesson_search to find past solutions.';

const PLANNING_REMINDER =
  'If you\'re uncertain or hesitant, remember your lesson tools: lesson_search may have relevant context from past sessions.';

/** Check if prompt matches correction patterns */
export function detectCorrection(prompt: string): boolean {
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(prompt));
}

/** Check if prompt matches planning patterns */
export function detectPlanning(prompt: string): boolean {
  return PLANNING_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * UserPromptSubmit hook output format.
 * Claude Code expects this structure for additionalContext injection.
 */
export interface UserPromptHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit';
    additionalContext?: string;
  };
}

/**
 * Process a user prompt and determine if a reminder should be injected.
 *
 * @param prompt - The user's message text
 * @returns Hook output with optional additionalContext
 */
export function processUserPrompt(prompt: string): UserPromptHookOutput {
  // Priority: corrections first, then planning
  if (detectCorrection(prompt)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: CORRECTION_REMINDER,
      },
    };
  }

  if (detectPlanning(prompt)) {
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: PLANNING_REMINDER,
      },
    };
  }

  // No reminder needed
  return {};
}

// ============================================================================
// PostToolUseFailure Hook: Smart failure detection with lesson tip
// ============================================================================

/** Recorded tool failure */
interface FailureRecord {
  tool: string;
  command?: string;
  file?: string;
  timestamp: string;
}

/** Failure tracking state */
interface FailureState {
  failures: FailureRecord[];
  lastTipShown?: string;
}

/** Threshold constants */
const SAME_PATTERN_THRESHOLD = 2;
const TOTAL_FAILURE_THRESHOLD = 3;

/** Get the path to the failure state file for a session */
function getFailureStatePath(sessionId: string): string {
  return join(tmpdir(), `lna-failures-${sessionId}.json`);
}

/** Load failure state from temp file */
async function loadFailureState(sessionId: string): Promise<FailureState> {
  const statePath = getFailureStatePath(sessionId);
  try {
    if (!existsSync(statePath)) {
      return { failures: [] };
    }
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as FailureState;
  } catch {
    return { failures: [] };
  }
}

/** Save failure state to temp file */
async function saveFailureState(sessionId: string, state: FailureState): Promise<void> {
  const statePath = getFailureStatePath(sessionId);
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/** Clear failure state (on success) */
async function clearFailureState(sessionId: string): Promise<void> {
  const statePath = getFailureStatePath(sessionId);
  try {
    if (existsSync(statePath)) {
      await unlink(statePath);
    }
  } catch {
    // Ignore errors - file might be already deleted
  }
}

/** Extract base command from a full command string (strip arguments) */
function extractBaseCommand(command: string): string {
  // Get first word of the command
  const trimmed = command.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
}

/** Check if we have repeated failures on the same file */
function hasSameFileFailures(failures: FailureRecord[]): boolean {
  const fileCounts = new Map<string, number>();
  for (const f of failures) {
    if (f.file) {
      const count = (fileCounts.get(f.file) ?? 0) + 1;
      if (count >= SAME_PATTERN_THRESHOLD) return true;
      fileCounts.set(f.file, count);
    }
  }
  return false;
}

/** Check if we have repeated failures with same command */
function hasSameCommandFailures(failures: FailureRecord[]): boolean {
  const cmdCounts = new Map<string, number>();
  for (const f of failures) {
    if (f.command) {
      const base = extractBaseCommand(f.command);
      const count = (cmdCounts.get(base) ?? 0) + 1;
      if (count >= SAME_PATTERN_THRESHOLD) return true;
      cmdCounts.set(base, count);
    }
  }
  return false;
}

/** Tip message for failures */
const FAILURE_TIP = 'Tip: Multiple failures detected. lesson_search may have solutions for similar issues.';

/**
 * PostToolUseFailure hook output format.
 */
export interface PostToolFailureHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PostToolUseFailure';
    additionalContext?: string;
  };
}

/**
 * Process a tool failure and determine if a tip should be shown.
 *
 * @param toolName - Name of the tool that failed
 * @param toolInput - Input provided to the tool
 * @param sessionId - Current session ID
 * @returns Hook output with optional tip
 */
export async function processToolFailure(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string
): Promise<PostToolFailureHookOutput> {
  // Load current state
  const state = await loadFailureState(sessionId);

  // Extract relevant info from tool input
  const failure: FailureRecord = {
    tool: toolName,
    timestamp: new Date().toISOString(),
  };

  // Extract command or file based on tool type
  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    failure.command = toolInput.command;
  } else if ((toolName === 'Edit' || toolName === 'Write') && typeof toolInput.file_path === 'string') {
    failure.file = toolInput.file_path;
  }

  // Add to failures list
  state.failures.push(failure);

  // Check thresholds
  const shouldShowTip =
    hasSameFileFailures(state.failures) ||
    hasSameCommandFailures(state.failures) ||
    state.failures.length >= TOTAL_FAILURE_THRESHOLD;

  // Save state
  await saveFailureState(sessionId, state);

  // Return tip if threshold reached and not recently shown
  if (shouldShowTip) {
    // Clear state after showing tip to avoid spam
    await clearFailureState(sessionId);

    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: FAILURE_TIP,
      },
    };
  }

  return {};
}

/**
 * Process a tool success - clear failure state.
 */
export async function processToolSuccess(sessionId: string): Promise<void> {
  await clearFailureState(sessionId);
}

/**
 * Check if a pre-commit hook already exists with our marker.
 */
function hasLearningAgentHook(content: string): boolean {
  return content.includes(HOOK_MARKER);
}

/**
 * Get the git hooks directory, respecting core.hooksPath if set.
 */
async function getGitHooksDir(repoRoot: string): Promise<string | null> {
  const gitDir = join(repoRoot, '.git');

  // Check if .git directory exists
  if (!existsSync(gitDir)) {
    return null;
  }

  // Check for core.hooksPath in .git/config
  const configPath = join(gitDir, 'config');
  if (existsSync(configPath)) {
    const config = await readFile(configPath, 'utf-8');
    const match = /hooksPath\s*=\s*(.+)$/m.exec(config);
    if (match?.[1]) {
      const hooksPath = match[1].trim();
      // Resolve relative paths from repo root
      return hooksPath.startsWith('/') ? hooksPath : join(repoRoot, hooksPath);
    }
  }

  // Default to .git/hooks
  const defaultHooksDir = join(gitDir, 'hooks');
  return existsSync(defaultHooksDir) ? defaultHooksDir : null;
}

/**
 * Find the line index of the first top-level exit statement in a shell script.
 *
 * Top-level means not inside:
 * - Function definitions (between { and })
 * - Heredocs (between <<EOF and EOF)
 *
 * Returns -1 if no top-level exit found.
 */
export function findFirstTopLevelExitLine(lines: string[]): number {
  let insideFunction = 0; // Brace nesting depth
  let heredocDelimiter: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // Check for heredoc end
    if (heredocDelimiter !== null) {
      if (trimmed === heredocDelimiter) {
        heredocDelimiter = null;
      }
      continue;
    }

    // Check for heredoc start: <<EOF, <<'EOF', <<"EOF", <<-EOF
    const heredocMatch = /<<-?\s*['"]?(\w+)['"]?/.exec(line);
    if (heredocMatch?.[1]) {
      heredocDelimiter = heredocMatch[1];
      continue;
    }

    // Track function braces (simple heuristic)
    // Count opening and closing braces
    for (const char of line) {
      if (char === '{') insideFunction++;
      if (char === '}') insideFunction = Math.max(0, insideFunction - 1);
    }

    // Skip if inside function
    if (insideFunction > 0) {
      continue;
    }

    // Check for top-level exit: exit followed by number, $var, or $?
    // Pattern: start of line, optional whitespace, exit, space, code, end
    if (/^\s*exit\s+(\d+|\$\w+|\$\?)\s*$/.test(trimmed)) {
      return i;
    }
  }

  return -1;
}

/**
 * Install pre-commit hook, respecting core.hooksPath and existing hooks.
 *
 * - Respects core.hooksPath when configured
 * - Appends to existing hooks instead of overwriting
 * - Uses marker to ensure idempotency
 *
 * @returns Discriminated union indicating the installation result
 */
export async function installPreCommitHook(repoRoot: string): Promise<HookInstallResult> {
  const gitHooksDir = await getGitHooksDir(repoRoot);

  // Not a git repo or no hooks directory
  if (!gitHooksDir) {
    return { status: 'not_git_repo' };
  }

  // Ensure hooks directory exists
  await mkdir(gitHooksDir, { recursive: true });

  const hookPath = join(gitHooksDir, 'pre-commit');

  // Check if hook already exists
  if (existsSync(hookPath)) {
    const content = await readFile(hookPath, 'utf-8');
    if (hasLearningAgentHook(content)) {
      return { status: 'already_installed' };
    }

    // Find insertion point: before first top-level exit, or at end
    const lines = content.split('\n');
    const exitLineIndex = findFirstTopLevelExitLine(lines);

    let newContent: string;
    if (exitLineIndex === -1) {
      // No top-level exit found - append to end
      newContent = content.trimEnd() + '\n' + LEARNING_AGENT_HOOK_BLOCK;
    } else {
      // Insert before the exit line
      const before = lines.slice(0, exitLineIndex);
      const after = lines.slice(exitLineIndex);
      newContent = before.join('\n') + LEARNING_AGENT_HOOK_BLOCK + after.join('\n');
    }

    await writeFile(hookPath, newContent, 'utf-8');
    chmodSync(hookPath, HOOK_FILE_MODE);
    return { status: 'appended' };
  }

  // Create new hook file with full template
  await writeFile(hookPath, PRE_COMMIT_HOOK_TEMPLATE, 'utf-8');
  chmodSync(hookPath, HOOK_FILE_MODE);

  return { status: 'installed' };
}

/**
 * Read stdin as a string.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Run the UserPromptSubmit hook.
 * Reads JSON from stdin, processes the prompt, outputs hook result.
 */
async function runUserPromptHook(): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as { prompt?: string };

    if (!data.prompt) {
      // No prompt provided, exit silently
      console.log(JSON.stringify({}));
      return;
    }

    const result = processUserPrompt(data.prompt);
    console.log(JSON.stringify(result));
  } catch {
    // On any error, exit silently with empty output
    console.log(JSON.stringify({}));
  }
}

/**
 * Run the PostToolUseFailure hook.
 * Reads JSON from stdin, tracks failure, outputs tip if threshold reached.
 */
async function runPostToolFailureHook(): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as {
      tool_name?: string;
      tool_input?: Record<string, unknown>;
      session_id?: string;
    };

    if (!data.tool_name || !data.session_id) {
      console.log(JSON.stringify({}));
      return;
    }

    const result = await processToolFailure(
      data.tool_name,
      data.tool_input ?? {},
      data.session_id
    );
    console.log(JSON.stringify(result));
  } catch {
    console.log(JSON.stringify({}));
  }
}

/**
 * Run the PostToolUse hook for success.
 * Reads JSON from stdin, clears failure state.
 */
async function runPostToolSuccessHook(): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as { session_id?: string };

    if (data.session_id) {
      await processToolSuccess(data.session_id);
    }
    console.log(JSON.stringify({}));
  } catch {
    console.log(JSON.stringify({}));
  }
}

/**
 * Register the hooks command on the program.
 */
export function registerHooksCommand(program: Command): void {
  const hooksCommand = program.command('hooks').description('Git hooks management');

  hooksCommand
    .command('run <hook>')
    .description('Run a hook script (called by git/Claude hooks)')
    .option('--json', 'Output as JSON')
    .action(async (hook: string, options: { json?: boolean }) => {
      if (hook === 'pre-commit') {
        if (options.json) {
          console.log(JSON.stringify({ hook: 'pre-commit', message: PRE_COMMIT_MESSAGE }));
        } else {
          console.log(PRE_COMMIT_MESSAGE);
        }
      } else if (hook === 'user-prompt') {
        // UserPromptSubmit hook - reads from stdin, outputs JSON
        await runUserPromptHook();
      } else if (hook === 'post-tool-failure') {
        // PostToolUseFailure hook - tracks failures, outputs tip if threshold
        await runPostToolFailureHook();
      } else if (hook === 'post-tool-success') {
        // PostToolUse hook - clears failure state on success
        await runPostToolSuccessHook();
      } else {
        if (options.json) {
          console.log(JSON.stringify({ error: `Unknown hook: ${hook}` }));
        } else {
          out.error(`Unknown hook: ${hook}`);
        }
        process.exit(1);
      }
    });
}
