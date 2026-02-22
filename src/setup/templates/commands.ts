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

  'set-worktree.md': `---
name: compound:set-worktree
description: Set up a git worktree for isolated epic execution
argument-hint: "<epic-id>"
---
$ARGUMENTS

# Set Worktree

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/set-worktree/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'research.md': `---
name: compound:research
description: Deep research on a topic producing a structured survey document
argument-hint: "<topic to research>"
---
$ARGUMENTS

# Research

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/researcher/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'test-clean.md': `---
name: compound:test-clean
description: Multi-phase test suite optimization with adversarial review
argument-hint: "<scope or module to analyze>"
---
$ARGUMENTS

# Test Clean

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/test-cleaner/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  'get-a-phd.md': `---
name: compound:get-a-phd
description: Deep PhD-level research for working subagents
argument-hint: "<focus area or epic ID>"
---
$ARGUMENTS

# Get a PhD

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/researcher/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file.

Then: scan docs/compound/research/ for gaps, propose topics via AskUserQuestion, spawn parallel researcher subagents.
`,

  // =========================================================================
  // Utility commands (kept: learn, prime)
  // Removed in v1.3: search, list, show, wrong, stats (CLI wrappers)
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
  'prime.md': `---
name: compound:prime
description: Load compound-agent workflow context after compaction or context loss
---
Load compound-agent workflow context after compaction or context loss.

\`\`\`bash
npx ca prime
\`\`\`
`,
};
