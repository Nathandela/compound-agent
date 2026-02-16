/**
 * Workflow slash command templates for .claude/commands/compound/.
 */

export const WORKFLOW_COMMANDS: Record<string, string> = {
  'brainstorm.md': `---
name: compound:brainstorm
description: Explore requirements through collaborative dialogue before committing to a plan
argument-hint: "<goal or topic to brainstorm>"
---
$ARGUMENTS

# Brainstorm

Run the **brainstorm** phase. Follow the brainstorm skill for full instructions.

Key steps:
- Search memory and explore docs for prior context
- Clarify scope and constraints via AskUserQuestion
- Propose 2-3 approaches with tradeoffs
- Create a beads epic from conclusions
`,

  'plan.md': `---
name: compound:plan
description: Create a structured implementation plan with concrete tasks and dependencies
argument-hint: "<goal or epic to plan>"
---
$ARGUMENTS

# Plan

Run the **plan** phase. Follow the plan skill for full instructions.

Key steps:
- Spawn subagents to research constraints and patterns
- Decompose into tasks with acceptance criteria
- Create review and compound blocking tasks
- Verify POST-PLAN gates
`,

  'work.md': `---
name: compound:work
description: Execute implementation by delegating to an agent team
argument-hint: "<task ID or description>"
---
$ARGUMENTS

# Work

Run the **work** phase. Follow the work skill for full instructions.

Key steps:
- Deploy AgentTeam with test-writers and implementers
- Lead coordinates, delegates, does not code directly
- Commit incrementally as tests pass
- Run verification gates before closing tasks
`,

  'review.md': `---
name: compound:review
description: Multi-agent code review with severity classification and mandatory gate
argument-hint: "<scope or git diff range>"
---
$ARGUMENTS

# Review

Run the **review** phase. Follow the review skill for full instructions.

Key steps:
- Run quality gates, then spawn reviewers in parallel
- Classify findings as P1/P2/P3
- Fix all P1 findings before proceeding
- Submit to /implementation-reviewer as mandatory gate
`,

  'compound.md': `---
name: compound:compound
description: Capture high-quality lessons from completed work into the memory system
argument-hint: "<topic or epic context>"
---
$ARGUMENTS

# Compound

Run the **compound** phase. Follow the compound skill for full instructions.

Key steps:
- Spawn analysis agents in an AgentTeam
- Apply quality filters, then store via npx ca learn
- Delegate CCT synthesis to compounding agent
- Verify FINAL GATE before closing epic
`,

  'lfg.md': `---
name: compound:lfg
description: Full workflow cycle chaining all five phases
argument-hint: "<goal>"
disable-model-invocation: true
---
$ARGUMENTS

# LFG

Run all 5 phases. Follow each phase skill for full instructions.

- Brainstorm: explore and define the problem
- Plan: decompose into tasks with dependencies
- Work: delegate to AgentTeam for TDD
- Review: multi-agent review with severity classification
- Compound: capture lessons via npx ca learn
`,

  // =========================================================================
  // Utility commands (CLI wrappers)
  // =========================================================================

  'learn.md': `---
name: compound:learn
description: Capture a lesson from this session into the memory system
argument-hint: "<insight to remember>"
---
Capture a lesson from this session.

Usage: /compound learn <insight>

Examples:
- /compound learn "Always use Polars for large CSV files"
- /compound learn "API requires X-Request-ID header"

\`\`\`bash
npx ca learn "$ARGUMENTS"
\`\`\`
`,
  'search.md': `---
name: compound:search
description: Search stored lessons for relevant context
argument-hint: "<search query>"
---
Search lessons for relevant context.

Usage: /compound search <query>

Examples:
- /compound search "API authentication"
- /compound search "data processing patterns"

\`\`\`bash
npx ca search "$ARGUMENTS"
\`\`\`

`,
  'list.md': `---
name: compound:list
description: Show all stored lessons
---
Show all stored lessons.

\`\`\`bash
npx ca list
\`\`\`
`,
  'prime.md': `---
name: compound:prime
description: Load compound-agent workflow context after compaction or context loss
---
Load compound-agent workflow context after compaction or context loss.

\`\`\`bash
npx ca prime
\`\`\`
`,
  'show.md': `---
name: compound:show
description: Show details of a specific lesson
argument-hint: "<lesson-id>"
---
Show details of a specific lesson.

Usage: /compound show <lesson-id>

\`\`\`bash
npx ca show "$ARGUMENTS"
\`\`\`
`,
  'wrong.md': `---
name: compound:wrong
description: Mark a lesson as incorrect or invalid
argument-hint: "<lesson-id>"
---
Mark a lesson as incorrect or invalid.

Usage: /compound wrong <lesson-id>

\`\`\`bash
npx ca wrong "$ARGUMENTS"
\`\`\`
`,
  'stats.md': `---
name: compound:stats
description: Show compound-agent database statistics and health
---
Show compound-agent database statistics and health.

\`\`\`bash
npx ca stats
\`\`\`
`,
};
