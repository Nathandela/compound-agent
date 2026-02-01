/**
 * Setup commands: init, setup claude, hooks, download-model
 *
 * Commands for setting up and configuring learning-agent.
 */

import { chmodSync, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { formatBytes, getRepoRoot } from '../cli-utils.js';
import { isModelAvailable, MODEL_FILENAME, resolveModel } from '../index.js';
import { LESSONS_PATH } from '../storage/index.js';

import { getGlobalOpts, out } from './shared.js';

// ============================================================================
// Hooks Constants
// ============================================================================

/** Pre-commit hook reminder message */
const PRE_COMMIT_MESSAGE = `Before committing, have you captured any valuable lessons from this session?
Consider: corrections, mistakes, or insights worth remembering.

To capture a lesson:
  npx lna capture --trigger "what happened" --insight "what to do" --yes`;

/** Pre-commit hook shell script template */
const PRE_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Learning Agent pre-commit hook
# Reminds Claude to consider capturing lessons before commits

npx lna hooks run pre-commit
`;

// ============================================================================
// Claude Code Hooks Configuration
// ============================================================================

/** Marker to identify our hook in Claude Code settings */
const CLAUDE_HOOK_MARKER = 'lna load-session';

/** Claude Code SessionStart hook configuration */
const CLAUDE_HOOK_CONFIG = {
  matcher: 'startup|resume|compact',
  hooks: [
    {
      type: 'command',
      command: 'npx lna load-session 2>/dev/null || true',
    },
  ],
};

/** Marker comment to identify our hook */
const HOOK_MARKER = '# Learning Agent pre-commit hook';

// ============================================================================
// Init Command Helpers
// ============================================================================

/** Section header to check for idempotency */
const LEARNING_AGENT_SECTION_HEADER = '## Learning Agent Integration';

/** Template content for AGENTS.md */
const AGENTS_MD_TEMPLATE = `
## Learning Agent Integration

This project uses learning-agent for session memory.

### Retrieval Points

- **Session start**: High-severity lessons loaded automatically
- **Plan-time**: BEFORE implementing a plan, run check-plan to retrieve relevant lessons

### Plan-Time Retrieval (Explicit Step)

**BEFORE implementing any plan**, run:

\`\`\`bash
npx lna check-plan --plan "your plan description" --json
\`\`\`

Display results as a **Lessons Check** section after your plan:

\`\`\`
## Lessons Check
1. [insight from lesson 1] (relevance: 0.85)
2. [insight from lesson 2] (relevance: 0.72)
\`\`\`

Consider each lesson while implementing.

### Proposing Lessons

Propose when: user correction, self-correction, test failure fix, or manual request.

**Quality gate (ALL must pass):**

- Novel (not already stored)
- Specific (clear guidance)
- Actionable (obvious what to do)

**Confirmation format:**

\`\`\`
Learned: [insight]. Save? [y/n]
\`\`\`

### Session-End Protocol

Before closing a session, reflect on lessons learned:

1. **Review**: What mistakes or corrections happened?
2. **Quality gate**: Is it novel, specific, actionable?
3. **Propose**: "Learned: [insight]. Save? [y/n]"
4. **Capture**: \`npx lna capture --trigger "..." --insight "..." --yes\`

### CLI Commands

\`\`\`bash
npx lna load-session --json  # Session start
npx lna check-plan --plan "..." --json  # Before implementing
npx lna capture --trigger "..." --insight "..." --yes
\`\`\`

See [AGENTS.md](https://github.com/Nathandela/learning_agent/blob/main/AGENTS.md) for full documentation.
`;

/**
 * Check if AGENTS.md already has the Learning Agent section.
 */
function hasLearningAgentSection(content: string): boolean {
  return content.includes(LEARNING_AGENT_SECTION_HEADER);
}

/**
 * Create the lessons directory structure.
 */
async function createLessonsDirectory(repoRoot: string): Promise<void> {
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));
  await mkdir(lessonsDir, { recursive: true });
}

/**
 * Create empty index.jsonl if it doesn't exist.
 */
async function createIndexFile(repoRoot: string): Promise<void> {
  const indexPath = join(repoRoot, LESSONS_PATH);
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '', 'utf-8');
  }
}

/**
 * Create or update AGENTS.md with Learning Agent section.
 */
async function updateAgentsMd(repoRoot: string): Promise<boolean> {
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

// ============================================================================
// Hooks Helpers
// ============================================================================

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

/** Block to insert into existing hooks */
const LEARNING_AGENT_HOOK_BLOCK = `
# Learning Agent pre-commit hook (appended)
npx lna hooks run pre-commit
`;

/**
 * Find the line index of the first top-level exit statement in a shell script.
 *
 * Top-level means not inside:
 * - Function definitions (between { and })
 * - Heredocs (between <<EOF and EOF)
 *
 * Returns -1 if no top-level exit found.
 */
function findFirstTopLevelExitLine(lines: string[]): number {
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
async function installPreCommitHook(repoRoot: string): Promise<boolean> {
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

// ============================================================================
// Setup Claude Helpers
// ============================================================================

/**
 * Get the path to Claude Code settings file.
 *
 * @param global - If true, return global path (~/.claude/settings.json).
 *                 If false (default), return project-local path (.claude/settings.json).
 */
function getClaudeSettingsPath(global: boolean): string {
  if (global) {
    return join(homedir(), '.claude', 'settings.json');
  }
  const repoRoot = getRepoRoot();
  return join(repoRoot, '.claude', 'settings.json');
}

/**
 * Read and parse Claude Code settings.
 */
async function readClaudeSettings(settingsPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const content = await readFile(settingsPath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Check if our hook is already installed.
 */
function hasClaudeHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  return hooks.SessionStart.some((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return hookEntry.hooks?.some((h) => h.command?.includes(CLAUDE_HOOK_MARKER));
  });
}

/**
 * Add our hook to SessionStart array.
 */
function addLearningAgentHook(settings: Record<string, unknown>): void {
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
 * Remove our hook from SessionStart array.
 */
function removeLearningAgentHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.SessionStart) return false;

  const originalLength = hooks.SessionStart.length;
  hooks.SessionStart = hooks.SessionStart.filter((entry) => {
    const hookEntry = entry as { hooks?: Array<{ command?: string }> };
    return !hookEntry.hooks?.some((h) => h.command?.includes(CLAUDE_HOOK_MARKER));
  });

  return hooks.SessionStart.length < originalLength;
}

/**
 * Write Claude Code settings atomically.
 */
async function writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  const dir = dirname(settingsPath);
  await mkdir(dir, { recursive: true });

  // Write to temp file, then rename (atomic)
  const tempPath = settingsPath + '.tmp';
  await writeFile(tempPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  await rename(tempPath, settingsPath);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register setup commands on the program.
 */
export function registerSetupCommands(program: Command): void {
  /**
   * Init command - Initialize learning-agent in a repository.
   *
   * Creates the lessons directory structure and optionally injects
   * the Learning Agent Integration section into AGENTS.md.
   *
   * @example npx lna init
   * @example npx lna init --skip-agents
   */
  program
    .command('init')
    .description('Initialize learning-agent in this repository')
    .option('--skip-agents', 'Skip AGENTS.md modification')
    .option('--skip-hooks', 'Skip git hooks installation')
    .option('--json', 'Output result as JSON')
    .action(async function (this: Command, options: { skipAgents?: boolean; skipHooks?: boolean; json?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      // Create directory structure
      await createLessonsDirectory(repoRoot);
      await createIndexFile(repoRoot);
      const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));

      // Update AGENTS.md unless skipped
      let agentsMdUpdated = false;
      if (!options.skipAgents) {
        agentsMdUpdated = await updateAgentsMd(repoRoot);
      }

      // Install hooks unless skipped
      let hooksInstalled = false;
      if (!options.skipHooks) {
        hooksInstalled = await installPreCommitHook(repoRoot);
      }

      // Output
      if (options.json) {
        console.log(JSON.stringify({
          initialized: true,
          lessonsDir,
          agentsMd: agentsMdUpdated,
          hooks: hooksInstalled,
        }));
      } else if (!quiet) {
        out.success('Learning agent initialized');
        console.log(`  Lessons directory: ${lessonsDir}`);
        if (agentsMdUpdated) {
          console.log('  AGENTS.md: Updated with Learning Agent section');
        } else if (options.skipAgents) {
          console.log('  AGENTS.md: Skipped (--skip-agents)');
        } else {
          console.log('  AGENTS.md: Already has Learning Agent section');
        }
        if (hooksInstalled) {
          console.log('  Git hooks: pre-commit hook installed');
        } else if (options.skipHooks) {
          console.log('  Git hooks: Skipped (--skip-hooks)');
        } else {
          console.log('  Git hooks: Already installed or not a git repo');
        }
      }
    });

  /**
   * Hooks command - Run git hook scripts.
   *
   * Called by git hooks to output prompts/reminders.
   *
   * @example npx lna hooks run pre-commit
   */
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

  /**
   * Setup command - Configure integrations.
   */
  const setupCommand = program.command('setup').description('Setup integrations');

  setupCommand
    .command('claude')
    .description('Install Claude Code SessionStart hooks')
    .option('--global', 'Install to global ~/.claude/ instead of project')
    .option('--uninstall', 'Remove learning-agent hooks')
    .option('--dry-run', 'Show what would change without writing')
    .option('--json', 'Output as JSON')
    .action(async (options: { global?: boolean; uninstall?: boolean; dryRun?: boolean; json?: boolean }) => {
      const settingsPath = getClaudeSettingsPath(options.global ?? false);
      const displayPath = options.global ? '~/.claude/settings.json' : '.claude/settings.json';

      let settings: Record<string, unknown>;
      try {
        settings = await readClaudeSettings(settingsPath);
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Failed to parse settings file' }));
        } else {
          out.error('Failed to parse settings file. Check if JSON is valid.');
        }
        process.exit(1);
      }

      const alreadyInstalled = hasClaudeHook(settings);

      // Handle uninstall
      if (options.uninstall) {
        if (options.dryRun) {
          if (options.json) {
            console.log(JSON.stringify({ dryRun: true, wouldRemove: alreadyInstalled, location: displayPath }));
          } else {
            if (alreadyInstalled) {
              console.log(`Would remove learning-agent hooks from ${displayPath}`);
            } else {
              console.log('No learning-agent hooks to remove');
            }
          }
          return;
        }

        const removed = removeLearningAgentHook(settings);
        if (removed) {
          await writeClaudeSettings(settingsPath, settings);
          if (options.json) {
            console.log(JSON.stringify({ installed: false, location: displayPath, action: 'removed' }));
          } else {
            out.success('Learning agent hooks removed');
            console.log(`  Location: ${displayPath}`);
          }
        } else {
          if (options.json) {
            console.log(JSON.stringify({ installed: false, location: displayPath, action: 'unchanged' }));
          } else {
            out.info('No learning agent hooks to remove');
            // Suggest the other scope if no hooks found
            if (options.global) {
              console.log('  Hint: Try without --global to check project settings.');
            } else {
              console.log('  Hint: Try with --global flag to check global settings.');
            }
          }
        }
        return;
      }

      // Handle install
      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({ dryRun: true, wouldInstall: !alreadyInstalled, location: displayPath }));
        } else {
          if (alreadyInstalled) {
            console.log('Learning agent hooks already installed');
          } else {
            console.log(`Would install learning-agent hooks to ${displayPath}`);
          }
        }
        return;
      }

      if (alreadyInstalled) {
        if (options.json) {
          console.log(JSON.stringify({
            installed: true,
            location: displayPath,
            hooks: ['SessionStart'],
            action: 'unchanged',
          }));
        } else {
          out.info('Learning agent hooks already installed');
          console.log(`  Location: ${displayPath}`);
        }
        return;
      }

      // Add hook
      const fileExists = existsSync(settingsPath);
      addLearningAgentHook(settings);
      await writeClaudeSettings(settingsPath, settings);

      if (options.json) {
        console.log(JSON.stringify({
          installed: true,
          location: displayPath,
          hooks: ['SessionStart'],
          action: fileExists ? 'updated' : 'created',
        }));
      } else {
        out.success(options.global ? 'Claude Code hooks installed (global)' : 'Claude Code hooks installed (project-level)');
        console.log(`  Location: ${displayPath}`);
        console.log('  Hook: SessionStart (startup|resume|compact)');
        console.log('');
        console.log('Lessons will be loaded automatically at session start.');
        if (!options.global) {
          console.log('');
          console.log('Note: Project hooks override global hooks.');
        }
      }
    });

  /**
   * Download-model command - Download the embedding model for semantic search.
   *
   * Downloads the EmbeddingGemma model required for check-plan semantic search.
   * Idempotent: skips download if model already exists.
   *
   * @example npx lna download-model
   * @example npx lna download-model --json
   */
  program
    .command('download-model')
    .description('Download the embedding model for semantic search')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const alreadyExisted = isModelAvailable();

      if (alreadyExisted) {
        // Model already exists - get path and size
        const modelPath = join(homedir(), '.node-llama-cpp', 'models', MODEL_FILENAME);
        const size = statSync(modelPath).size;

        if (options.json) {
          console.log(JSON.stringify({ success: true, path: modelPath, size, alreadyExisted: true }));
        } else {
          console.log('Model already exists.');
          console.log(`Path: ${modelPath}`);
          console.log(`Size: ${formatBytes(size)}`);
        }
        return;
      }

      // Download the model
      if (!options.json) {
        console.log('Downloading embedding model...');
      }

      const modelPath = await resolveModel({ cli: !options.json });
      const size = statSync(modelPath).size;

      if (options.json) {
        console.log(JSON.stringify({ success: true, path: modelPath, size, alreadyExisted: false }));
      } else {
        console.log(`\nModel downloaded successfully!`);
        console.log(`Path: ${modelPath}`);
        console.log(`Size: ${formatBytes(size)}`);
      }
    });
}
