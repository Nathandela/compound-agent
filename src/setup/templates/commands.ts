/**
 * Workflow slash command templates for .claude/commands/compound/.
 */

export const WORKFLOW_COMMANDS: Record<string, string> = {
  'spec-dev.md': `---
name: compound:spec-dev
description: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams
argument-hint: "<goal or feature to specify>"
---
$ARGUMENTS

# Spec Dev

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/spec-dev/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
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

  'cook-it.md': `---
name: compound:cook-it
description: Full workflow cycle chaining all five phases
argument-hint: "<goal>"
disable-model-invocation: true
---
$ARGUMENTS

# Cook It

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/cook-it/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full orchestration workflow you must follow.
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

Then: scan docs/research/ and docs/compound/research/ for gaps, propose topics via AskUserQuestion, spawn parallel researcher subagents.
`,

  'agentic-audit.md': `---
name: compound:agentic-audit
description: Audit codebase against the 15-principle agentic manifesto
argument-hint: "<scope or focus area>"
---
$ARGUMENTS

# Agentic Audit

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/agentic/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file.

Run in **audit** mode. Score all 15 principles, produce the report, offer beads epic.
`,

  'agentic-setup.md': `---
name: compound:agentic-setup
description: Set up codebase for agentic AI development (audit-first)
argument-hint: "<scope or focus area>"
---
$ARGUMENTS

# Agentic Setup

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/agentic/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file.

Run in **setup** mode. Audit first, then propose and create files to fill gaps.
`,

  'architect.md': `---
name: compound:architect
description: Decompose a large system specification into cook-it-ready epic beads
argument-hint: "<system spec epic ID, file path, or description>"
---
$ARGUMENTS

# Architect

**MANDATORY FIRST STEP -- NON-NEGOTIABLE**: Use the Read tool to open and read \`.claude/skills/compound/architect/SKILL.md\` NOW. Do NOT proceed until you have read the complete skill file. It contains the full workflow you must follow.
`,

  // =========================================================================
  // Utility commands (kept: learn-that, check-that, prime)
  // Removed in v1.3: search, list, show, wrong, stats (CLI wrappers)
  // Removed in v1.4: learn (replaced by learn-that)
  // =========================================================================

  'learn-that.md': `---
name: compound:learn-that
description: Conversation-aware lesson capture with user confirmation
argument-hint: "<insight to remember>"
---
# Learn That

If $ARGUMENTS is provided, use it as the insight. Otherwise, analyze the conversation for corrections, discoveries, or fixes worth capturing.

Formulate:
- **Trigger**: What situation should recall this lesson?
- **Insight**: What should be done differently?
- **Tags**: 2-4 lowercase keywords

Confirm with the user via AskUserQuestion before saving.

Then run:

\`\`\`bash
npx ca learn "$ARGUMENTS" --tags "<tag1>,<tag2>"
\`\`\`
`,

  'check-that.md': `---
name: compound:check-that
description: Search lessons and proactively apply them to current work
argument-hint: "<query to search for>"
---
# Check That

If $ARGUMENTS is provided, use it as the search query. Otherwise, infer from current context.

\`\`\`bash
npx ca search "$ARGUMENTS"
\`\`\`

Analyze the results and proactively suggest or apply relevant lessons to the current work.
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
