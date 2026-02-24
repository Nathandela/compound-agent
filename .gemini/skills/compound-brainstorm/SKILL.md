---
name: compound-brainstorm
description: Divergent-then-convergent thinking to explore solution space
---

---
name: Brainstorm
description: Divergent-then-convergent thinking to explore solution space
---

# Brainstorm Skill

## Overview
Explore the problem space before committing to a solution. This phase produces a structured brainstorm document with decisions, open questions, and a beads epic for handoff to planning.

## Methodology
1. Ask "why" before "how" -- understand the real problem
2. Search memory with `npx ca search` and docs with `npx ca knowledge "relevant topic"` for similar past features and known constraints
3. Spawn **subagents** via Task tool in parallel for research (lightweight, no inter-agent coordination):
   - Available agents: `.claude/agents/compound/repo-analyst.md`, `memory-analyst.md`
   - Or use `subagent_type: Explore` for ad-hoc research
   - Deploy MULTIPLE when topic spans several domains; synthesize all findings before proceeding
4. When facing deep unknowns or complex technical domains, invoke the **researcher skill** (read `.claude/skills/compound/researcher/SKILL.md`) to produce a structured survey document before narrowing approaches
5. Use `AskUserQuestion` to clarify scope, constraints, and preferences
6. Divergent phase: generate multiple approaches without filtering
7. Identify constraints and non-functional requirements (performance, security, etc.)
8. Convergent phase: evaluate approaches against constraints
9. Document decisions with rationale, list open questions, and create a beads epic
10. Auto-create ADR files in `docs/decisions/` for significant decisions (lightweight: Status, Context, Decision, Consequences)

## Memory Integration
- Run `npx ca search` and `npx ca knowledge "relevant topic"` with relevant keywords before generating approaches
- Look for past architectural decisions, pitfalls, and preferences
- If the problem domain matches past work, review those lessons first

## Docs Integration
- Spawn docs-explorer to scan `docs/` for relevant architecture docs, research, and standards
- Review existing ADRs in `docs/decisions/` -- prior decisions may constrain the brainstorm
- Auto-create ADR for each significant decision made during convergence

## Common Pitfalls
- Jumping to the first solution without exploring alternatives
- Ignoring non-functional requirements (scalability, maintainability)
- Not searching memory for similar past features
- Not checking existing docs and ADRs for prior decisions
- Over-scoping: trying to solve everything at once
- Skipping the "why" and diving into "how"
- Not invoking the researcher skill when the domain requires deep investigation
- Not creating a beads epic from conclusions (losing brainstorm output)

## Quality Criteria
- Multiple approaches were considered (at least 2-3)
- Constraints and requirements are explicitly listed
- Memory was searched for relevant context
- Existing docs and ADRs were reviewed for prior decisions
- User was engaged via `AskUserQuestion` for clarification
- A clear decision was made with documented rationale
- ADRs created for significant architectural decisions
- Open questions are captured for the plan phase
- A beads epic was created from conclusions via `bd create`

