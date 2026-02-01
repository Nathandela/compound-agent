/**
 * Hooks command - Git hooks management.
 */

import { chmodSync, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
 */
export async function installPreCommitHook(repoRoot: string): Promise<boolean> {
  const gitHooksDir = await getGitHooksDir(repoRoot);

  // Skip if not a git repo or no hooks directory
  if (!gitHooksDir) {
    return false;
  }

  // Ensure hooks directory exists
  await mkdir(gitHooksDir, { recursive: true });

  const hookPath = join(gitHooksDir, 'pre-commit');

  // Check if hook already exists
  if (existsSync(hookPath)) {
    const content = await readFile(hookPath, 'utf-8');
    if (hasLearningAgentHook(content)) {
      return false; // Already installed
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
    return true;
  }

  // Create new hook file with full template
  await writeFile(hookPath, PRE_COMMIT_HOOK_TEMPLATE, 'utf-8');
  chmodSync(hookPath, HOOK_FILE_MODE);

  return true;
}

/**
 * Register the hooks command on the program.
 */
export function registerHooksCommand(program: Command): void {
  const hooksCommand = program.command('hooks').description('Git hooks management');

  hooksCommand
    .command('run <hook>')
    .description('Run a hook script (called by git hooks)')
    .option('--json', 'Output as JSON')
    .action((hook: string, options: { json?: boolean }) => {
      if (hook === 'pre-commit') {
        if (options.json) {
          console.log(JSON.stringify({ hook: 'pre-commit', message: PRE_COMMIT_MESSAGE }));
        } else {
          console.log(PRE_COMMIT_MESSAGE);
        }
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
