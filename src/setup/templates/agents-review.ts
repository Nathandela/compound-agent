/**
 * Review agent templates: thin subagent wrappers for plan/brainstorm phases.
 *
 * 2 research subagents (repo-analyst, memory-analyst).
 * The 5 reviewer agents are now AgentTeam role skills.
 */

export const REVIEW_AGENT_TEMPLATES: Record<string, string> = {
  'repo-analyst.md': `---
name: Repo Analyst
description: Analyzes repository structure, conventions, and patterns
model: sonnet
---

# Repo Analyst

Spawned as a **subagent**. Follow the **repo-analyst** role skill for full instructions. Return findings to the caller.
`,

  'memory-analyst.md': `---
name: Memory Analyst
description: Searches and retrieves relevant memory items for context
model: sonnet
---

# Memory Analyst

Spawned as a **subagent**. Follow the **memory-analyst** role skill for full instructions. Return findings to the caller.
`,
};
