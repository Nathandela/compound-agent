/**
 * Hooks command - Git hooks management.
 */

import { chmodSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';

import { formatError } from '../cli-error-format.js';
import { getRepoRoot } from '../cli-utils.js';
import { processUserPrompt } from './hooks-user-prompt.js';
import { processToolFailure, processToolSuccess } from './hooks-failure-tracker.js';
import { processPhaseGuard } from './hooks-phase-guard.js';
import { processReadTracker } from './hooks-read-tracker.js';
import { processStopAudit } from './hooks-stop-audit.js';
import {
  HOOK_MARKER,
  COMPOUND_AGENT_HOOK_BLOCK,
  PRE_COMMIT_HOOK_TEMPLATE,
  PRE_COMMIT_MESSAGE,
  POST_COMMIT_HOOK_MARKER,
  POST_COMMIT_HOOK_TEMPLATE,
  COMPOUND_AGENT_POST_COMMIT_BLOCK,
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

// Re-export extracted modules for backwards compatibility
export { detectCorrection, detectPlanning, processUserPrompt } from './hooks-user-prompt.js';
export type { UserPromptHookOutput } from './hooks-user-prompt.js';
export {
  processToolFailure,
  processToolSuccess,
  resetFailureState,
  readFailureState,
  writeFailureState,
  STATE_FILE_NAME,
} from './hooks-failure-tracker.js';
export type { FailureState, PostToolFailureHookOutput } from './hooks-failure-tracker.js';

/**
 * Check if a pre-commit hook already exists with our marker.
 */
function hasCompoundAgentHook(content: string): boolean {
  return content.includes(HOOK_MARKER);
}

/**
 * Get the git hooks directory, respecting core.hooksPath if set.
 */
async function getGitHooksDir(repoRoot: string): Promise<string | null> {
  const gitPath = join(repoRoot, '.git');

  if (!existsSync(gitPath)) {
    return null;
  }

  // Resolve actual .git dir (may be a file in worktrees: "gitdir: ../../.git/worktrees/foo")
  let gitDir = gitPath;
  if (lstatSync(gitPath).isFile()) {
    const content = readFileSync(gitPath, 'utf-8').trim();
    const match = /^gitdir:\s*(.+)$/.exec(content);
    if (!match?.[1]) return null;
    gitDir = resolve(repoRoot, match[1]);
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
    if (hasCompoundAgentHook(content)) {
      return { status: 'already_installed' };
    }

    // Find insertion point: before first top-level exit, or at end
    const lines = content.split('\n');
    const exitLineIndex = findFirstTopLevelExitLine(lines);

    let newContent: string;
    if (exitLineIndex === -1) {
      // No top-level exit found - append to end
      newContent = content.trimEnd() + '\n' + COMPOUND_AGENT_HOOK_BLOCK;
    } else {
      // Insert before the exit line
      const before = lines.slice(0, exitLineIndex);
      const after = lines.slice(exitLineIndex);
      newContent = before.join('\n') + COMPOUND_AGENT_HOOK_BLOCK + after.join('\n');
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
 * Install post-commit hook for auto-indexing docs/ on commit.
 *
 * Mirrors installPreCommitHook: respects core.hooksPath, appends to
 * existing hooks, uses marker for idempotency.
 */
export async function installPostCommitHook(repoRoot: string): Promise<HookInstallResult> {
  const gitHooksDir = await getGitHooksDir(repoRoot);

  if (!gitHooksDir) {
    return { status: 'not_git_repo' };
  }

  await mkdir(gitHooksDir, { recursive: true });

  const hookPath = join(gitHooksDir, 'post-commit');

  if (existsSync(hookPath)) {
    const content = await readFile(hookPath, 'utf-8');
    if (content.includes(POST_COMMIT_HOOK_MARKER)) {
      return { status: 'already_installed' };
    }

    const lines = content.split('\n');
    const exitLineIndex = findFirstTopLevelExitLine(lines);

    let newContent: string;
    if (exitLineIndex === -1) {
      newContent = content.trimEnd() + '\n' + COMPOUND_AGENT_POST_COMMIT_BLOCK;
    } else {
      const before = lines.slice(0, exitLineIndex);
      const after = lines.slice(exitLineIndex);
      newContent = before.join('\n') + COMPOUND_AGENT_POST_COMMIT_BLOCK + after.join('\n');
    }

    await writeFile(hookPath, newContent, 'utf-8');
    chmodSync(hookPath, HOOK_FILE_MODE);
    return { status: 'appended' };
  }

  await writeFile(hookPath, POST_COMMIT_HOOK_TEMPLATE, 'utf-8');
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
 * Uses file-based persistence for cross-process failure tracking.
 */
async function runPostToolFailureHook(): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as {
      tool_name?: string;
      tool_input?: Record<string, unknown>;
    };

    if (!data.tool_name) {
      console.log(JSON.stringify({}));
      return;
    }

    const stateDir = join(getRepoRoot(), '.claude');
    const result = processToolFailure(data.tool_name, data.tool_input ?? {}, stateDir);
    console.log(JSON.stringify(result));
  } catch {
    console.log(JSON.stringify({}));
  }
}

/**
 * Run the PostToolUse hook for success.
 * Reads JSON from stdin, clears failure state and state file.
 */
async function runPostToolSuccessHook(): Promise<void> {
  try {
    await readStdin();
    const stateDir = join(getRepoRoot(), '.claude');
    processToolSuccess(stateDir);
    console.log(JSON.stringify({}));
  } catch {
    console.log(JSON.stringify({}));
  }
}

/** Run a tool-based hook: read stdin JSON, extract tool_name/tool_input, call processor. */
async function runToolHook(
  processor: (repoRoot: string, toolName: string, toolInput: Record<string, unknown>) => unknown
): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as { tool_name?: string; tool_input?: Record<string, unknown> };
    if (!data.tool_name) { console.log(JSON.stringify({})); return; }
    console.log(JSON.stringify(processor(getRepoRoot(), data.tool_name, data.tool_input ?? {})));
  } catch { console.log(JSON.stringify({})); }
}

/** Run the Stop audit hook. */
async function runStopAuditHook(): Promise<void> {
  try {
    const input = await readStdin();
    const data = JSON.parse(input) as { stop_hook_active?: boolean };
    console.log(JSON.stringify(processStopAudit(getRepoRoot(), data.stop_hook_active ?? false)));
  } catch { console.log(JSON.stringify({})); }
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
      } else if (hook === 'phase-guard') {
        await runToolHook(processPhaseGuard);
      } else if (hook === 'post-read' || hook === 'read-tracker') {
        await runToolHook(processReadTracker);
      } else if (hook === 'phase-audit' || hook === 'stop-audit') {
        // Stop hook - stop audit
        await runStopAuditHook();
      } else {
        if (options.json) {
          console.log(JSON.stringify({ error: `Unknown hook: ${hook}` }));
        } else {
          console.error(
            formatError(
              'hooks',
              'UNKNOWN_HOOK',
              `Unknown hook: ${hook}`,
              'Valid hooks: pre-commit, user-prompt, post-tool-failure, post-tool-success, post-read (or read-tracker), phase-guard, phase-audit (or stop-audit)'
            )
          );
        }
        process.exitCode = 1;
      }
    });
}
