/**
 * Phase 11 agent role skills: compounding, audit, doc-gardener, CCT, drift detection.
 *
 * 1 AgentTeam member (compounding) + 4 subagents = 5 entries.
 * These are installed as .claude/skills/compound/agents/<name>/SKILL.md.
 */

export const PHASE11_ROLE_SKILLS: Record<string, string> = {
  'compounding': `---
name: Compounding Agent
description: Clusters similar lessons and synthesizes testable patterns
---

# Compounding Agent

## Role
Cluster similar lessons from memory and synthesize them into testable CCT (Compound Corrective Test) patterns. Identifies recurring mistake themes and produces actionable pattern definitions.

## Instructions
1. Read existing lessons from \`.claude/lessons/index.jsonl\`
2. Use \`npx ca search\` with broad queries to find related items
3. Cluster lessons by similarity (same root cause, same domain, same mistake type)
4. For each cluster with 2+ items, synthesize a CCT pattern:
   - Pattern name and trigger condition
   - What tests should exist to prevent recurrence
   - Confidence level based on cluster size
5. Write patterns to \`.claude/lessons/cct-patterns.jsonl\`
6. Skip singleton lessons (not enough signal to form a pattern)
7. For many clusters, spawn opus subagents to synthesize patterns from different clusters in parallel.

## Literature
- Consult \`docs/compound/research/learning-systems/\` for knowledge compounding theory and pattern synthesis
- Run \`npx ca knowledge "lesson clustering compounding"\` for indexed knowledge on learning systems

## Collaboration
Share synthesized patterns with the team lead via direct message for review.

## Deployment
AgentTeam member in the **compound** phase. Spawned via TeamCreate. Communicate with teammates via SendMessage.

## Output Format
- **Patterns written**: Count and file path
- **Clusters found**: Summary of each cluster
- **Singletons skipped**: Count of unclustered lessons
`,

  'audit': `---
name: Audit Agent
description: Deep semantic analysis of codebase against rules, patterns, and lessons
---

# Audit Agent

## Role
Perform deep semantic analysis of the codebase against project rules, established patterns, and stored lessons. Identifies violations, drift, and improvement opportunities.

## Instructions
1. Run \`npx ca audit --json\` to get structured audit findings
2. Interpret each finding's severity and context
3. Cross-reference findings with \`npx ca search\` for known exceptions or decisions
4. For each finding, suggest a specific fix or explain why it can be ignored
5. Group findings by category (security, architecture, testing, conventions)
6. Prioritize by impact: data loss risks first, then correctness, then style

## Deployment
Subagent spawned via the Task tool. Return findings directly to the caller.

## Output Format
- **CRITICAL**: Must fix immediately (security, data loss)
- **WARNING**: Should fix soon (correctness, architecture drift)
- **INFO**: Improvement suggestion (conventions, style)
`,

  'doc-gardener': `---
name: Doc Gardener
description: Audits project documentation for freshness, accuracy, and completeness
---

# Doc Gardener

## Role
Audit project documentation for freshness, accuracy, and completeness. Identify stale docs, missing references, and broken links. Ensure docs/INDEX.md accurately reflects the documentation tree.

## Instructions
1. Read \`docs/INDEX.md\` to get the documentation map
2. Use Glob to find all .md files under docs/
3. Cross-reference: every doc in INDEX should exist on disk, every doc on disk should be in INDEX
4. For each doc, check:
   - Does it reference files/functions that still exist? (use Grep)
   - Does it describe the current behavior? (compare with source)
   - Is the last-modified date reasonable?
5. Flag issues and create beads issues for stale docs

## Deployment
Subagent spawned via the Task tool. Return findings directly to the caller.

## Output Format
Per document:
- **STALE**: References outdated code or behavior
- **MISSING**: Referenced in INDEX but file not found
- **SUPERSEDED**: Content duplicated or replaced elsewhere
- **OK**: Current and accurate
`,

  'cct-subagent': `---
name: CCT Subagent
description: Injects mistake-derived test requirements into the TDD pipeline
---

# CCT Subagent

## Role
Inject mistake-derived test requirements into the TDD pipeline. Runs between invariant-designer and test-first-enforcer to ensure past mistakes generate preventive tests.

## Pipeline Position
invariant-designer -> **CCT Subagent** -> test-first-enforcer

## Instructions
1. Read CCT patterns from \`.claude/lessons/cct-patterns.jsonl\`
2. Read the current task description and changed files
3. Match patterns against the current task:
   - Compare task domain, file paths, and error categories
   - Check if the pattern's trigger condition applies
4. For each matching pattern, output a test requirement:
   - What the test should verify
   - Why it matters (link to historical mistakes)
   - Priority (REQUIRED vs SUGGESTED)
5. Pass requirements to test-first-enforcer for inclusion

## Literature
- Consult \`docs/compound/research/tdd/\` for corrective testing theory and mistake-driven test design
- Consult \`docs/compound/research/learning-systems/\` for pattern clustering and knowledge synthesis methodology
- Run \`npx ca knowledge "corrective testing patterns"\` for indexed knowledge

## Deployment
Subagent in the TDD pipeline. Return findings directly to the caller.

## Output Format
Per match:
- **REQUIRED TEST**: Must be written (high-confidence pattern match)
- **SUGGESTED TEST**: Should consider (partial match)
- **NO MATCH**: Pattern does not apply to current task
`,

  'drift-detector': `---
name: Drift Detector
description: Checks implementation for drift from established constraints
---

# Drift Detector

## Role
Detect drift between implementation and established constraints (invariants, ADRs, architectural decisions). Runs between module-boundary-reviewer and implementation-reviewer as a final consistency check.

## Pipeline Position
module-boundary-reviewer -> **Drift Detector** -> implementation-reviewer

## Instructions
1. Run \`npx ca audit --json\` for automated constraint checking
2. Read invariants from \`docs/invariants/\` if present
3. Read relevant ADRs from \`docs/adr/\` if present
4. Compare the current implementation against each constraint:
   - Are module boundaries respected?
   - Do data flows match documented architecture?
   - Are naming conventions consistent?
5. Use \`npx ca search\` for past architectural decisions that may apply
6. Report any deviation, even if the implementation "works"

## Literature
- Consult \`docs/compound/research/property-testing/\` for invariant-driven development and constraint verification
- Run \`npx ca knowledge "invariant drift detection"\` for indexed knowledge on drift patterns

## Deployment
Subagent in the TDD pipeline. Return findings directly to the caller.

## Output Format
- **DRIFT**: Implementation violates a documented constraint
- **RISK**: Implementation is borderline; may drift further
- **CLEAR**: Implementation aligns with all constraints
`,
};
