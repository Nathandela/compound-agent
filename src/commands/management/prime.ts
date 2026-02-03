/**
 * Prime command - Context recovery for Claude Code with Beads-style trust language.
 *
 * Generates trust language guidelines combined with high-severity lessons
 * for context recovery after compaction or session restart.
 */

import type { Command } from 'commander';

import { getRepoRoot } from '../../cli-utils.js';
import { loadSessionLessons } from '../../retrieval/index.js';
import type { Lesson, Source } from '../../types.js';

/**
 * Beads-style trust language template.
 *
 * Uses explicit prohibitions, workflow sequencing, and NEVER/MUST language
 * following Beads conventions for maximum adherence.
 */
const TRUST_LANGUAGE_TEMPLATE = `# Learning Agent Active

> **Context Recovery**: Run \`lna prime\` after compaction, clear, or new session

## Core Constraints

**Default**: Use CLI commands for lesson management
**Prohibited**: NEVER edit .claude/lessons/ files directly

**Default**: Propose lessons freely after corrections
**Prohibited**: NEVER propose without quality gate (novel + specific + actionable)

## Capture Protocol

You MUST use \`lna learn\` AFTER:
- User corrects you ("no", "wrong", "actually...")
- You self-correct after iteration failures
- Test fails then you fix it

**Workflow**: Capture lessons:
1. Check quality gate (ALL must pass):
   - Novel (not already stored)
   - Specific (clear guidance)
   - Actionable (obvious what to do)
2. If pass: \`lna learn "insight"\`
3. If fail: Skip (most sessions have no lessons)

NEVER skip the quality gate. Quality over quantity.

## Retrieval Protocol

You MUST use \`lna search\` BEFORE:
- Architectural decisions or complex planning
- Implementing patterns you've done before in this repo

**Workflow**: Search BEFORE deciding, capture AFTER learning.

## CLI Commands
- \`lna learn "insight"\` - Capture a lesson
- \`lna search "query"\` - Find relevant lessons
- \`lna list\` - Show all lessons
- \`lna check-plan --plan "..."\` - Get lessons for plan
- \`lna stats\` - Database health
`;

/**
 * Format lesson source for human-readable display.
 */
function formatSource(source: Source): string {
  switch (source) {
    case 'user_correction':
      return 'user correction';
    case 'self_correction':
      return 'self correction';
    case 'test_failure':
      return 'test failure';
    case 'manual':
      return 'manual';
    default:
      return source;
  }
}

/**
 * Format a single lesson for the Emergency Recall section.
 *
 * Format: - **{insight}** ({tags})
 *           Learned: {date} via {source}
 */
function formatLessonForPrime(lesson: Lesson): string {
  const date = lesson.created.slice(0, 10); // YYYY-MM-DD
  const tags = lesson.tags.length > 0 ? ` (${lesson.tags.join(', ')})` : '';
  const source = formatSource(lesson.source);
  return `- **${lesson.insight}**${tags}\n  Learned: ${date} via ${source}`;
}

/**
 * Generate prime context output for Claude Code.
 *
 * Combines Beads-style trust language guidelines with high-severity lessons
 * for context recovery after compaction or session restart.
 *
 * @param repoRoot - Repository root directory (defaults to getRepoRoot())
 * @returns Formatted markdown string (< 2K tokens)
 */
export async function getPrimeContext(repoRoot?: string): Promise<string> {
  const root = repoRoot ?? getRepoRoot();

  // Load high-severity lessons (top 5, sorted by recency)
  const lessons = await loadSessionLessons(root, 5);

  // Build output: trust language first
  let output = TRUST_LANGUAGE_TEMPLATE;

  // Add Emergency Recall section if we have high-severity lessons
  if (lessons.length > 0) {
    const formattedLessons = lessons.map(formatLessonForPrime).join('\n\n');
    output += `
---

# 🔴 Mandatory Recall

Critical lessons from past corrections:

${formattedLessons}
`;
  }

  return output;
}

/**
 * Register prime command on the program.
 */
export function registerPrimeCommand(program: Command): void {
  /**
   * Prime command - Output context recovery for Claude Code.
   *
   * Combines Beads-style trust language guidelines with high-severity lessons.
   * Used after compaction or context loss to remind Claude of the
   * learning-agent workflow, rules, and commands.
   *
   * @example npx lna prime
   */
  program
    .command('prime')
    .description('Output context for Claude Code (guidelines + top lessons)')
    .action(async () => {
      const output = await getPrimeContext();
      console.log(output);
    });
}
