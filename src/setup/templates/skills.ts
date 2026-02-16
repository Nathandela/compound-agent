/**
 * Phase skill SKILL.md templates for compound workflow phases.
 * Written to .claude/skills/compound/<phase>/SKILL.md during setup.
 */

export const PHASE_SKILLS: Record<string, string> = {
  brainstorm: `---
name: Brainstorm
description: Divergent-then-convergent thinking to explore solution space
---

# Brainstorm Skill

## Overview
Explore the problem space before committing to a solution. This phase produces a structured brainstorm document with decisions, open questions, and a beads epic for handoff to planning.

## Methodology
1. Ask "why" before "how" -- understand the real problem
2. Search memory with \`npx ca search\` for similar past features and known constraints
3. Spawn research subagents in parallel -- use MULTIPLE when the topic spans several domains:
   - Deploy docs-explorer(s) and code-explorer(s) as opus subagents for broad coverage
   - Scale subagent count to the number of distinct domains being researched
   - Synthesize all findings before moving to divergent phase
4. Use \`AskUserQuestion\` to clarify scope, constraints, and preferences
5. Divergent phase: generate multiple approaches without filtering
6. Identify constraints and non-functional requirements (performance, security, etc.)
7. Convergent phase: evaluate approaches against constraints
8. Document decisions with rationale, list open questions, and create a beads epic
9. Auto-create ADR files in \`docs/decisions/\` for significant decisions (lightweight: Status, Context, Decision, Consequences)

## Memory Integration
- Run \`npx ca search\` with relevant keywords before generating approaches
- Look for past architectural decisions, pitfalls, and preferences
- If the problem domain matches past work, review those lessons first

## Docs Integration
- Spawn docs-explorer to scan \`docs/\` for relevant architecture docs, research, and standards
- Review existing ADRs in \`docs/decisions/\` -- prior decisions may constrain the brainstorm
- Auto-create ADR for each significant decision made during convergence

## Common Pitfalls
- Jumping to the first solution without exploring alternatives
- Ignoring non-functional requirements (scalability, maintainability)
- Not searching memory for similar past features
- Not checking existing docs and ADRs for prior decisions
- Over-scoping: trying to solve everything at once
- Skipping the "why" and diving into "how"
- Not creating a beads epic from conclusions (losing brainstorm output)

## Quality Criteria
- Multiple approaches were considered (at least 2-3)
- Constraints and requirements are explicitly listed
- Memory was searched for relevant context
- Existing docs and ADRs were reviewed for prior decisions
- User was engaged via \`AskUserQuestion\` for clarification
- A clear decision was made with documented rationale
- ADRs created for significant architectural decisions
- Open questions are captured for the plan phase
- A beads epic was created from conclusions via \`bd create\`
`,

  plan: `---
name: Plan
description: Decompose work into small testable tasks with clear dependencies
---

# Plan Skill

## Overview
Create a concrete implementation plan by decomposing work into small, testable tasks with dependencies and acceptance criteria.

## Methodology
1. Review brainstorm output for decisions and open questions
2. Search memory with \`npx ca search\` for architectural patterns and past mistakes
3. Spawn research subagents in parallel for maximum coverage:
   - Deploy docs-analyst, repo-analyst, and memory-analyst as opus subagents
   - For complex features spanning multiple domains, deploy MULTIPLE analysts per type
   - Synthesize all findings before decomposing into tasks
4. Synthesize research findings into a coherent approach. Flag conflicts between ADRs and proposed plan.
5. Use \`AskUserQuestion\` to resolve ambiguities, conflicting constraints, or priority trade-offs before decomposing
6. Decompose into tasks small enough to verify individually
7. Define acceptance criteria for each task
8. Map dependencies between tasks
9. Create beads issues: \`bd create --title="..." --type=task\`
10. Create review and compound blocking tasks (\`bd create\` + \`bd dep add\`) that depend on work tasks — these survive compaction and surface via \`bd ready\` after work completes

## Memory Integration
- Run \`npx ca search\` for patterns related to the feature area
- Look for past planning mistakes (missing dependencies, unclear criteria)
- Check for preferred architectural patterns in this codebase

## Docs Integration
- Spawn docs-analyst to scan \`docs/\` for relevant specs, standards, and research
- Check \`docs/decisions/\` for existing ADRs that constrain or inform the plan
- If the plan contradicts an ADR, flag it for the user before proceeding

## Common Pitfalls
- Creating too many fine-grained tasks (aim for 3-7 per feature)
- Unclear acceptance criteria ("make it work" is not a criterion)
- Missing dependencies between tasks
- Not checking memory for past architectural decisions
- Not reviewing existing ADRs and docs for constraints
- Planning implementation details too early (stay at task level)

## Quality Criteria
- Each task has clear acceptance criteria
- Dependencies are mapped and no circular dependencies exist
- Tasks are ordered so each can be verified independently
- Memory was searched for relevant patterns and past mistakes
- Existing docs and ADRs were checked for constraints
- Ambiguities resolved via \`AskUserQuestion\` before decomposing
- Complexity estimates are realistic (no "should be quick")

## POST-PLAN VERIFICATION -- MANDATORY
After creating all tasks, verify review and compound tasks exist:
- Run \`bd list --status=open\` and check for a "Review:" task and a "Compound:" task
- If either is missing, CREATE THEM NOW. The plan is NOT complete without these gates.
`,

  work: `---
name: Work
description: Team-based TDD execution with adaptive complexity and agent delegation
---

# Work Skill

## Overview
Execute implementation through an AgentTeam using adaptive TDD. The lead coordinates and delegates -- agents write code.

## Methodology
1. Pick tasks from \`bd ready\` or \`$ARGUMENTS\`
2. Mark tasks in progress: \`bd update <id> --status=in_progress\`
3. Run \`npx ca search\` per agent/subtask for targeted context. Display results.
4. Assess parallelization: identify independent tasks that can be worked simultaneously
5. Deploy an AgentTeam with MULTIPLE test-writers and implementers scaled to workload:
   - Scale teammate count to the number of independent tasks -- never a single pair for many tasks
   - Each pair works on a subset of tasks; pairs coordinate via SendMessage on shared interfaces
6. Agents communicate via SendMessage when working on overlapping areas.
7. Lead coordinates: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
8. If blocked, use AskUserQuestion to get user direction.
9. Shut down the team when done: send shutdown_request to all teammates.
10. Commit incrementally as tests pass.
11. Run full test suite for regressions.
12. Close tasks: \`bd close <id>\`

## Memory Integration
- Run \`npx ca search\` per delegated subtask with the subtask's specific description
- Each agent receives memory items tailored to their assigned task, not a shared blob
- Run \`npx ca learn\` after corrections or novel discoveries

## MANDATORY VERIFICATION -- DO NOT CLOSE TASK WITHOUT THIS
Before \`bd close\`, you MUST:
1. Run \`pnpm test\` then \`pnpm lint\` (quality gates)
2. Run \`/implementation-reviewer\` on changed code -- wait for APPROVED
If REJECTED: fix ALL issues, re-run tests, resubmit. INVIOLABLE per CLAUDE.md.

The full 8-step pipeline (invariant-designer through implementation-reviewer) is recommended
for complex changes. For all changes, \`/implementation-reviewer\` is the minimum required gate.

## Beads Lifecycle
- \`bd ready\` to find available tasks
- \`bd update <id> --status=in_progress\` when starting
- \`bd close <id>\` when all tests pass

## Parallelization Strategy
- **Always prefer parallel work**: independent tasks should be assigned to different teammate pairs simultaneously
- **Scale the team adaptively**: deploy multiple test-writer + implementer pairs proportional to independent task count
- **Subagent spawning within teammates**: each teammate should spawn opus subagents for independent subtasks (e.g., a test-writer spawning subagents to write tests for multiple modules in parallel)
- **Coordinate on shared interfaces**: teammates working on overlapping APIs must communicate via SendMessage before implementing

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
- Task lifecycle tracked via beads (\`bd\`)

## PHASE GATE 3 -- MANDATORY
Before starting Review, verify ALL work tasks are closed:
- \`bd list --status=in_progress\` must return empty
- \`bd list --status=open\` should only have Review and Compound tasks remaining
If any work tasks remain open, DO NOT proceed. Complete them first.
`,

  review: `---
name: Review
description: Multi-agent review with parallel specialized reviewers and severity classification
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, consolidating findings with severity classification (P1/P2/P3), and gating completion on implementation-reviewer approval.

## Methodology
1. Run quality gates first: \`pnpm test && pnpm lint\`
2. Search memory with \`npx ca search\` for known patterns and recurring issues
3. Select reviewer tier based on diff size:
   - **Small** (<100 lines): 4 core -- security, test-coverage, simplicity, cct-reviewer
   - **Medium** (100-500): add architecture, performance, edge-case (7 total)
   - **Large** (500+): all 11 reviewers including docs, consistency, error-handling, pattern-matcher
4. Spawn selected reviewers in an AgentTeam. For large diffs (500+ lines), deploy MULTIPLE instances of high-value reviewers:
   - Split files/modules across reviewer instances for security and test-coverage reviewers
   - Each instance reviews a subset; instances coordinate via SendMessage to avoid duplicate findings
5. Reviewers communicate findings to each other via \`SendMessage\`
6. Collect, consolidate, and deduplicate all findings
7. Classify by severity: P1 (critical/blocking), P2 (important), P3 (minor)
8. Use \`AskUserQuestion\` when severity is ambiguous or fix has multiple valid options
9. Create beads issues for P1 findings: \`bd create --title="P1: ..."\`
10. Fix all P1 findings before proceeding
11. Run \`/implementation-reviewer\` as mandatory gate
12. Capture novel findings with \`npx ca learn\`; pattern-matcher auto-reinforces recurring issues

## Memory Integration
- Run \`npx ca search\` before review for known recurring issues
- **pattern-matcher** auto-reinforces: recurring findings get severity increased via \`npx ca learn\`
- **cct-reviewer** reads CCT patterns for known Claude failure patterns
- Capture the review report via \`npx ca learn\` with \`type=solution\`

## Docs Integration
- **docs-reviewer** checks code/docs alignment and ADR compliance
- Flags undocumented public APIs and ADR violations

## Common Pitfalls
- Ignoring reviewer feedback because "it works"
- Not running all 11 reviewer perspectives (skipping dimensions)
- Treating all findings as equal priority (classify P1/P2/P3 first)
- Not creating beads issues for deferred fixes
- Skipping quality gates before review
- Bypassing the implementation-reviewer gate
- Not checking CCT patterns for known Claude mistakes

## Quality Criteria
- All quality gates pass (\`pnpm test\`, lint)
- All 11 reviewer perspectives were applied in parallel
- Findings are classified P1/P2/P3 and deduplicated
- pattern-matcher checked memory and reinforced recurring issues
- cct-reviewer checked against known Claude failure patterns
- docs-reviewer confirmed docs/ADR alignment
- All P1 findings fixed before \`/implementation-reviewer\` approval
- \`/implementation-reviewer\` approved as mandatory gate

## PHASE GATE 4 -- MANDATORY
Before starting Compound, verify review is complete:
- \`/implementation-reviewer\` must have returned APPROVED
- All P1 findings must be resolved

**CRITICAL**: Use \`npx ca learn\` for ALL lesson storage -- NOT MEMORY.md.
`,

  compound: `---
name: Compound
description: Reflect on the cycle and capture high-quality lessons for future sessions
---

# Compound Skill

## Overview
Extract and store lessons learned during the cycle, and update project documentation. This is what makes the system compound -- each session leaves the next one better equipped.

**CRITICAL**: Store all lessons via \`npx ca learn\` -- NOT via MEMORY.md, NOT via markdown files.
Lessons go to \`.claude/lessons/index.jsonl\` through the CLI. MEMORY.md is a different system and MUST NOT be used for compounding.

## Methodology
1. Review what happened during this cycle (git diff, test results, plan context)
2. Spawn the analysis pipeline in an AgentTeam. Scale agents to the volume of changes:
   - For large diffs, deploy multiple context-analyzers (one per major changed module) and multiple lesson-extractors
   - All agents coordinate via SendMessage: context-analyzers feed lesson-extractors, which feed pattern-matcher and solution-writer
   - context-analyzer: gathers cycle context (diffs, test output)
   - lesson-extractor: identifies corrections, surprises, discoveries
   - docs-reviewer: scans \`docs/\` for outdated content and ADRs that need updating
   - pattern-matcher: checks \`npx ca search\` for duplicates and related items
   - solution-writer: drafts final memory items
   - compounding: synthesizes accumulated lessons into CCT patterns
3. Agents pass results through the pipeline via \`SendMessage\`. The lead coordinates: context-analyzer and lesson-extractor feed pattern-matcher and solution-writer, which feed compounding.
4. Apply quality filters: novelty check (>0.85 similarity = skip), specificity check
5. Classify each item by type: lesson, solution, pattern, or preference
6. Classify severity: high (data loss/security/contradictions), medium (workflow/patterns), low (style/optimizations)
7. Store via \`npx ca learn\` with supersedes/related links where applicable.
   At minimum, capture 1 lesson per significant decision made during this cycle
8. Delegate to the \`compounding\` subagent to run synthesis: cluster accumulated lessons by similarity and write CCT patterns to \`.claude/lessons/cct-patterns.jsonl\`
9. Update outdated docs and deprecate superseded ADRs (set status to \`deprecated\`)
10. Use \`AskUserQuestion\` to confirm high-severity items with the user before storing; medium/low items are auto-stored

## Docs Integration
- docs-reviewer checks if \`docs/\` content is outdated after the cycle
- Check \`docs/decisions/\` for ADRs contradicted by the work done
- Set ADR status to \`deprecated\` if a decision was reversed, referencing the new ADR

## Common Pitfalls
- Not spawning the analysis team (analyzing solo misses cross-cutting patterns)
- Capturing without checking for duplicates via \`npx ca search\`
- Skipping supersedes/related linking when an item updates prior knowledge
- Not checking if docs or ADRs need updating after the cycle
- Requiring user confirmation for every item (only high-severity needs it)
- Not classifying items by type (lesson/solution/pattern/preference)
- Capturing vague lessons ("be careful with X") -- be specific and concrete

## Quality Criteria
- Analysis team was spawned and agents coordinated via pipeline
- Quality filters applied (novelty + specificity)
- Duplicates checked via \`npx ca search\` before capture
- Items classified by type (lesson/solution/pattern/preference)
- Supersedes/related links set where applicable
- Outdated docs and ADRs were updated or deprecated
- User confirmed high-severity items
- Beads checked for related issues (\`bd\`)
- Each item gives clear, concrete guidance for future sessions

## FINAL GATE -- EPIC CLOSURE
Before closing the epic:
- Run \`npx ca verify-gates <epic-id>\` -- must return PASS for both gates
- Run \`pnpm test\` and \`pnpm lint\` -- must pass
If verify-gates fails, the missing phase was SKIPPED. Go back and complete it.
CRITICAL: 3/5 phases is NOT success. All 5 phases are required.
`,
};
