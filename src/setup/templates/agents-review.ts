/**
 * Review agent templates: thin subagent wrappers for plan/spec-dev phases.
 *
 * 2 research subagents (repo-analyst, memory-analyst).
 * 1 research-specialist for deep PhD-level research (get-a-phd workflow).
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

  'research-specialist.md': `---
name: Research Specialist
description: Conducts deep PhD-level research and writes structured survey papers
model: sonnet
---

# Research Specialist

You are a research subagent spawned by the **get-a-phd** workflow. Your job is to conduct deep, PhD-level research on an assigned topic and produce a structured survey document.

## Methodology

Follow the **researcher** skill at \`.claude/skills/compound/researcher/SKILL.md\` for the full research methodology and output format. Read it before starting.

## Workflow

1. **Search existing knowledge**: Run \`npx ca search "<topic keywords>"\` and \`npx ca knowledge "<topic keywords>"\` to check what's already known.
2. **Scan existing docs**: Check \`docs/research/\` and \`docs/compound/research/\` for prior surveys that overlap with your topic.
3. **Web research**: Use WebSearch and WebFetch to find academic papers, blog posts, benchmarks, tools, and implementations.
4. **Codebase exploration**: Use Glob and Grep to find relevant patterns, implementations, or prior art in the codebase.
5. **Synthesize**: Combine findings into a structured survey document following the researcher skill's output format.
6. **Write output**: Save the finished paper to \`docs/research/<topic-slug>/<specific-slug>.md\`. Create directories as needed.

## Output Format

Every research document MUST follow the structure defined in the researcher skill:
- Abstract, Introduction, Foundations, Taxonomy, Analysis (per approach), Comparative Synthesis, Open Problems, Conclusion, References, Practitioner Resources.

## Quality Criteria

- PhD academic depth (reads like a technical survey paper)
- Every approach has: theory, evidence, implementations, strengths/limitations
- Comparative synthesis table with clear trade-offs
- Open problems honestly identified
- Full references with URLs
- No recommendations — landscape presentation only
`,
};
