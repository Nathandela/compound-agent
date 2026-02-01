#!/usr/bin/env node
/**
 * Learning Agent CLI
 *
 * Commands:
 *   init             - Initialize learning-agent in a repository
 *   learn <insight>  - Capture a new lesson
 *   search <query>   - Search lessons by keyword
 *   list             - List all lessons
 *   detect --input   - Detect learning triggers from input
 *   capture          - Capture lesson from trigger/insight or input file
 *   compact          - Archive old lessons and remove tombstones
 */

import chalk from 'chalk';
import { Command } from 'commander';

import { chmodSync, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// ============================================================================
// Hooks Constants
// ============================================================================

/** Pre-commit hook reminder message */
const PRE_COMMIT_MESSAGE = `Before committing, have you captured any valuable lessons from this session?
Consider: corrections, mistakes, or insights worth remembering.

To capture a lesson:
  npx learning-agent capture --trigger "what happened" --insight "what to do" --yes`;

/** Pre-commit hook shell script template */
const PRE_COMMIT_HOOK_TEMPLATE = `#!/bin/sh
# Learning Agent pre-commit hook
# Reminds Claude to consider capturing lessons before commits

npx learning-agent hooks run pre-commit
`;

// ============================================================================
// Claude Code Hooks Configuration
// ============================================================================

/** Marker to identify our hook in Claude Code settings */
const CLAUDE_HOOK_MARKER = 'learning-agent load-session';

/** Claude Code SessionStart hook configuration */
const CLAUDE_HOOK_CONFIG = {
  matcher: 'startup|resume|compact',
  hooks: [
    {
      type: 'command',
      command: 'npx learning-agent load-session 2>/dev/null || true',
    },
  ],
};

/** Marker comment to identify our hook */
const HOOK_MARKER = '# Learning Agent pre-commit hook';

import { detectAndPropose, parseInputFile } from './capture/index.js';
import type { DetectionResult } from './capture/index.js';
import { formatBytes, getRepoRoot, parseLimit } from './cli-utils.js';
import { isModelAvailable, loadSessionLessons, MODEL_FILENAME, resolveModel, retrieveForPlan, VERSION } from './index.js';
import {
  appendLesson,
  compact,
  countTombstones,
  DB_PATH,
  getRetrievalStats,
  LESSONS_PATH,
  needsCompaction,
  readLessons,
  rebuildIndex,
  searchKeyword,
  syncIfNeeded,
  TOMBSTONE_THRESHOLD,
} from './storage/index.js';
import { generateId, LessonSchema, SeveritySchema } from './types.js';
import type { Lesson, Severity } from './types.js';

// ============================================================================
// Output Formatting Helpers
// ============================================================================

/** Output helper functions for consistent formatting */
const out = {
  success: (msg: string): void => console.log(chalk.green('[ok]'), msg),
  error: (msg: string): void => console.error(chalk.red('[error]'), msg),
  info: (msg: string): void => console.log(chalk.blue('[info]'), msg),
  warn: (msg: string): void => console.log(chalk.yellow('[warn]'), msg),
};

/** Global options interface */
interface GlobalOpts {
  verbose: boolean;
  quiet: boolean;
}

/**
 * Get global options from command.
 */
function getGlobalOpts(cmd: Command): GlobalOpts {
  const opts = cmd.optsWithGlobals() as { verbose?: boolean; quiet?: boolean };
  return {
    verbose: opts.verbose ?? false,
    quiet: opts.quiet ?? false,
  };
}

/** Default limit for search results */
const DEFAULT_SEARCH_LIMIT = '10';

/** Default limit for list results */
const DEFAULT_LIST_LIMIT = '20';

/** Default limit for check-plan results */
const DEFAULT_CHECK_PLAN_LIMIT = '5';

/** Length of ISO date prefix (YYYY-MM-DD) */
const ISO_DATE_PREFIX_LENGTH = 10;

/** Decimal places for average calculations */
const AVG_DECIMAL_PLACES = 1;

/** Decimal places for relevance scores */
const RELEVANCE_DECIMAL_PLACES = 2;

/** Indentation for JSON pretty-printing */
const JSON_INDENT_SPACES = 2;

// ============================================================================
// Capture Command Helpers
// ============================================================================

/** Options for capture command */
interface CaptureOptions {
  trigger?: string;
  insight?: string;
  input?: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * Create a lesson from explicit trigger and insight.
 */
function createLessonFromFlags(trigger: string, insight: string, confirmed: boolean): Lesson {
  return {
    id: generateId(insight),
    type: 'quick',
    trigger,
    insight,
    tags: [],
    source: 'manual',
    context: { tool: 'capture', intent: 'manual capture' },
    created: new Date().toISOString(),
    confirmed,
    supersedes: [],
    related: [],
  };
}

/**
 * Output lesson in JSON format for capture command.
 */
function outputCaptureJson(lesson: Lesson, saved: boolean): void {
  console.log(JSON.stringify({
    id: lesson.id,
    trigger: lesson.trigger,
    insight: lesson.insight,
    type: lesson.type,
    saved,
  }));
}

/**
 * Output lesson preview in human-readable format.
 */
function outputCapturePreview(lesson: Lesson): void {
  console.log('Lesson captured:');
  console.log(`  ID: ${lesson.id}`);
  console.log(`  Trigger: ${lesson.trigger}`);
  console.log(`  Insight: ${lesson.insight}`);
  console.log(`  Type: ${lesson.type}`);
  console.log(`  Tags: ${lesson.tags.length > 0 ? lesson.tags.join(', ') : '(none)'}`);
  console.log('\nSave this lesson? [y/n]');
}

/**
 * Create lesson from input file detection result.
 */
function createLessonFromInputFile(result: DetectionResult, confirmed: boolean): Lesson {
  return {
    id: generateId(result.proposedInsight),
    type: 'quick',
    trigger: result.trigger,
    insight: result.proposedInsight,
    tags: [],
    source: result.source,
    context: { tool: 'capture', intent: 'auto-capture' },
    created: new Date().toISOString(),
    confirmed,
    supersedes: [],
    related: [],
  };
}

// ============================================================================
// Check-Plan Command Helpers
// ============================================================================

/**
 * Read plan text from stdin (non-TTY mode).
 */
async function readPlanFromStdin(): Promise<string | undefined> {
  const { stdin } = await import('node:process');
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
  }
  return undefined;
}

/**
 * Output check-plan results in JSON format.
 */
function outputCheckPlanJson(lessons: Array<{ lesson: Lesson; score: number }>): void {
  const jsonOutput = {
    lessons: lessons.map((l) => ({
      id: l.lesson.id,
      insight: l.lesson.insight,
      relevance: l.score,
      source: l.lesson.source,
    })),
    count: lessons.length,
  };
  console.log(JSON.stringify(jsonOutput));
}

/**
 * Output check-plan results in human-readable format.
 */
function outputCheckPlanHuman(lessons: Array<{ lesson: Lesson; score: number }>, quiet: boolean): void {
  console.log('## Lessons Check\n');
  console.log('Relevant to your plan:\n');

  lessons.forEach((item, i) => {
    const num = i + 1;
    console.log(`${num}. ${chalk.bold(`[${item.lesson.id}]`)} ${item.lesson.insight}`);
    console.log(`   - Relevance: ${item.score.toFixed(RELEVANCE_DECIMAL_PLACES)}`);
    console.log(`   - Source: ${item.lesson.source}`);
    console.log();
  });

  if (!quiet) {
    console.log('---');
    console.log('Consider these lessons while implementing.');
  }
}

// ============================================================================
// Load-Session Command Helpers
// ============================================================================

/**
 * Output load-session results in human-readable format.
 */
function outputSessionLessonsHuman(lessons: Lesson[], quiet: boolean): void {
  console.log('## Session Lessons (High Severity)\n');

  lessons.forEach((lesson, i) => {
    const num = i + 1;
    const date = lesson.created.slice(0, ISO_DATE_PREFIX_LENGTH);

    console.log(`${num}. ${chalk.bold(`[${lesson.id}]`)} ${lesson.insight}`);
    console.log(`   - Source: ${lesson.source} (${date})`);
    if (lesson.tags.length > 0) {
      console.log(`   - Tags: ${lesson.tags.join(', ')}`);
    }
    console.log();
  });

  const lessonWord = lessons.length === 1 ? 'lesson' : 'lessons';
  if (!quiet) {
    console.log('---');
    console.log(`${lessons.length} high-severity ${lessonWord} loaded.`);
  }
}

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
npx learning-agent check-plan --plan "your plan description" --json
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
4. **Capture**: \`npx learning-agent capture --trigger "..." --insight "..." --yes\`

### CLI Commands

\`\`\`bash
npx learning-agent load-session --json  # Session start
npx learning-agent check-plan --plan "..." --json  # Before implementing
npx learning-agent capture --trigger "..." --insight "..." --yes
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

/** Block to append to existing hooks */
const LEARNING_AGENT_HOOK_BLOCK = `
# Learning Agent pre-commit hook (appended)
npx learning-agent hooks run pre-commit
`;

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

    // Append our block to existing hook (non-destructive)
    const newContent = content.trimEnd() + '\n' + LEARNING_AGENT_HOOK_BLOCK;
    await writeFile(hookPath, newContent, 'utf-8');
    chmodSync(hookPath, HOOK_FILE_MODE);
    return true;
  }

  // Create new hook file with full template
  await writeFile(hookPath, PRE_COMMIT_HOOK_TEMPLATE, 'utf-8');
  chmodSync(hookPath, HOOK_FILE_MODE);

  return true;
}

const program = new Command();

// Add global options
program
  .option('-v, --verbose', 'Show detailed output')
  .option('-q, --quiet', 'Suppress non-essential output');

program
  .name('learning-agent')
  .description('Repository-scoped learning system for Claude Code')
  .version(VERSION);

/**
 * Init command - Initialize learning-agent in a repository.
 *
 * Creates the lessons directory structure and optionally injects
 * the Learning Agent Integration section into AGENTS.md.
 *
 * @example npx learning-agent init
 * @example npx learning-agent init --skip-agents
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
 * @example npx learning-agent hooks run pre-commit
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

// ============================================================================
// Setup Command - Configure Claude Code hooks
// ============================================================================

/**
 * Get the path to Claude Code settings file.
 */
function getClaudeSettingsPath(project: boolean): string {
  if (project) {
    const repoRoot = getRepoRoot();
    return join(repoRoot, '.claude', 'settings.json');
  }
  return join(homedir(), '.claude', 'settings.json');
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

const setupCommand = program.command('setup').description('Setup integrations');

setupCommand
  .command('claude')
  .description('Install Claude Code SessionStart hooks')
  .option('--project', 'Install to project .claude directory instead of global')
  .option('--uninstall', 'Remove learning-agent hooks')
  .option('--dry-run', 'Show what would change without writing')
  .option('--json', 'Output as JSON')
  .action(async (options: { project?: boolean; uninstall?: boolean; dryRun?: boolean; json?: boolean }) => {
    const settingsPath = getClaudeSettingsPath(options.project ?? false);
    const displayPath = options.project ? '.claude/settings.json' : '~/.claude/settings.json';

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
      out.success(options.project ? 'Claude Code hooks installed (project-level)' : 'Claude Code hooks installed');
      console.log(`  Location: ${displayPath}`);
      console.log('  Hook: SessionStart (startup|resume|compact)');
      console.log('');
      console.log('Lessons will be loaded automatically at session start.');
      if (options.project) {
        console.log('');
        console.log('Note: Project hooks override global hooks.');
      }
    }
  });

program
  .command('learn <insight>')
  .description('Capture a new lesson')
  .option('-t, --trigger <text>', 'What triggered this lesson')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('-s, --severity <level>', 'Lesson severity: high, medium, low')
  .option('-y, --yes', 'Skip confirmation')
  .action(async function (this: Command, insight: string, options: { trigger?: string; tags: string; severity?: string; yes?: boolean }) {
    const repoRoot = getRepoRoot();
    const { quiet } = getGlobalOpts(this);

    // Validate severity if provided
    let severity: Severity | undefined;
    if (options.severity !== undefined) {
      const result = SeveritySchema.safeParse(options.severity);
      if (!result.success) {
        out.error(`Invalid severity value: "${options.severity}". Valid values are: high, medium, low`);
        process.exit(1);
      }
      severity = result.data;
    }

    // Data coupling invariant: severity !== undefined => type === 'full'
    const lessonType = severity !== undefined ? 'full' : 'quick';

    const lesson: Lesson = {
      id: generateId(insight),
      type: lessonType,
      trigger: options.trigger ?? 'Manual capture',
      insight,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()) : [],
      source: 'manual',
      context: {
        tool: 'cli',
        intent: 'manual learning',
      },
      created: new Date().toISOString(),
      confirmed: true,  // learn command is explicit confirmation
      supersedes: [],
      related: [],
      ...(severity !== undefined && { severity }),
    };

    await appendLesson(repoRoot, lesson);
    out.success(`Learned: ${insight}`);
    if (!quiet) {
      console.log(`ID: ${chalk.dim(lesson.id)}`);
    }
  });

program
  .command('search <query>')
  .description('Search lessons by keyword')
  .option('-n, --limit <number>', 'Maximum results', DEFAULT_SEARCH_LIMIT)
  .action(async function (this: Command, query: string, options: { limit: string }) {
    const repoRoot = getRepoRoot();
    const limit = parseLimit(options.limit, 'limit');
    const { verbose, quiet } = getGlobalOpts(this);

    // Sync index if JSONL has changed
    await syncIfNeeded(repoRoot);

    const results = await searchKeyword(repoRoot, query, limit);

    if (results.length === 0) {
      console.log('No lessons match your search. Try a different query or use "list" to see all lessons.');
      return;
    }

    if (!quiet) {
      out.info(`Found ${results.length} lesson(s):\n`);
    }
    for (const lesson of results) {
      console.log(`[${chalk.cyan(lesson.id)}] ${lesson.insight}`);
      console.log(`  Trigger: ${lesson.trigger}`);
      if (verbose && lesson.context) {
        console.log(`  Context: ${lesson.context.tool} - ${lesson.context.intent}`);
        console.log(`  Created: ${lesson.created}`);
      }
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }
  });

program
  .command('list')
  .description('List all lessons')
  .option('-n, --limit <number>', 'Maximum results', DEFAULT_LIST_LIMIT)
  .action(async function (this: Command, options: { limit: string }) {
    const repoRoot = getRepoRoot();
    const limit = parseLimit(options.limit, 'limit');
    const { verbose, quiet } = getGlobalOpts(this);

    const { lessons, skippedCount } = await readLessons(repoRoot);

    if (lessons.length === 0) {
      console.log('No lessons found. Get started with: learn "Your first lesson"');
      if (skippedCount > 0) {
        out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
      }
      return;
    }

    const toShow = lessons.slice(0, limit);

    // Show summary unless quiet mode
    if (!quiet) {
      out.info(`Showing ${toShow.length} of ${lessons.length} lesson(s):\n`);
    }

    for (const lesson of toShow) {
      console.log(`[${chalk.cyan(lesson.id)}] ${lesson.insight}`);
      if (verbose) {
        console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
        console.log(`  Created: ${lesson.created}`);
        if (lesson.context) {
          console.log(`  Context: ${lesson.context.tool} - ${lesson.context.intent}`);
        }
      } else {
        console.log(`  Type: ${lesson.type} | Source: ${lesson.source}`);
      }
      if (lesson.tags.length > 0) {
        console.log(`  Tags: ${lesson.tags.join(', ')}`);
      }
      console.log();
    }

    if (skippedCount > 0) {
      out.warn(`${skippedCount} corrupted lesson(s) skipped.`);
    }
  });

program
  .command('rebuild')
  .description('Rebuild SQLite index from JSONL')
  .option('-f, --force', 'Force rebuild even if unchanged')
  .action(async (options: { force?: boolean }) => {
    const repoRoot = getRepoRoot();
    if (options.force) {
      console.log('Forcing index rebuild...');
      await rebuildIndex(repoRoot);
      console.log('Index rebuilt.');
    } else {
      const rebuilt = await syncIfNeeded(repoRoot);
      if (rebuilt) {
        console.log('Index rebuilt (JSONL changed).');
      } else {
        console.log('Index is up to date.');
      }
    }
  });

/**
 * Download-model command - Download the embedding model for semantic search.
 *
 * Downloads the EmbeddingGemma model required for check-plan semantic search.
 * Idempotent: skips download if model already exists.
 *
 * @example npx learning-agent download-model
 * @example npx learning-agent download-model --json
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

program
  .command('detect')
  .description('Detect learning triggers from input')
  .requiredOption('--input <file>', 'Path to JSON input file')
  .option('--save', 'Save proposed lesson (requires --yes)')
  .option('-y, --yes', 'Confirm save (required with --save)')
  .option('--json', 'Output result as JSON')
  .action(
    async (options: { input: string; save?: boolean; yes?: boolean; json?: boolean }) => {
      const repoRoot = getRepoRoot();

      // --save requires --yes
      if (options.save && !options.yes) {
        if (options.json) {
          console.log(JSON.stringify({ error: '--save requires --yes flag for confirmation' }));
        } else {
          out.error('--save requires --yes flag for confirmation');
          console.log('Use: detect --input <file> --save --yes');
        }
        process.exit(1);
      }

      const input = await parseInputFile(options.input);
      const result = await detectAndPropose(repoRoot, input);

      if (!result) {
        if (options.json) {
          console.log(JSON.stringify({ detected: false }));
        } else {
          console.log('No learning trigger detected.');
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({ detected: true, ...result }));
        return;
      }

      console.log('Learning trigger detected!');
      console.log(`  Trigger: ${result.trigger}`);
      console.log(`  Source: ${result.source}`);
      console.log(`  Proposed: ${result.proposedInsight}`);

      if (options.save && options.yes) {
        const lesson: Lesson = {
          id: generateId(result.proposedInsight),
          type: 'quick',
          trigger: result.trigger,
          insight: result.proposedInsight,
          tags: [],
          source: result.source,
          context: { tool: 'detect', intent: 'auto-capture' },
          created: new Date().toISOString(),
          confirmed: true,  // --yes confirms the lesson
          supersedes: [],
          related: [],
        };

        await appendLesson(repoRoot, lesson);
        console.log(`\nSaved as lesson: ${lesson.id}`);
      }
    }
  );

/**
 * Capture command - Capture a lesson from trigger/insight or input file.
 *
 * Modes:
 * - Explicit: --trigger "what happened" --insight "what to do"
 * - From file: --input conversation.json (auto-detect trigger)
 *
 * @example npx learning-agent capture --trigger "Wrong API" --insight "Use v2" --yes
 * @example npx learning-agent capture --input session.json --json
 */
program
  .command('capture')
  .description('Capture a lesson from trigger/insight or input file')
  .option('-t, --trigger <text>', 'What triggered this lesson')
  .option('-i, --insight <text>', 'The insight or lesson learned')
  .option('--input <file>', 'Path to JSON input file (alternative to trigger/insight)')
  .option('--json', 'Output result as JSON')
  .option('-y, --yes', 'Skip confirmation and save immediately')
  .action(async function (this: Command, options: CaptureOptions) {
    const repoRoot = getRepoRoot();
    const { verbose } = getGlobalOpts(this);
    let lesson: Lesson | undefined;

    // Mode 1: From --input file
    if (options.input) {
      const input = await parseInputFile(options.input);
      const result = await detectAndPropose(repoRoot, input);
      if (!result) {
        options.json
          ? console.log(JSON.stringify({ detected: false, saved: false }))
          : console.log('No learning trigger detected.');
        return;
      }
      lesson = createLessonFromInputFile(result, options.yes ?? false);
    } else if (options.trigger && options.insight) {
      // Mode 2: From explicit flags
      lesson = createLessonFromFlags(options.trigger, options.insight, options.yes ?? false);
    } else {
      // Missing required options
      const msg = 'Provide either --trigger and --insight, or --input file.';
      options.json ? console.log(JSON.stringify({ error: msg, saved: false })) : out.error(msg);
      process.exit(1);
    }

    // In non-interactive mode, --yes is required
    if (!options.yes && !process.stdin.isTTY) {
      if (options.json) {
        console.log(JSON.stringify({ error: '--yes required in non-interactive mode', saved: false }));
      } else {
        out.error('--yes required in non-interactive mode');
        console.log('Use: capture --trigger "..." --insight "..." --yes');
      }
      process.exit(1);
    }

    // Output and optionally save
    if (options.json) {
      if (options.yes) await appendLesson(repoRoot, lesson);
      outputCaptureJson(lesson, options.yes ?? false);
    } else if (options.yes) {
      await appendLesson(repoRoot, lesson);
      out.success(`Lesson saved: ${lesson.id}`);
      if (verbose) console.log(`  Type: ${lesson.type} | Trigger: ${lesson.trigger}`);
    } else {
      // Interactive mode - show preview (TTY only)
      outputCapturePreview(lesson);
    }
  });

program
  .command('compact')
  .description('Compact lessons: archive old lessons and remove tombstones')
  .option('-f, --force', 'Run compaction even if below threshold')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options: { force?: boolean; dryRun?: boolean }) => {
    const repoRoot = getRepoRoot();

    const tombstones = await countTombstones(repoRoot);
    const needs = await needsCompaction(repoRoot);

    if (options.dryRun) {
      console.log('Dry run - no changes will be made.\n');
      console.log(`Tombstones found: ${tombstones}`);
      console.log(`Compaction needed: ${needs ? 'yes' : 'no'}`);
      return;
    }

    if (!needs && !options.force) {
      console.log(`Compaction not needed (${tombstones} tombstones, threshold is ${TOMBSTONE_THRESHOLD}).`);
      console.log('Use --force to compact anyway.');
      return;
    }

    console.log('Running compaction...');
    const result = await compact(repoRoot);

    console.log('\nCompaction complete:');
    console.log(`  Archived: ${result.archived} lesson(s)`);
    console.log(`  Tombstones removed: ${result.tombstonesRemoved}`);
    console.log(`  Lessons remaining: ${result.lessonsRemaining}`);

    // Rebuild SQLite index after compaction
    await rebuildIndex(repoRoot);
    console.log('  Index rebuilt.');
  });

program
  .command('export')
  .description('Export lessons as JSON to stdout')
  .option('--since <date>', 'Only include lessons created after this date (ISO8601)')
  .option('--tags <tags>', 'Filter by tags (comma-separated, OR logic)')
  .action(async (options: { since?: string; tags?: string }) => {
    const repoRoot = getRepoRoot();

    const { lessons } = await readLessons(repoRoot);

    let filtered = lessons;

    // Filter by date if --since provided
    if (options.since) {
      const sinceDate = new Date(options.since);
      if (Number.isNaN(sinceDate.getTime())) {
        console.error(`Invalid date format: ${options.since}. Use ISO8601 format (e.g., 2024-01-15).`);
        process.exit(1);
      }
      filtered = filtered.filter((lesson) => new Date(lesson.created) >= sinceDate);
    }

    // Filter by tags if --tags provided (OR logic)
    if (options.tags) {
      const filterTags = options.tags.split(',').map((t) => t.trim());
      filtered = filtered.filter((lesson) => lesson.tags.some((tag) => filterTags.includes(tag)));
    }

    // Output JSON to stdout (portable format for sharing)
    console.log(JSON.stringify(filtered, null, JSON_INDENT_SPACES));
  });

program
  .command('import <file>')
  .description('Import lessons from a JSONL file')
  .action(async (file: string) => {
    const repoRoot = getRepoRoot();

    // Read input file
    let content: string;
    try {
      const { readFile } = await import('node:fs/promises');
      content = await readFile(file, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        console.error(`Error: File not found: ${file}`);
      } else {
        console.error(`Error reading file: ${(err as Error).message}`);
      }
      process.exit(1);
    }

    // Get existing lesson IDs
    const { lessons: existingLessons } = await readLessons(repoRoot);
    const existingIds = new Set(existingLessons.map((l) => l.id));

    // Parse and validate each line
    const lines = content.split('\n');
    let imported = 0;
    let skipped = 0;
    let invalid = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        invalid++;
        continue;
      }

      // Validate schema
      const result = LessonSchema.safeParse(parsed);
      if (!result.success) {
        invalid++;
        continue;
      }

      const lesson: Lesson = result.data;

      // Skip if ID already exists
      if (existingIds.has(lesson.id)) {
        skipped++;
        continue;
      }

      // Append lesson
      await appendLesson(repoRoot, lesson);
      existingIds.add(lesson.id);
      imported++;
    }

    // Format summary
    const lessonWord = imported === 1 ? 'lesson' : 'lessons';
    const parts: string[] = [];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (invalid > 0) parts.push(`${invalid} invalid`);

    if (parts.length > 0) {
      console.log(`Imported ${imported} ${lessonWord} (${parts.join(', ')})`);
    } else {
      console.log(`Imported ${imported} ${lessonWord}`);
    }
  });

program
  .command('stats')
  .description('Show database health and statistics')
  .action(async () => {
    const repoRoot = getRepoRoot();

    // Sync index to ensure accurate stats
    await syncIfNeeded(repoRoot);

    // Read lessons from JSONL to get accurate counts
    const { lessons } = await readLessons(repoRoot);
    const deletedCount = await countTombstones(repoRoot);
    const totalLessons = lessons.length;

    // Get retrieval stats from SQLite
    const retrievalStats = getRetrievalStats(repoRoot);
    const totalRetrievals = retrievalStats.reduce((sum, s) => sum + s.count, 0);
    const avgRetrievals = totalLessons > 0 ? (totalRetrievals / totalLessons).toFixed(AVG_DECIMAL_PLACES) : '0.0';

    // Get storage sizes
    const jsonlPath = join(repoRoot, LESSONS_PATH);
    const dbPath = join(repoRoot, DB_PATH);

    let dataSize = 0;
    let indexSize = 0;

    try {
      dataSize = statSync(jsonlPath).size;
    } catch {
      // File doesn't exist
    }

    try {
      indexSize = statSync(dbPath).size;
    } catch {
      // File doesn't exist
    }

    const totalSize = dataSize + indexSize;

    // Format output
    const deletedInfo = deletedCount > 0 ? ` (${deletedCount} deleted)` : '';
    console.log(`Lessons: ${totalLessons} total${deletedInfo}`);
    console.log(`Retrievals: ${totalRetrievals} total, ${avgRetrievals} avg per lesson`);
    console.log(`Storage: ${formatBytes(totalSize)} (index: ${formatBytes(indexSize)}, data: ${formatBytes(dataSize)})`);
  });

/**
 * Load-session command - Load high-severity lessons for session startup.
 *
 * Used by Claude Code hooks to inject critical lessons at session start.
 * Returns lessons sorted by severity/recency for immediate context.
 *
 * @example npx learning-agent load-session --json
 */
program
  .command('load-session')
  .description('Load high-severity lessons for session context')
  .option('--json', 'Output as JSON')
  .action(async function (this: Command, options: { json?: boolean }) {
    const repoRoot = getRepoRoot();
    const { quiet } = getGlobalOpts(this);
    const lessons = await loadSessionLessons(repoRoot);

    if (options.json) {
      console.log(JSON.stringify({ lessons, count: lessons.length }));
      return;
    }

    if (lessons.length === 0) {
      console.log('No high-severity lessons found.');
      return;
    }

    outputSessionLessonsHuman(lessons, quiet);
  });

/**
 * Check-plan command - Check a plan against relevant lessons.
 *
 * Used by Claude Code hooks during plan mode to retrieve lessons
 * that are semantically relevant to the proposed implementation.
 *
 * @example echo "Add authentication" | npx learning-agent check-plan --json
 * @example npx learning-agent check-plan --plan "Refactor the API"
 */
program
  .command('check-plan')
  .description('Check plan against relevant lessons')
  .option('--plan <text>', 'Plan text to check')
  .option('--json', 'Output as JSON')
  .option('-n, --limit <number>', 'Maximum results', DEFAULT_CHECK_PLAN_LIMIT)
  .action(async function (this: Command, options: { plan?: string; json?: boolean; limit: string }) {
    const repoRoot = getRepoRoot();
    const limit = parseLimit(options.limit, 'limit');
    const { quiet } = getGlobalOpts(this);

    // Get plan text from --plan flag or stdin
    const planText = options.plan ?? (await readPlanFromStdin());

    if (!planText) {
      out.error('No plan provided. Use --plan <text> or pipe text to stdin.');
      process.exit(1);
    }

    // Check model availability - hard fail if not available
    if (!isModelAvailable()) {
      if (options.json) {
        console.log(JSON.stringify({
          error: 'Embedding model not available',
          action: 'Run: npx learning-agent download-model',
        }));
      } else {
        out.error('Embedding model not available');
        console.log('');
        console.log('Run: npx learning-agent download-model');
      }
      process.exit(1);
    }

    try {
      const result = await retrieveForPlan(repoRoot, planText, limit);

      if (options.json) {
        outputCheckPlanJson(result.lessons);
        return;
      }

      if (result.lessons.length === 0) {
        console.log('No relevant lessons found for this plan.');
        return;
      }

      outputCheckPlanHuman(result.lessons, quiet);
    } catch (err) {
      // Don't mask errors - surface them clearly
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (options.json) {
        console.log(JSON.stringify({ error: message }));
      } else {
        out.error(`Failed to check plan: ${message}`);
      }
      process.exit(1);
    }
  });

program.parse();
