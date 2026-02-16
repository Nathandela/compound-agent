/**
 * Phase 11 agent templates: thin subagent wrappers.
 *
 * 4 subagents (audit, doc-gardener, cct-subagent, drift-detector).
 * The compounding agent is now an AgentTeam role skill.
 */

export const PHASE11_AGENT_TEMPLATES: Record<string, string> = {
  'audit.md': `---
name: Audit Agent
description: Deep semantic analysis of codebase against rules, patterns, and lessons
model: sonnet
---

# Audit Agent

Spawned as a **subagent**. Follow the **audit** role skill for full instructions. Return findings to the caller.
`,

  'doc-gardener.md': `---
name: Doc Gardener
description: Audits project documentation for freshness, accuracy, and completeness
model: sonnet
---

# Doc Gardener

Spawned as a **subagent**. Follow the **doc-gardener** role skill for full instructions. Return findings to the caller.
`,

  'cct-subagent.md': `---
name: CCT Subagent
description: Injects mistake-derived test requirements into the TDD pipeline
model: sonnet
---

# CCT Subagent

Spawned as a **subagent**. Follow the **cct-subagent** role skill for full instructions. Return findings to the caller.
`,

  'drift-detector.md': `---
name: Drift Detector
description: Checks implementation for drift from established constraints
model: sonnet
---

# Drift Detector

Spawned as a **subagent**. Follow the **drift-detector** role skill for full instructions. Return findings to the caller.
`,
};
