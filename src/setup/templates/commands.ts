/**
 * Workflow slash command templates for .claude/commands/compound/.
 */

export const WORKFLOW_COMMANDS: Record<string, string> = {
  'brainstorm.md': `$ARGUMENTS

# Brainstorm

## Purpose
Explore requirements through collaborative dialogue before committing to a plan.

## Workflow
1. Parse the topic from \`$ARGUMENTS\`. If empty, ask the user what to brainstorm.
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
   \`\`\`bash
   bd create --title="<epic title>" --type=feature --description="<problem definition + approach + scope>"
   \`\`\`
10. For each significant decision, auto-create an ADR in \`docs/decisions/\`:
    - Scan \`docs/decisions/\` for the highest existing number, increment by 1
    - Write \`docs/decisions/NNN-<kebab-title>.md\` using this template:
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

  'plan.md': `$ARGUMENTS

# Plan

## Purpose
Create a structured implementation plan enriched by semantic memory and existing documentation, with concrete tasks and dependencies.

## Workflow
1. Parse the goal from \`$ARGUMENTS\`. If empty, ask the user what to plan.
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
8. Create beads issues and map dependencies:
   \`\`\`bash
   bd create --title="<task>" --type=task --priority=<1-4>
   bd dep add <dependent-task> <blocking-task>
   \`\`\`
9. **Create review and compound blocking tasks** so they survive compaction:
   \`\`\`bash
   bd create --title="Review: /compound:review" --type=task --priority=1
   bd create --title="Compound: /compound:compound" --type=task --priority=1
   bd dep add <review-id> <last-work-task>   # review depends on work
   bd dep add <compound-id> <review-id>       # compound depends on review
   \`\`\`
   These tasks surface via \`bd ready\` after work completes, ensuring review and compound phases are never skipped — even after context compaction.
10. Output the plan as a structured list with task IDs and dependency graph.

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
- Map dependencies with \`bd dep add <dependent> <blocker>\`.
- Each task should include acceptance criteria in its description.
`,

  'work.md': `$ARGUMENTS

# Work

## Purpose
Execute implementation by delegating to an agent team. The lead coordinates and does not code directly.

## Workflow
1. Parse task from \`$ARGUMENTS\`. If empty, run \`bd ready\` to find available tasks.
2. Mark task in progress: \`bd update <id> --status=in_progress\`.
3. Call \`memory_search\` with the task description to retrieve relevant lessons. Run \`memory_search\` per agent/subtask so each gets targeted context.
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
15. Close the task: \`bd close <id>\`.

## Verification Gate
Before marking work complete, run the 8-step TDD verification pipeline:
1. /invariant-designer → 2. /cct-subagent → 3. /test-first-enforcer → 4. /property-test-generator → 5. /anti-cargo-cult-reviewer → 6. /module-boundary-reviewer → 7. /drift-detector → 8. /implementation-reviewer

## Memory Integration
- Call \`memory_search\` per delegated subtask with the subtask's specific description, not one shared query.
- Each agent receives memory items tailored to their assigned task.
- After corrections or discoveries, call \`memory_capture\` to record them.

## Beads Integration
- Start with \`bd ready\` to pick work.
- Update status with \`bd update <id> --status=in_progress\`.
- Close with \`bd close <id>\` when all tests pass.
`,

  'review.md': `$ARGUMENTS

# Review

## Purpose
Multi-agent code review with severity classification and a mandatory \`/implementation-reviewer\` gate.

## Workflow
1. Run quality gates first: \`pnpm test && pnpm lint\`.
2. Identify scope from \`$ARGUMENTS\` or \`git diff\`. Count changed lines.
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
9. For P1/P2 findings: \`bd create --title="P1: <finding>" --type=bug --priority=1\`
10. Submit to **\`/implementation-reviewer\`** — mandatory gate, final authority. All P1s must be resolved.
11. **External reviewers (optional)**: Check \`.claude/compound-agent.json\` for \`"externalReviewers"\`. Spawn configured reviewers. Advisory only, never blocks.
12. Output review summary with severity breakdown and external findings (if any).

## Memory Integration
- Call \`memory_search\` at the start for known issues in changed areas.
- **pattern-matcher** auto-reinforces recurring findings via \`memory_capture\`.
- **cct-reviewer** reads \`.claude/lessons/cct-patterns.jsonl\` for known Claude mistakes.
- After review, call \`memory_capture\` with \`type=solution\` to store the review report.

## Docs Integration
- **docs-reviewer** checks code changes align with \`docs/\` and existing ADRs.
- Flags undocumented public APIs and ADR contradictions.

## Beads Integration
- Create \`bd\` issues for P1 and P2 findings with \`bd create\`.
- Close related issues with \`bd close\` when findings are resolved.
`,

  'compound.md': `$ARGUMENTS

# Compound

## Purpose
Multi-agent analysis to capture high-quality lessons from completed work into the memory system and update project documentation.

## Workflow
1. Parse what was done from \`$ARGUMENTS\` or recent git history (\`git diff\`, \`git log\`).
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
`,

  'lfg.md': `$ARGUMENTS

# LFG (Full Cycle)

## Purpose
Chain all phases: brainstorm, plan, work, review, compound. End-to-end delivery.

## Workflow
1. **Brainstorm phase**: Explore the goal from \`$ARGUMENTS\`.
   - Call \`memory_search\` with the goal.
   - \`TeamCreate\` team "brainstorm-<slug>", spawn docs-explorer + code-explorer as parallel teammates.
   - Ask clarifying questions via \`AskUserQuestion\`, explore alternatives.
   - Auto-create ADRs for significant decisions in \`docs/decisions/\`.
   - Create a beads epic from conclusions with \`bd create --type=feature\`.
   - Shut down brainstorm team before next phase.

2. **Plan phase**: Structure the work.
   - Check for brainstorm epic via \`bd list\`.
   - \`TeamCreate\` team "plan-<slug>", spawn docs-analyst + repo-analyst + memory-analyst as parallel teammates.
   - Break into tasks with dependencies and acceptance criteria.
   - Create beads issues with \`bd create\` and map dependencies with \`bd dep add\`.
   - Create review and compound blocking tasks (\`bd create\` + \`bd dep add\`) so they survive compaction and surface via \`bd ready\` after work completes.
   - Shut down plan team before next phase.

3. **Work phase**: Implement with adaptive TDD.
   - Assess complexity (trivial/simple/complex) to choose strategy.
   - Trivial: single subagent, no team. Simple/complex: \`TeamCreate\` team "work-<task-id>".
   - Spawn test-analyst first, then test-writer + implementer as teammates.
   - Call \`memory_search\` per subtask; \`memory_capture\` after corrections.
   - Commit incrementally. Close tasks as they complete.
   - Run verification gate before marking complete. Shut down work team.

4. **Review phase**: 11-agent review with severity classification.
   - Run quality gates first: \`pnpm test && pnpm lint\`.
   - \`TeamCreate\` team "review-<slug>", spawn all 11 reviewers as parallel teammates.
   - Classify findings as P1 (critical/blocking), P2 (important), P3 (minor).
   - P1 findings must be fixed before proceeding — they block completion.
   - Submit to \`/implementation-reviewer\` as the mandatory gate. Shut down review team.

5. **Compound phase**: Capture learnings.
   - \`TeamCreate\` team "compound-<slug>", spawn 6 analysis agents as parallel teammates.
   - Search first with \`memory_search\` to avoid duplicates. Apply quality filters (novelty + specificity).
   - Store novel insights via \`memory_capture\` with supersedes/related links.
   - Update outdated docs and deprecate superseded ADRs.
   - Use \`AskUserQuestion\` to confirm high-severity items. Shut down compound team.

## Agent Team Pattern
Each phase creates its own AgentTeam via \`TeamCreate\`, spawns teammates via \`Task\` tool with \`team_name\`, coordinates via \`SendMessage\`, and shuts down with \`shutdown_request\` before the next phase starts. Use subagents (Task without team_name) only for quick lookups like \`memory_search\` or \`bd\` commands.

## Phase Control
- **Skip phases**: Parse \`$ARGUMENTS\` for "from <phase>" (e.g., "from plan"). Skip all phases before the named one.
- **Progress**: Announce the current phase before starting it (e.g., "[Phase 2/5] Plan").
- **Retry**: If a phase fails, report the failure and ask the user whether to retry, skip, or abort.
- **Resume**: After interruption, check \`bd list --status=in_progress\` to find where work stopped and resume from that phase.

## Stop Conditions
- Stop if brainstorm reveals the goal is unclear (ask user).
- Stop if any test phase produces failures that cannot be resolved.
- Stop if review finds critical security issues.

## Memory Integration
- \`memory_search\` is called in brainstorm, work, and compound phases.
- \`memory_capture\` is called in work and compound phases.
`,

  // =========================================================================
  // Utility commands (CLI wrappers)
  // =========================================================================

  'learn.md': `Capture a lesson from this session.

Usage: /compound learn <insight>

Examples:
- /compound learn "Always use Polars for large CSV files"
- /compound learn "API requires X-Request-ID header"

\`\`\`bash
npx ca learn "$ARGUMENTS"
\`\`\`
`,
  'search.md': `Search lessons for relevant context.

Usage: /compound search <query>

Examples:
- /compound search "API authentication"
- /compound search "data processing patterns"

\`\`\`bash
npx ca search "$ARGUMENTS"
\`\`\`

Note: You can also use the \`memory_search\` MCP tool directly.
`,
  'list.md': `Show all stored lessons.

\`\`\`bash
npx ca list
\`\`\`
`,
  'prime.md': `Load compound-agent workflow context after compaction or context loss.

\`\`\`bash
npx ca prime
\`\`\`
`,
  'show.md': `Show details of a specific lesson.

Usage: /compound show <lesson-id>

\`\`\`bash
npx ca show "$ARGUMENTS"
\`\`\`
`,
  'wrong.md': `Mark a lesson as incorrect or invalid.

Usage: /compound wrong <lesson-id>

\`\`\`bash
npx ca wrong "$ARGUMENTS"
\`\`\`
`,
  'stats.md': `Show compound-agent database statistics and health.

\`\`\`bash
npx ca stats
\`\`\`
`,
};
