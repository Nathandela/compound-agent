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

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/brainstorm/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'plan.md': `---
name: compound:plan
description: Create a structured implementation plan with concrete tasks and dependencies
argument-hint: "<goal or epic to plan>"
---
$ARGUMENTS

# Plan

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/plan/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'work.md': `---
name: compound:work
description: Execute implementation by delegating to an agent team
argument-hint: "<task ID or description>"
---
$ARGUMENTS

# Work

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/work/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'review.md': `---
name: compound:review
description: Multi-agent code review with severity classification and mandatory gate
argument-hint: "<scope or git diff range>"
---
$ARGUMENTS

# Review

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/review/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'compound.md': `---
name: compound:compound
description: Capture high-quality lessons from completed work into the memory system
argument-hint: "<topic or epic context>"
---
$ARGUMENTS

# Compound

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/compound/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'lfg.md': `---
name: compound:lfg
description: Full workflow cycle chaining all five phases
argument-hint: "<goal>"
disable-model-invocation: true
---
$ARGUMENTS

# LFG

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/lfg/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full orchestration workflow you must follow.
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
