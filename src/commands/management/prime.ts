/**
 * Prime command - Context recovery for Claude Code.
 */

import type { Command } from 'commander';

/** Workflow context output for Claude Code after compaction/context loss */
const PRIME_WORKFLOW_CONTEXT = `# Learning Agent Workflow

## Core Rules
- **NEVER** edit .claude/lessons/index.jsonl directly
- Use CLI commands: \`lna learn\`, \`lna list\`, \`lna show\`
- Lessons load automatically at session start

## When to Capture Lessons
- User corrects you ("no", "wrong", "actually...")
- You self-correct after multiple attempts
- Test fails then you fix it

## Commands
- \`lna learn "insight"\` - Capture a lesson
- \`lna list\` - Show all lessons
- \`lna check-plan --plan "..."\` - Get relevant lessons for plan
- \`lna stats\` - Show database health

## Quality Gate (ALL must pass before proposing)
- Novel (not already stored)
- Specific (clear guidance)
- Actionable (obvious what to do)
`;

/**
 * Register prime command on the program.
 */
export function registerPrimeCommand(program: Command): void {
  /**
   * Prime command - Output workflow context for Claude Code.
   *
   * Used after compaction or context loss to remind Claude of the
   * learning-agent workflow, rules, and commands.
   *
   * @example npx lna prime
   */
  program
    .command('prime')
    .description('Output workflow context for Claude Code')
    .action(() => {
      console.log(PRIME_WORKFLOW_CONTEXT);
    });
}
