/**
 * Prime command - Context recovery for Claude Code with Beads-style trust language.
 *
 * Generates trust language guidelines combined with high-severity lessons
 * for context recovery after compaction or session restart.
 */

import type { Command } from 'commander';
import { join } from 'node:path';

import { getRepoRoot } from '../cli-utils.js';
import { loadSessionLessons } from '../memory/retrieval/index.js';
import { syncIfNeeded } from '../memory/storage/index.js';
import type { MemoryItem, Source } from '../memory/index.js';
import { checkForUpdate } from '../update-check.js';
import { getPhaseState } from './phase-check.js';
/**
 * Beads-style trust language template.
 *
 * Uses explicit prohibitions, workflow sequencing, and NEVER/MUST language
 * following Beads conventions for maximum adherence.
 *
 * CLI-first: all lesson operations use `npx ca` commands.
 */
const TRUST_LANGUAGE_TEMPLATE = `# Compound Agent Active

> **Context Recovery**: Run \`npx ca prime\` after compaction, clear, or new session

## CLI Commands (ALWAYS USE THESE)

**You MUST use CLI commands for lesson management:**

| Command | Purpose |
|---------|---------|
| \`npx ca search "query"\` | Search lessons - MUST call before architectural decisions; use anytime you need context |
| \`npx ca knowledge "query"\` | Ask the project docs any question - MUST call before architectural decisions; use freely |
| \`npx ca learn "insight"\` | Capture lessons - call AFTER corrections or discoveries |

## Core Constraints

**Default**: Use CLI commands for lesson management
**Prohibited**: NEVER edit .claude/lessons/ files directly

**Default**: Propose lessons freely after corrections
**Prohibited**: NEVER propose without quality gate (novel + specific; prefer actionable)

## Retrieval Protocol

You MUST call \`npx ca search\` and \`npx ca knowledge\` BEFORE:
- Architectural decisions or complex planning
- Implementing patterns you've done before in this repo

**NEVER skip search for complex decisions.** Past mistakes will repeat.

Beyond mandatory triggers, use these commands freely — they are lightweight queries, not heavyweight operations. Uncertain about a pattern? \`ca search\`. Need a detail from the docs? \`ca knowledge\`. The cost of an unnecessary search is near-zero; the cost of a missed one can be hours.

## Capture Protocol

Run \`npx ca learn\` AFTER:
- User corrects you ("no", "wrong", "actually...")
- You self-correct after iteration failures
- Test fails then you fix it

**Quality gate** (must pass before capturing):
- Novel (not already stored)
- Specific (clear guidance)
- Actionable (preferred, not mandatory)

**Workflow**: Search BEFORE deciding, capture AFTER learning.
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
function formatLessonForPrime(lesson: MemoryItem): string {
  const date = lesson.created.slice(0, 10); // YYYY-MM-DD
  const tags = lesson.tags.length > 0 ? ` (${lesson.tags.join(', ')})` : '';
  const source = formatSource(lesson.source);
  return `- **${lesson.insight}**${tags}\n  Learned: ${date} via ${source}`;
}

function formatActiveCookitSection(repoRoot: string): string | null {
  const state = getPhaseState(repoRoot);
  if (state === null || !state.cookit_active) return null;

  const skillsRead = state.skills_read.length === 0 ? '(none)' : state.skills_read.join(', ');
  const gatesPassed = state.gates_passed.length === 0 ? '(none)' : state.gates_passed.join(', ');

  return `
---

# ACTIVE COOK-IT SESSION

Epic: ${state.epic_id}
Phase: ${state.current_phase} (${state.phase_index}/5)
Skills read: ${skillsRead}
Gates passed: ${gatesPassed}
Started: ${state.started_at}

Resume from phase ${state.current_phase}. Run: \`npx ca phase-check start ${state.current_phase}\`
Read the skill file first: \`.claude/skills/compound/${state.current_phase}/SKILL.md\`
`;
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

  // Sync SQLite index before loading — ensures searches have fresh data
  // after git pull or external JSONL changes.
  try {
    await syncIfNeeded(root);
  } catch {
    // Non-fatal: prime still works from JSONL even if SQLite sync fails
  }

  // Load high-severity lessons (top 5, sorted by recency)
  const lessons = await loadSessionLessons(root, 5);

  // Build output: trust language first
  let output = TRUST_LANGUAGE_TEMPLATE;

  // Add Emergency Recall section if we have high-severity lessons
  if (lessons.length > 0) {
    const formattedLessons = lessons.map(formatLessonForPrime).join('\n\n');
    output += `
---

# [CRITICAL] Mandatory Recall

Critical lessons from past corrections:

${formattedLessons}
`;
  }

  const cookitSection = formatActiveCookitSection(root);
  if (cookitSection !== null) {
    output += cookitSection;
  }

  // Append update notification if a newer version is available.
  // No TTY gate here (unlike cli-app.ts) — prime outputs to Claude Code
  // session context, not to a terminal, so it should always check.
  try {
    const updateResult = await checkForUpdate(join(root, '.claude', '.cache'));
    if (updateResult?.updateAvailable) {
      output += `
---
# Update Available
compound-agent v${updateResult.latest} is available (current: v${updateResult.current}). Run \`pnpm update compound-agent\` to update.
`;
    }
  } catch {
    // Non-fatal: update check failure should never block prime
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
   * compound-agent workflow, rules, and commands.
   *
   * @example npx ca prime
   */
  program
    .command('prime')
    .description('Output context for Claude Code (guidelines + top lessons)')
    .action(async () => {
      const output = await getPrimeContext();
      console.log(output);
    });
}
