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
3. Spawn Explore subagents to research existing context:
   - **docs-explorer**: scan \`docs/\` for architecture docs, specs, research, standards, anti-patterns, and existing ADRs in \`docs/decisions/\`
   - **code-explorer**: quick codebase research on areas relevant to the brainstorm
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
4. Spawn research agent team:
   - **Docs Analyst** (\`docs-analyst\`): scan \`docs/\` for specs, standards, anti-patterns, and ADRs in \`docs/decisions/\` that constrain the plan
   - **Repo Analyst** (\`repo-analyst\`): explore codebase patterns, conventions, and architecture
   - **Memory Analyst** (\`memory-analyst\`): deep dive into related memory items with multiple search queries
5. Synthesize research findings from all agents into a coherent plan. Flag any conflicts between ADRs and proposed approach.
6. Use \`AskUserQuestion\` to resolve ambiguities: unclear requirements, conflicting ADRs, or priority trade-offs that need user input before decomposing.
7. Break the goal into concrete, ordered tasks with clear acceptance criteria.
8. Create beads issues and map dependencies:
   \`\`\`bash
   bd create --title="<task>" --type=task --priority=<1-4>
   bd dep add <dependent-task> <blocking-task>
   \`\`\`
9. Output the plan as a structured list with task IDs and dependency graph.

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
5. For non-trivial tasks, spawn a **test-analyst** agent before any code is written. The test-analyst:
   - Analyzes the task requirements and acceptance criteria
   - Identifies happy paths, edge cases, failure modes, boundary conditions, and invariants
   - Produces a structured **test plan** (not code) listing concrete test cases to cover
   - The test-writer then implements this plan as actual test code
6. Execute based on assessed complexity:
   - If **trivial** (config changes, typos, one-line fixes): handle directly with a single agent. No TDD pair needed. Proceed to verification and close.
   - If **simple** (well-scoped feature or bug fix): sequential TDD — **test-analyst** produces test plan, then **test-writer** implements failing tests, then **implementer** makes them pass.
   - If **complex** (cross-cutting or ambiguous scope): iterative TDD — **test-analyst** produces test plan, then **test-writer** and **implementer** alternate in ping-pong cycles until done.
7. When agents work on overlapping areas, they communicate directly to coordinate and avoid conflicts.
8. Lead coordinates the cycle: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
9. If blocked by ambiguity or conflicting agent outputs, use \`AskUserQuestion\` to get user direction before proceeding.
10. Commit incrementally as tests pass — do not batch all commits to the end.
11. Run the full test suite to check for regressions.
12. Close the task: \`bd close <id>\`.

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
1. Identify what to review from \`$ARGUMENTS\` or recent changes (\`git diff\`).
2. Call \`memory_search\` with the changed areas to surface relevant past lessons.
3. Spawn the reviewer agent team in parallel — one agent per perspective:
   - **security-reviewer**: injection risks, auth issues, data exposure
   - **architecture-reviewer**: module boundaries, coupling, cohesion, API design
   - **performance-reviewer**: unnecessary allocations, N+1 queries, blocking calls
   - **test-coverage-reviewer**: missing edge cases, cargo-cult tests, mocked business logic
   - **simplicity-reviewer**: over-engineering, dead code, unnecessary abstractions
   - **docs-reviewer**: documentation alignment, ADR compliance, undocumented public APIs
   - **consistency-reviewer**: naming conventions, code patterns, style consistency with existing codebase
   - **error-handling-reviewer**: error messages quality, resilience, logging, observability
   - **edge-case-reviewer**: boundary conditions, off-by-one, nil/undefined, empty inputs, type coercion traps
   - **pattern-matcher**: search \`memory_search\` for recurring issues — if a finding matches a known pattern, auto-reinforce its severity via \`memory_capture\`
   - **cct-reviewer**: check code against CCT patterns in \`.claude/lessons/cct-patterns.jsonl\` for known Claude mistakes from past sessions
4. Reviewers communicate findings with each other via direct messages so cross-cutting issues (e.g., a security fix that impacts performance) are identified early.
5. Collect all findings and classify by severity:
   - **P1** (critical): security vulnerabilities, data loss, correctness bugs — P1 findings block completion
   - **P2** (important): architectural violations, significant performance issues
   - **P3** (minor): style nits, small improvements, non-urgent suggestions
6. Synthesize and prioritize findings — deduplicate overlapping reports, consolidate related items, and rank by severity before creating issues.
7. Use \`AskUserQuestion\` when severity classification is ambiguous (e.g., a finding could be P1 or P2) or when the fix approach has multiple valid options.
8. For P1 findings, create beads issues:
   \`\`\`bash
   bd create --title="P1: <finding>" --type=bug --priority=1
   \`\`\`
9. Run quality gates: \`pnpm test\` and \`pnpm lint\` to verify no regressions.
10. Submit to **\`/implementation-reviewer\`** as the mandatory gate — it has final authority on whether the review passes. All P1 findings must be resolved before approval.
11. Output a review summary with pass/fail per perspective and severity breakdown.

## Memory Integration
- Call \`memory_search\` at the start for known issues in the changed areas.
- **pattern-matcher** auto-reinforces: when a review finding matches an existing memory item, call \`memory_capture\` to increase its severity (recurring issues become higher priority).
- **cct-reviewer** reads \`.claude/lessons/cct-patterns.jsonl\` for known Claude failure patterns.
- After the review, call \`memory_capture\` with \`type=solution\` to store the review report for future sessions.

## Docs Integration
- **docs-reviewer** checks that code changes align with \`docs/\` content and existing ADRs.
- Flags if a public API was added without documentation.
- Flags if code contradicts an existing ADR in \`docs/decisions/\`.

## Beads Integration
- Create \`bd\` issues for P1 and P2 findings with \`bd create\`.
- Reference the reviewed code in issue descriptions.
- Close related issues with \`bd close\` when findings are resolved.
`,

  'compound.md': `$ARGUMENTS

# Compound

## Purpose
Multi-agent analysis to capture high-quality lessons from completed work into the memory system and update project documentation.

## Workflow
1. Parse what was done from \`$ARGUMENTS\` or recent git history (\`git diff\`, \`git log\`).
2. Call \`memory_search\` with the topic to check what is already known (avoid duplicates).
3. Spawn the compound analysis team in parallel:
   - **context-analyzer**: summarize what happened (git diff, test results, plan context)
   - **lesson-extractor**: identify mistakes, corrections, and discoveries
   - **docs-reviewer**: scan \`docs/\` for docs that need updating based on what changed, and check if any ADR in \`docs/decisions/\` should be deprecated or superseded
   - **pattern-matcher**: match against existing memory, classify New/Duplicate/Reinforcement/Contradiction
   - **solution-writer**: formulate structured items typed as lesson, solution, pattern, or preference
   - **compounding**: synthesize accumulated lessons into CCT patterns for test reuse
4. Agents pass results to each other via direct messages so downstream agents build on upstream findings.
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
   - Spawn docs-explorer to scan \`docs/\` for relevant context and existing ADRs.
   - Ask clarifying questions, explore alternatives.
   - Auto-create ADRs for significant decisions in \`docs/decisions/\`.
   - Produce a brainstorm summary.

2. **Plan phase**: Structure the work.
   - Spawn docs-analyst to check specs, standards, and ADRs that constrain the plan.
   - Break into tasks with dependencies.
   - Create beads issues for tracking.
   - Produce a plan with task IDs.

3. **Work phase**: Implement with TDD.
   - For each task: tests first, then implementation.
   - Call \`memory_search\` before architectural decisions.
   - Call \`memory_capture\` after corrections.
   - Close tasks as they complete.

4. **Review phase**: 11-agent review with severity classification.
   - Core (security, architecture, performance, test-coverage, simplicity), quality (docs, consistency, error-handling), intelligence (edge-case, pattern-matcher, cct-reviewer).
   - Classify findings as P1 (critical/blocking), P2 (important), P3 (minor).
   - P1 findings must be fixed before proceeding — they block completion.
   - Submit to \`/implementation-reviewer\` as the mandatory gate before moving on.
   - Create beads issues for P1/P2 findings.

5. **Compound phase**: Capture learnings.
   - Store novel insights via \`memory_capture\`.
   - Avoid duplicates by searching first with \`memory_search\`.
   - Spawn docs-reviewer to check if \`docs/\` or ADRs need updating.

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
};
