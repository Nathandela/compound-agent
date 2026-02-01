/**
 * Init command - Initialize learning-agent in a repository
 */

import type { Command } from 'commander';
import { chmodSync, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getRepoRoot } from '../../cli-utils.js';
import { LESSONS_PATH } from '../../storage/index.js';
import {
  addLearningAgentHook,
  getClaudeSettingsPath,
  getGlobalOpts,
  hasClaudeHook,
  HOOK_MARKER,
  out,
  PRE_COMMIT_HOOK_TEMPLATE,
  readClaudeSettings,
  writeClaudeSettings,
} from '../shared.js';

// ============================================================================
// Constants
// ============================================================================

/** Section header to check for idempotency */
const LEARNING_AGENT_SECTION_HEADER = '## Learning Agent Integration';

/** Make hook file executable (mode 0o755) */
const HOOK_FILE_MODE = 0o755;

/** Block to insert into existing hooks */
const LEARNING_AGENT_HOOK_BLOCK = `
# Learning Agent pre-commit hook (appended)
npx lna hooks run pre-commit
`;

/** Template content for AGENTS.md */
const AGENTS_MD_TEMPLATE = `
## Learning Agent Integration

This project uses learning-agent for session memory.

### ⚠️ IMPORTANT: Never Edit JSONL Directly

**DO NOT** manually edit \`.claude/lessons/index.jsonl\`.

Always use CLI commands:

\`\`\`bash
npx lna learn "insight" --severity high    # Create lesson
npx lna update <id> --insight "new text"   # Update lesson
npx lna delete <id>                        # Delete lesson
npx lna list                               # List all lessons
\`\`\`

Manual edits will:
- **Break SQLite sync** - Index becomes stale, search fails
- **Bypass schema validation** - Invalid data corrupts the database
- **Cause silent failures** - Lessons won't load at session start

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

// ============================================================================
// Helpers
// ============================================================================

function hasLearningAgentSection(content: string): boolean {
  return content.includes(LEARNING_AGENT_SECTION_HEADER);
}

async function createLessonsDirectory(repoRoot: string): Promise<void> {
  const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));
  await mkdir(lessonsDir, { recursive: true });
}

async function createIndexFile(repoRoot: string): Promise<void> {
  const indexPath = join(repoRoot, LESSONS_PATH);
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '', 'utf-8');
  }
}

async function updateAgentsMd(repoRoot: string): Promise<boolean> {
  const agentsPath = join(repoRoot, 'AGENTS.md');
  let content = '';
  let existed = false;

  if (existsSync(agentsPath)) {
    content = await readFile(agentsPath, 'utf-8');
    existed = true;
    if (hasLearningAgentSection(content)) {
      return false;
    }
  }

  const newContent = existed ? content.trimEnd() + '\n' + AGENTS_MD_TEMPLATE : AGENTS_MD_TEMPLATE.trim() + '\n';
  await writeFile(agentsPath, newContent, 'utf-8');
  return true;
}

function hasLearningAgentHook(content: string): boolean {
  return content.includes(HOOK_MARKER);
}

async function getGitHooksDir(repoRoot: string): Promise<string | null> {
  const gitDir = join(repoRoot, '.git');

  if (!existsSync(gitDir)) {
    return null;
  }

  const configPath = join(gitDir, 'config');
  if (existsSync(configPath)) {
    const config = await readFile(configPath, 'utf-8');
    const match = /hooksPath\s*=\s*(.+)$/m.exec(config);
    if (match?.[1]) {
      const hooksPath = match[1].trim();
      return hooksPath.startsWith('/') ? hooksPath : join(repoRoot, hooksPath);
    }
  }

  const defaultHooksDir = join(gitDir, 'hooks');
  return existsSync(defaultHooksDir) ? defaultHooksDir : null;
}

function findFirstTopLevelExitLine(lines: string[]): number {
  let insideFunction = 0;
  let heredocDelimiter: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (heredocDelimiter !== null) {
      if (trimmed === heredocDelimiter) {
        heredocDelimiter = null;
      }
      continue;
    }

    const heredocMatch = /<<-?\s*['"]?(\w+)['"]?/.exec(line);
    if (heredocMatch?.[1]) {
      heredocDelimiter = heredocMatch[1];
      continue;
    }

    for (const char of line) {
      if (char === '{') insideFunction++;
      if (char === '}') insideFunction = Math.max(0, insideFunction - 1);
    }

    if (insideFunction > 0) {
      continue;
    }

    if (/^\s*exit\s+(\d+|\$\w+|\$\?)\s*$/.test(trimmed)) {
      return i;
    }
  }

  return -1;
}

async function installPreCommitHook(repoRoot: string): Promise<boolean> {
  const gitHooksDir = await getGitHooksDir(repoRoot);

  if (!gitHooksDir) {
    return false;
  }

  await mkdir(gitHooksDir, { recursive: true });

  const hookPath = join(gitHooksDir, 'pre-commit');

  if (existsSync(hookPath)) {
    const content = await readFile(hookPath, 'utf-8');
    if (hasLearningAgentHook(content)) {
      return false;
    }

    const lines = content.split('\n');
    const exitLineIndex = findFirstTopLevelExitLine(lines);

    let newContent: string;
    if (exitLineIndex === -1) {
      newContent = content.trimEnd() + '\n' + LEARNING_AGENT_HOOK_BLOCK;
    } else {
      const before = lines.slice(0, exitLineIndex);
      const after = lines.slice(exitLineIndex);
      newContent = before.join('\n') + LEARNING_AGENT_HOOK_BLOCK + after.join('\n');
    }

    await writeFile(hookPath, newContent, 'utf-8');
    chmodSync(hookPath, HOOK_FILE_MODE);
    return true;
  }

  await writeFile(hookPath, PRE_COMMIT_HOOK_TEMPLATE, 'utf-8');
  chmodSync(hookPath, HOOK_FILE_MODE);

  return true;
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the init command with the program.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize learning-agent in this repository')
    .option('--skip-agents', 'Skip AGENTS.md modification')
    .option('--skip-hooks', 'Skip git hooks installation')
    .option('--skip-claude', 'Skip Claude Code hooks installation')
    .option('--json', 'Output result as JSON')
    .action(async function (this: Command, options: { skipAgents?: boolean; skipHooks?: boolean; skipClaude?: boolean; json?: boolean }) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      await createLessonsDirectory(repoRoot);
      await createIndexFile(repoRoot);
      const lessonsDir = dirname(join(repoRoot, LESSONS_PATH));

      let agentsMdUpdated = false;
      if (!options.skipAgents) {
        agentsMdUpdated = await updateAgentsMd(repoRoot);
      }

      let hooksInstalled = false;
      if (!options.skipHooks) {
        hooksInstalled = await installPreCommitHook(repoRoot);
      }

      let claudeHooksInstalled = false;
      let claudeHooksError: string | null = null;
      if (!options.skipClaude) {
        try {
          const settingsPath = getClaudeSettingsPath(false);
          const settings = await readClaudeSettings(settingsPath);
          if (!hasClaudeHook(settings)) {
            addLearningAgentHook(settings);
            await writeClaudeSettings(settingsPath, settings);
            claudeHooksInstalled = true;
          }
        } catch (err) {
          claudeHooksError = err instanceof Error ? err.message : 'Unknown error';
        }
      }

      if (options.json) {
        console.log(JSON.stringify({
          initialized: true,
          lessonsDir,
          agentsMd: agentsMdUpdated,
          hooks: hooksInstalled,
          claudeHooks: claudeHooksInstalled,
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
        if (claudeHooksInstalled) {
          console.log('  Claude Code hooks: Installed to .claude/settings.json');
        } else if (options.skipClaude) {
          console.log('  Claude Code hooks: Skipped (--skip-claude)');
        } else if (claudeHooksError) {
          console.log(`  Claude Code hooks: Error - ${claudeHooksError}`);
        } else {
          console.log('  Claude Code hooks: Already installed');
        }
      }
    });
}

// Export template for testing
export { AGENTS_MD_TEMPLATE };
