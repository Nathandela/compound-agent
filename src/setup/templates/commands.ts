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
3. Use \`AskUserQuestion\` to clarify scope, constraints, and preferences through structured dialogue.
4. Explore edge cases and failure modes.
5. Optional: spawn Explore subagents for quick codebase research on specific aspects relevant to the brainstorm.
6. Propose 2-3 alternative approaches with tradeoffs.
7. Run \`bd ready\` to check if related tasks already exist.
8. Output a clear problem definition, chosen approach, and open questions.
9. Create a beads epic from conclusions:
   \`\`\`bash
   bd create --title="<epic title>" --type=feature --description="<problem definition + approach + scope>"
   \`\`\`

## Memory Integration
- Call \`memory_search\` at the start to avoid repeating past mistakes.
- If the brainstorm surfaces new insights, note them for later capture.

## Beads Integration
- Run \`bd ready\` to check for existing related work.
- Create a beads epic from brainstorm conclusions with \`bd create --type=feature\`.
- If the brainstorm identifies sub-tasks, suggest creating them with \`bd create\`.
`,

  'plan.md': `$ARGUMENTS

# Plan

## Purpose
Create a structured implementation plan enriched by semantic memory, with concrete tasks and dependencies.

## Workflow
1. Parse the goal from \`$ARGUMENTS\`. If empty, ask the user what to plan.
2. Check for brainstorm output: run \`bd list\` to find a related brainstorm epic. If one exists, read its description for decisions and open questions.
3. Call \`memory_search\` with the goal to retrieve relevant past lessons. Display retrieved memory items and incorporate them into planning context.
4. Spawn research agent team:
   - **Repo Analyst** (\`repo-analyst\`): explore codebase patterns, conventions, and architecture
   - **Memory Analyst** (\`memory-analyst\`): deep dive into related memory items with multiple search queries
5. Synthesize research findings from both agents into a coherent plan.
6. Break the goal into concrete, ordered tasks with clear acceptance criteria.
7. Create beads issues and map dependencies:
   \`\`\`bash
   bd create --title="<task>" --type=task --priority=<1-4>
   bd dep add <dependent-task> <blocking-task>
   \`\`\`
8. Output the plan as a structured list with task IDs and dependency graph.

## Memory Integration
- Call \`memory_search\` before planning to learn from past approaches.
- Search for architectural patterns relevant to the goal.
- Incorporate retrieved lessons into task descriptions as context.

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
5. Execute based on assessed complexity:
   - If **trivial** (config changes, typos, one-line fixes): handle directly with a single agent. No TDD pair needed. Proceed to verification and close.
   - If **simple** (well-scoped feature or bug fix): sequential TDD — delegate to **test-writer** agent to write failing tests, then delegate to **implementer** agent to make them pass.
   - If **complex** (cross-cutting or ambiguous scope): iterative TDD — delegate to **test-writer** and **implementer** in ping-pong cycles until done.
6. When agents work on overlapping areas, they communicate directly to coordinate and avoid conflicts.
7. Lead coordinates the cycle: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
8. Commit incrementally as tests pass — do not batch all commits to the end.
9. Run the full test suite to check for regressions.
10. Close the task: \`bd close <id>\`.

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
   - **architecture-reviewer**: module boundaries, coupling, cohesion
   - **performance-reviewer**: unnecessary allocations, N+1 queries, blocking calls
   - **test-coverage-reviewer**: missing edge cases, cargo-cult tests, mocked business logic
   - **simplicity-reviewer**: over-engineering, dead code, unnecessary abstractions
4. Reviewers communicate findings with each other via direct messages so cross-cutting issues (e.g., a security fix that impacts performance) are identified early.
5. Collect all findings and classify by severity:
   - **P1** (critical): security vulnerabilities, data loss, correctness bugs — P1 findings block completion
   - **P2** (important): architectural violations, significant performance issues
   - **P3** (minor): style nits, small improvements, non-urgent suggestions
6. Synthesize and prioritize findings — deduplicate overlapping reports, consolidate related items, and rank by severity before creating issues.
7. For P1 findings, create beads issues:
   \`\`\`bash
   bd create --title="P1: <finding>" --type=bug --priority=1
   \`\`\`
8. Run quality gates: \`pnpm test\` and \`pnpm lint\` to verify no regressions.
9. Submit to **\`/implementation-reviewer\`** as the mandatory gate — it has final authority on whether the review passes. All P1 findings must be resolved before approval.
10. Output a review summary with pass/fail per perspective and severity breakdown.

## Memory Integration
- Call \`memory_search\` at the start for known issues in the changed areas.
- After the review, call \`memory_capture\` with \`type=solution\` to store the review report for future sessions.

## Beads Integration
- Create \`bd\` issues for P1 and P2 findings with \`bd create\`.
- Reference the reviewed code in issue descriptions.
- Close related issues with \`bd close\` when findings are resolved.
`,

  'compound.md': `$ARGUMENTS

# Compound

## Purpose
Capture knowledge from completed work into the memory system.

## Workflow
1. Identify what was done from \`$ARGUMENTS\` or recent git history.
2. Call \`memory_search\` to check what is already stored (avoid duplicates).
3. Analyze the work for learnings:
   - Mistakes made and corrections applied
   - Project-specific patterns discovered
   - Architectural decisions and their rationale
   - Tool or library gotchas encountered
4. For each novel lesson, call \`memory_capture\` with:
   - A clear, actionable insight
   - The trigger that caused the learning
   - Relevant context (file paths, error messages)
5. Run \`bd ready\` to check if any related issues should be updated.
6. Output a summary of captured memory items.

## Memory Integration
- Call \`memory_search\` first to avoid storing duplicates.
- Call \`memory_capture\` for each novel, actionable lesson.

## Beads Integration
- Check \`bd ready\` for related open issues.
- Close any issues resolved by the captured knowledge with \`bd close\`.
`,

  'lfg.md': `$ARGUMENTS

# LFG (Full Cycle)

## Purpose
Chain all phases: brainstorm, plan, work, review, compound. End-to-end delivery.

## Workflow
1. **Brainstorm phase**: Explore the goal from \`$ARGUMENTS\`.
   - Call \`memory_search\` with the goal.
   - Ask clarifying questions, explore alternatives.
   - Produce a brainstorm summary.

2. **Plan phase**: Structure the work.
   - Break into tasks with dependencies.
   - Create beads issues for tracking.
   - Produce a plan with task IDs.

3. **Work phase**: Implement with TDD.
   - For each task: tests first, then implementation.
   - Call \`memory_search\` before architectural decisions.
   - Call \`memory_capture\` after corrections.
   - Close tasks as they complete.

4. **Review phase**: Multi-perspective review with severity classification.
   - Classify findings as P1 (critical/blocking), P2 (important), P3 (minor).
   - P1 findings must be fixed before proceeding — they block completion.
   - Submit to \`/implementation-reviewer\` as the mandatory gate before moving on.
   - Create beads issues for P1/P2 findings.

5. **Compound phase**: Capture learnings.
   - Store novel insights via \`memory_capture\`.
   - Avoid duplicates by searching first with \`memory_search\`.

## Stop Conditions
- Stop if brainstorm reveals the goal is unclear (ask user).
- Stop if any test phase produces failures that cannot be resolved.
- Stop if review finds critical security issues.

## Memory Integration
- \`memory_search\` is called in brainstorm, work, and compound phases.
- \`memory_capture\` is called in work and compound phases.
`,
};
