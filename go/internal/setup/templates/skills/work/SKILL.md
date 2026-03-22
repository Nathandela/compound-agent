---
name: Work
description: Team-based TDD execution with adaptive complexity and agent delegation
---

# Work Skill

## Overview
Execute implementation through an AgentTeam using adaptive TDD. The lead coordinates and delegates -- agents write code.

## Methodology
1. Pick tasks from `bd ready` or `$ARGUMENTS`
2. Mark tasks in progress: `bd update <id> --status=in_progress`
3. Read the epic description (`bd show <epic>`) for spec context -- EARS requirements guide what "done" looks like
4. Run `npx ca search` per agent/subtask for targeted context. Display results.
5. Assess parallelization: identify independent tasks that can be worked simultaneously
6. Deploy an **AgentTeam** (TeamCreate + Task with `team_name`) with MULTIPLE test-writers and implementers:
   - Role skills: `.claude/skills/compound/agents/{test-writer,implementer}/SKILL.md`
   - Scale teammate count to independent tasks; pairs coordinate via SendMessage on shared interfaces
7. Agents communicate via SendMessage when working on overlapping areas.
8. Lead coordinates: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
9. If implementation diverges from spec requirements, stop and discuss with user via AskUserQuestion before proceeding.
10. If blocked, use AskUserQuestion to get user direction.
11. Shut down the team when done: send shutdown_request to all teammates.
12. Commit incrementally as tests pass.
13. Run full test suite for regressions.
14. Close tasks: `bd close <id>`

## Memory Integration
- Run `npx ca search` per delegated subtask with the subtask's specific description
- Each agent receives memory items tailored to their assigned task, not a shared blob
- Run `npx ca learn` after corrections or novel discoveries

## MANDATORY VERIFICATION -- DO NOT CLOSE TASK WITHOUT THIS
Before `bd close`, you MUST:
1. Run `pnpm test` then `pnpm lint` (quality gates)
2. Run `/implementation-reviewer` on changed code -- wait for APPROVED
If REJECTED: fix ALL issues, re-run tests, resubmit. INVIOLABLE per CLAUDE.md.

The full 8-step pipeline (invariant-designer through implementation-reviewer) is recommended
for complex changes. For all changes, `/implementation-reviewer` is the minimum required gate.

## Beads Lifecycle
- `bd ready` to find available tasks
- `bd update <id> --status=in_progress` when starting
- `bd close <id>` when all tests pass

## Parallelization Strategy
- **Always prefer parallel work**: independent tasks should be assigned to different teammate pairs simultaneously
- **Scale the team adaptively**: deploy multiple test-writer + implementer pairs proportional to independent task count
- **Subagent spawning within teammates**: each teammate should spawn opus subagents for independent subtasks (e.g., a test-writer spawning subagents to write tests for multiple modules in parallel)
- **Coordinate on shared interfaces**: teammates working on overlapping APIs must communicate via SendMessage before implementing

## Literature
- Consult `docs/compound/research/tdd/` for TDD methodology, test-first development evidence, and best practices
- Consult `docs/compound/research/property-testing/` for property-based testing theory and invariant design
- Run `npx ca knowledge "TDD test-first"` for indexed knowledge on testing methodology
- Run `npx ca search "testing"` for lessons from past TDD cycles

## Common Pitfalls
- Lead writing code instead of delegating to agents
- Not injecting memory context into agent prompts
- Modifying tests to make them pass instead of fixing implementation
- Not running the full test suite after agent work completes

## Quality Criteria
- Tests existed before implementation code
- Agents received relevant memory context
- Lead coordinated without writing implementation code
- Incremental commits made as tests pass
- All tests pass after refactoring
- Task lifecycle tracked via beads (`bd`)
- Implementation aligns with spec requirements from epic

## PHASE GATE 3 -- MANDATORY
Before starting Review, verify ALL work tasks are closed:
- `bd list --status=in_progress` must return empty
- `bd list --status=open` should only have Review and Compound tasks remaining
If any work tasks remain open, DO NOT proceed. Complete them first.
