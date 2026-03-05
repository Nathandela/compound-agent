---
name: compound-plan
description: Decompose work into small testable tasks with clear dependencies
---

# Plan Skill

## Overview
Create a concrete implementation plan by decomposing work into small, testable tasks with dependencies and acceptance criteria.

## Methodology
1. Read the spec from the epic description (`bd show <epic>`) for EARS requirements, decisions, and open questions
2. Search memory with `npx ca search` and docs with `npx ca knowledge "relevant topic"` for architectural patterns and past mistakes
3. Spawn **subagents** via Task tool in parallel for research (lightweight, no inter-agent coordination):
   - Available agents: `.claude/agents/compound/repo-analyst.md`, `memory-analyst.md`
   - For complex features, deploy MULTIPLE analysts per domain area
   - Synthesize all findings before decomposing into tasks
4. For decisions requiring deep technical grounding, invoke the **researcher skill** to produce a survey document. Review findings before decomposing into tasks.
5. Synthesize research findings into a coherent approach. Flag conflicts between ADRs and proposed plan.
6. Use `AskUserQuestion` to resolve ambiguities, conflicting constraints, or priority trade-offs before decomposing
7. Decompose into tasks small enough to verify individually
8. Define acceptance criteria for each task
9. Ensure each task traces back to a spec requirement for traceability
10. Map dependencies between tasks
11. Create beads issues: `bd create --title="..." --type=task`
12. Create review and compound blocking tasks (`bd create` + `bd dep add`) that depend on work tasks — these survive compaction and surface via `bd ready` after work completes

## Memory Integration
- Run `npx ca search` and `npx ca knowledge "relevant topic"` for patterns related to the feature area
- Look for past planning mistakes (missing dependencies, unclear criteria)
- Check for preferred architectural patterns in this codebase

## Docs Integration
- Spawn docs-analyst to scan `docs/` for relevant specs, standards, and research
- Check `docs/decisions/` for existing ADRs that constrain or inform the plan
- If the plan contradicts an ADR, flag it for the user before proceeding

## Common Pitfalls
- Creating too many fine-grained tasks (aim for 3-7 per feature)
- Unclear acceptance criteria ("make it work" is not a criterion)
- Missing dependencies between tasks
- Not checking memory for past architectural decisions
- Not reviewing existing ADRs and docs for constraints
- Making architectural decisions without research backing (use the researcher skill for complex domains)
- Planning implementation details too early (stay at task level)

## Quality Criteria
- Each task has clear acceptance criteria
- Dependencies are mapped and no circular dependencies exist
- Tasks are ordered so each can be verified independently
- Memory was searched for relevant patterns and past mistakes
- Existing docs and ADRs were checked for constraints
- Ambiguities resolved via `AskUserQuestion` before decomposing
- Complexity estimates are realistic (no "should be quick")
- Each task traces back to a spec requirement

## POST-PLAN VERIFICATION -- MANDATORY
After creating all tasks, verify review and compound tasks exist:
- Run `bd list --status=open` and check for a "Review:" task and a "Compound:" task
- If either is missing, CREATE THEM NOW. The plan is NOT complete without these gates.

