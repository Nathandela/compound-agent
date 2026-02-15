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

## Purpose
Explore requirements through collaborative dialogue before committing to a plan.

## Workflow
1. Parse the topic from the arguments above. If empty, ask the user what to brainstorm.
2. Call \`memory_search\` with the topic to surface relevant past lessons. Display retrieved items and incorporate them into exploration.
3. Create a research team and spawn explorers in parallel:
   \`\`\`
   TeamCreate: team_name="brainstorm-<topic-slug>"
   Task: name="docs-explorer", subagent_type="Explore", team_name="brainstorm-<topic-slug>"
     prompt: "Scan docs/ for architecture docs, specs, research, standards, anti-patterns, and existing ADRs in docs/decisions/"
   Task: name="code-explorer", subagent_type="Explore", team_name="brainstorm-<topic-slug>"
     prompt: "Research codebase areas relevant to: <topic>"
   \`\`\`
   Wait for both teammates to report findings, then synthesize.
4. Use \`AskUserQuestion\` to clarify scope, constraints, and preferences through structured dialogue.
5. Explore edge cases and failure modes.
6. Propose 2-3 alternative approaches with tradeoffs.
7. Run \`bd ready\` to check if related tasks already exist.
8. Output a clear problem definition, chosen approach, and open questions.
9. Create a beads epic from conclusions:
   bd create --title="(epic title)" --type=feature --description="(problem definition + approach + scope)"
10. For each significant decision, auto-create an ADR in \`docs/decisions/\`:
    - Scan \`docs/decisions/\` for the highest existing number, increment by 1
    - Write docs/decisions/NNN-(kebab-title).md using this template:
      \`\`\`markdown
      # NNN. <Title>
      Status: accepted
      Date: <YYYY-MM-DD>

      ## Context
      <What prompted this decision>

      ## Decision
      <What was decided and why>

      ## Consequences
      <What follows from this decision>
      \`\`\`

## Memory Integration
- Call \`memory_search\` at the start to avoid repeating past mistakes.
- If the brainstorm surfaces new insights, note them for later capture.

## Docs Integration
- Spawn a docs-explorer subagent to scan \`docs/\` for relevant architecture docs, research, standards, and existing ADRs.
- Review existing ADRs in \`docs/decisions/\` for prior decisions that constrain the current brainstorm.
- Auto-create ADR files for significant architectural decisions made during brainstorm.

## Beads Integration
- Run \`bd ready\` to check for existing related work.
- Create a beads epic from brainstorm conclusions with \`bd create --type=feature\`.
- If the brainstorm identifies sub-tasks, suggest creating them with \`bd create\`.
`,

  'plan.md': `---
name: compound:plan
description: Create a structured implementation plan with concrete tasks and dependencies
argument-hint: "<goal or epic to plan>"
---
$ARGUMENTS

# Plan

## Purpose
Create a structured implementation plan enriched by semantic memory and existing documentation, with concrete tasks and dependencies.

## Workflow
1. Parse the goal from the arguments above. If empty, ask the user what to plan.
2. Check for brainstorm output: run \`bd list\` to find a related brainstorm epic. If one exists, read its description for decisions and open questions.
3. Call \`memory_search\` with the goal to retrieve relevant past lessons. Display retrieved memory items and incorporate them into planning context.
4. Create a research team and spawn analysts in parallel:
   \`\`\`
   TeamCreate: team_name="plan-<goal-slug>"
   Task: name="docs-analyst", subagent_type="Explore", team_name="plan-<goal-slug>"
     prompt: "Scan docs/ for specs, standards, anti-patterns, and ADRs in docs/decisions/ that constrain the plan for: <goal>"
   Task: name="repo-analyst", subagent_type="Explore", team_name="plan-<goal-slug>"
     prompt: "Explore codebase patterns, conventions, and architecture relevant to: <goal>"
   Task: name="memory-analyst", subagent_type="general-purpose", team_name="plan-<goal-slug>"
     prompt: "Deep dive into related memory items with multiple memory_search queries for: <goal>"
   \`\`\`
   Wait for all teammates to report findings, then synthesize.
5. Synthesize research findings from all agents into a coherent plan. Flag any conflicts between ADRs and proposed approach.
6. Use \`AskUserQuestion\` to resolve ambiguities: unclear requirements, conflicting ADRs, or priority trade-offs that need user input before decomposing.
7. Break the goal into concrete, ordered tasks with clear acceptance criteria.
8. **Create review and compound blocking tasks** so they survive compaction:
   - bd create --title="Review: /compound:review" --type=task --priority=1
   - bd create --title="Compound: /compound:compound" --type=task --priority=1
   - bd dep add (review-id) (last-work-task)   -- review depends on work
   - bd dep add (compound-id) (review-id)       -- compound depends on review
   These tasks surface via \`bd ready\` after work completes, ensuring review and compound phases are never skipped — even after context compaction.
9. Create beads issues and map dependencies:
   - bd create --title="(task)" --type=task --priority=(1-4)
   - bd dep add (dependent-task) (blocking-task)
10. Output the plan as a structured list with task IDs and dependency graph.

## POST-PLAN VERIFICATION -- MANDATORY
After creating all tasks, verify review and compound tasks exist:
- Run bd list --status=open and check for a "Review:" task
- Run bd list --status=open and check for a "Compound:" task
If either is missing, CREATE THEM NOW. The plan is NOT complete without these gates.

## Memory Integration
- Call \`memory_search\` before planning to learn from past approaches.
- Search for architectural patterns relevant to the goal.
- Incorporate retrieved lessons into task descriptions as context.

## Docs Integration
- Spawn a docs-analyst subagent to scan \`docs/\` for relevant specs, standards, research, and existing ADRs.
- Check \`docs/decisions/\` for prior ADRs that constrain or inform the plan.
- If the plan contradicts an existing ADR, flag the conflict for the user.

## Beads Integration
- Create one \`bd\` issue per task with \`bd create\`.
- Set priority (1=critical, 4=low) based on dependency order.
- Map dependencies with bd dep add (dependent) (blocker).
- Each task should include acceptance criteria in its description.
`,

  'work.md': `---
name: compound:work
description: Execute implementation by delegating to an agent team
argument-hint: "<task ID or description>"
---
$ARGUMENTS

# Work

## Purpose
Execute implementation by delegating to an agent team. The lead coordinates and does not code directly.

## Workflow
1. Parse task from the arguments above. If empty, run \`bd ready\` to find available tasks.
2. Mark task in progress: bd update (id) --status=in_progress.
3. Call \`memory_search\` with the task description to retrieve relevant lessons. Run \`memory_search\` per agent/subtask so each gets targeted context. Display retrieved lessons in your response. Do not silently discard memory results.
4. Assess complexity to determine team strategy.
5. If **trivial** (config changes, typos, one-line fixes): handle directly with a single subagent. No AgentTeam needed. Proceed to step 10.
6. If **simple** or **complex**, create an AgentTeam:
   \`\`\`
   TeamCreate: team_name="work-<task-id>"
   \`\`\`
7. Spawn **test-analyst** as the first teammate (produces a test plan, not code):
   \`\`\`
   Task: name="test-analyst", subagent_type="general-purpose", team_name="work-<task-id>"
     prompt: "Analyze requirements for <task>. Identify happy paths, edge cases, failure modes, boundary conditions, invariants. Output a structured test plan."
   \`\`\`
   Wait for test-analyst to report the test plan via SendMessage.
8. If **simple**: spawn test-writer, wait for tests, then spawn implementer:
   \`\`\`
   Task: name="test-writer", subagent_type="general-purpose", team_name="work-<task-id>"
   Task: name="implementer", subagent_type="general-purpose", team_name="work-<task-id>"
   \`\`\`
   If **complex**: spawn both as teammates, coordinate via SendMessage for ping-pong cycles.
9. When agents work on overlapping areas, they communicate directly via SendMessage to coordinate and avoid conflicts.
10. Lead coordinates: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
11. If blocked by ambiguity or conflicting agent outputs, use \`AskUserQuestion\` to get user direction.
12. Shut down the team when done: send \`shutdown_request\` to all teammates.
13. Commit incrementally as tests pass — do not batch all commits to the end.
14. Run the full test suite to check for regressions.
15. Close the task: bd close (id).

## MANDATORY VERIFICATION -- DO NOT CLOSE TASK WITHOUT THIS
STOP. Before running \`bd close\`, you MUST:
1. Run pnpm test, then pnpm lint (quality gates)
2. Run /implementation-reviewer on the changed code
3. Wait for APPROVED status
If /implementation-reviewer returns REJECTED: fix ALL issues, re-run tests, resubmit.
DO NOT close the task until approved. This is INVIOLABLE per CLAUDE.md.

The full 8-step pipeline (invariant-designer through implementation-reviewer) is recommended
for complex changes. For all changes, /implementation-reviewer is the minimum required gate.

## Memory Integration
- Call \`memory_search\` per delegated subtask with the subtask's specific description, not one shared query.
- Each agent receives memory items tailored to their assigned task.
- After corrections or discoveries, call \`memory_capture\` to record them.

## Beads Integration
- Start with \`bd ready\` to pick work.
- Update status with bd update (id) --status=in_progress.
- Close with bd close (id) when all tests pass.

## PHASE GATE 3 -- MANDATORY
Before starting Review, verify ALL work tasks are closed:
- Run bd list with status in_progress -- must return empty
- Run bd list with status open -- only Review and Compound tasks should remain
If any work tasks remain open, DO NOT proceed. Complete them first.
`,

  'review.md': `---
name: compound:review
description: Multi-agent code review with severity classification and mandatory gate
argument-hint: "<scope or git diff range>"
---
$ARGUMENTS

# Review

## Purpose
Multi-agent code review with severity classification and a mandatory \`/implementation-reviewer\` gate.

## Workflow
1. Run quality gates first: pnpm test, then pnpm lint.
2. Identify scope from the arguments above or \`git diff\`. Count changed lines.
3. Call \`memory_search\` with changed areas to surface past lessons.
4. **Select reviewer tier based on diff size:**
   - **Small** (<100 lines): 4 core reviewers — security, test-coverage, simplicity, cct-reviewer.
   - **Medium** (100-500 lines): add architecture, performance, edge-case (7 total).
   - **Large** (500+ lines): full team — all 11 reviewers including docs, consistency, error-handling, pattern-matcher.
5. Create team and spawn selected reviewers in parallel:
   \`\`\`
   TeamCreate: team_name="review-<scope-slug>"
   Task: name="security-reviewer", prompt: "Review for injection, auth, data exposure"
   Task: name="test-coverage-reviewer", prompt: "Review for missing edge cases, cargo-cult tests"
   Task: name="simplicity-reviewer", prompt: "Review for over-engineering, dead code"
   Task: name="cct-reviewer", prompt: "Check against CCT patterns in .claude/lessons/"
   (medium+) Task: name="architecture-reviewer", prompt: "Review module boundaries, coupling"
   (medium+) Task: name="performance-reviewer", prompt: "Review allocations, N+1, blocking calls"
   (medium+) Task: name="edge-case-reviewer", prompt: "Check boundary conditions, off-by-one"
   (large)   Task: name="docs-reviewer", prompt: "Check doc alignment, ADR compliance"
   (large)   Task: name="consistency-reviewer", prompt: "Check naming, patterns, style"
   (large)   Task: name="error-handling-reviewer", prompt: "Review error messages, resilience"
   (large)   Task: name="pattern-matcher", prompt: "Match findings to memory, reinforce via memory_capture"
   \`\`\`
6. Reviewers communicate cross-cutting findings via SendMessage.
7. Classify findings: **P1** (security, data loss, correctness — blocks completion), **P2** (architecture, performance), **P3** (style, minor).
8. Deduplicate and prioritize. Use \`AskUserQuestion\` for ambiguous severity.
9. For P1/P2 findings: bd create --title="P1: (finding)" --type=bug --priority=1
10. Submit to **\`/implementation-reviewer\`** — mandatory gate, final authority. All P1s must be resolved.
11. **External reviewers (optional)**: Check \`.claude/compound-agent.json\` for \`"externalReviewers"\`. Spawn configured reviewers. Advisory only, never blocks.
12. Output review summary with severity breakdown and external findings (if any).

## Memory Integration
- Call \`memory_search\` at the start for known issues in changed areas.
- **pattern-matcher** auto-reinforces recurring findings via \`memory_capture\`.
- **cct-reviewer** reads \`.claude/lessons/cct-patterns.jsonl\` for known Claude mistakes.
- After review, call \`memory_capture\` with \`type=solution\` to store the review report.
- **CRITICAL**: Use \`memory_capture\` MCP tool for ALL lesson storage -- NOT MEMORY.md.

## Docs Integration
- **docs-reviewer** checks code changes align with \`docs/\` and existing ADRs.
- Flags undocumented public APIs and ADR contradictions.

## Beads Integration
- Create \`bd\` issues for P1 and P2 findings with \`bd create\`.
- Close related issues with \`bd close\` when findings are resolved.

## PHASE GATE 4 -- MANDATORY
Before starting Compound, verify review is complete:
- /implementation-reviewer must have returned APPROVED
- All P1 findings must be resolved
`,

  'compound.md': `---
name: compound:compound
description: Capture high-quality lessons from completed work into the memory system
argument-hint: "<topic or epic context>"
---
$ARGUMENTS

# Compound

## Purpose
Multi-agent analysis to capture high-quality lessons from completed work into the memory system and update project documentation.

**CRITICAL**: Store all lessons via \`memory_capture\` MCP tool -- NOT via MEMORY.md, NOT via markdown files.
Lessons go to \`.claude/lessons/index.jsonl\` through the MCP tool. MEMORY.md is a different system and MUST NOT be used for compounding.

## Workflow
1. Parse what was done from the arguments above or recent git history (\`git diff\`, \`git log\`).
2. Call \`memory_search\` with the topic to check what is already known (avoid duplicates).
3. Create a compound team and spawn the 6 analysis agents in parallel:
   \`\`\`
   TeamCreate: team_name="compound-<topic-slug>"
   Task: name="context-analyzer", subagent_type="general-purpose", team_name="compound-<topic>"
     prompt: "Summarize what happened: git diff, test results, plan context for: <topic>"
   Task: name="lesson-extractor", subagent_type="general-purpose", team_name="compound-<topic>"
     prompt: "Identify mistakes, corrections, and discoveries from: <topic>"
   Task: name="docs-reviewer", subagent_type="Explore", team_name="compound-<topic>"
     prompt: "Scan docs/ for content that needs updating. Check if any ADR in docs/decisions/ should be deprecated."
   Task: name="pattern-matcher", subagent_type="general-purpose", team_name="compound-<topic>"
     prompt: "Match findings against existing memory via memory_search. Classify: New/Duplicate/Reinforcement/Contradiction."
   Task: name="solution-writer", subagent_type="general-purpose", team_name="compound-<topic>"
     prompt: "Formulate structured memory items typed as lesson, solution, pattern, or preference."
   Task: name="compounding", subagent_type="general-purpose", team_name="compound-<topic>"
     prompt: "Synthesize accumulated lessons into CCT patterns for test reuse."
   \`\`\`
4. Agents pass results to each other via SendMessage so downstream agents build on upstream findings. The lead coordinates the pipeline: context-analyzer and lesson-extractor feed pattern-matcher and solution-writer, which feed compounding.
5. Apply quality filter on each candidate item:
   - **Novel**: skip if >0.85 similarity to existing memory
   - **Specific**: reject vague or generic advice
6. Classify severity for each approved item:
   - **High**: data loss risk, security implications, contradicts established patterns
   - **Medium**: workflow changes, pattern corrections, tooling preferences
   - **Low**: style preferences, minor optimizations, reinforcements
7. For approved items, store via \`memory_capture\` with supersedes/related linking to connect with existing memory.
   At minimum, capture 1 lesson per significant decision made during this cycle.
8. After storing new items, delegate to the **compounding** subagent to run compounding synthesis:
   - Read all lessons from \`.claude/lessons/index.jsonl\`
   - Cluster by embedding similarity (threshold 0.75)
   - Synthesize CCT patterns from clusters of 2+ items
   - Write patterns to \`.claude/lessons/cct-patterns.jsonl\`
   - Skip if fewer than 5 total lessons exist (not enough signal)
9. If the docs-reviewer found outdated docs or ADRs, update them. For superseded ADRs, set status to \`deprecated\` and reference the new ADR.
10. Use \`AskUserQuestion\` to confirm high-severity items with the user before storing; medium/low items are auto-stored.
11. Run \`bd ready\` to check for related issues; \`bd close\` any resolved by captured knowledge.
12. Output a summary of captured items, skipped items, and docs updated.

## Docs Integration
- Spawn a docs-reviewer subagent to check if \`docs/\` content needs updating after the cycle.
- Check \`docs/decisions/\` for ADRs that may be outdated or contradicted by the work done.
- Update ADR status to \`deprecated\` if a decision was reversed, with a reference to the new ADR.

## Beads Integration
- Check \`bd ready\` for related open issues.
- Close resolved issues with \`bd close\`.

## FINAL GATE -- EPIC CLOSURE
Before closing the epic:
- Run ca verify-gates (epic-id) -- must return PASS for both gates
- Run pnpm test -- must pass
- Run pnpm lint -- must pass
If verify-gates fails, the missing phase was SKIPPED. Go back and complete it.
CRITICAL: 3/5 phases is NOT success. All 5 phases are required.
`,

  'lfg.md': `---
name: compound:lfg
description: Full workflow cycle chaining brainstorm, plan, work, review, and compound phases
argument-hint: "<goal>"
disable-model-invocation: true
---
$ARGUMENTS

# LFG (Full Cycle)

## Workflow
1. **Brainstorm**: /compound:brainstorm with the goal. Update: bd update (epic-id) --notes="Phase: brainstorm COMPLETE, Next: plan"
2. **Plan**: /compound:plan with conclusions. Update: bd update (epic-id) --notes="Phase: plan COMPLETE, Next: work"
3. **Work**: /compound:work (finds tasks via bd ready). Update: bd update (epic-id) --notes="Phase: work COMPLETE, Next: review"
4. **Review**: /compound:review on changed code. Update: bd update (epic-id) --notes="Phase: review COMPLETE, Next: compound"
5. **Compound**: /compound:compound to capture learnings (via memory_capture, NOT MEMORY.md). Update: bd update (epic-id) --notes="Phase: compound COMPLETE, Next: close"

## Phase Control
- Skip: "from <phase>" in arguments skips earlier phases.
- Resume: bd show (epic-id), read notes field for phase state.
- Progress: announce "[Phase N/5] Name" before each phase.

## SESSION CLOSE -- INVIOLABLE
1. ca verify-gates (epic-id)
2. pnpm test -- all green
3. pnpm lint -- zero violations
4. git status, git add (specific files), bd sync, git commit, git push
Work is NOT done until git push succeeds.
`,

  // =========================================================================
  // Utility commands (CLI wrappers)
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
  'search.md': `---
name: compound:search
description: Search stored lessons for relevant context
argument-hint: "<search query>"
---
Search lessons for relevant context.

Usage: /compound search <query>

Examples:
- /compound search "API authentication"
- /compound search "data processing patterns"

\`\`\`bash
npx ca search "$ARGUMENTS"
\`\`\`

Note: You can also use the \`memory_search\` MCP tool directly.
`,
  'list.md': `---
name: compound:list
description: Show all stored lessons
---
Show all stored lessons.

\`\`\`bash
npx ca list
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
  'show.md': `---
name: compound:show
description: Show details of a specific lesson
argument-hint: "<lesson-id>"
---
Show details of a specific lesson.

Usage: /compound show <lesson-id>

\`\`\`bash
npx ca show "$ARGUMENTS"
\`\`\`
`,
  'wrong.md': `---
name: compound:wrong
description: Mark a lesson as incorrect or invalid
argument-hint: "<lesson-id>"
---
Mark a lesson as incorrect or invalid.

Usage: /compound wrong <lesson-id>

\`\`\`bash
npx ca wrong "$ARGUMENTS"
\`\`\`
`,
  'stats.md': `---
name: compound:stats
description: Show compound-agent database statistics and health
---
Show compound-agent database statistics and health.

\`\`\`bash
npx ca stats
\`\`\`
`,
};
