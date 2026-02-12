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
2. Call \`memory_search\` with the topic to surface relevant past lessons.
3. Ask clarifying questions about scope, constraints, and desired outcomes.
4. Explore edge cases and failure modes.
5. Propose 2-3 alternative approaches with tradeoffs.
6. Run \`bd ready\` to check if related tasks already exist.
7. Summarize key decisions and open questions.

## Memory Integration
- Call \`memory_search\` at the start to avoid repeating past mistakes.
- If the brainstorm surfaces new insights, note them for later capture.

## Beads Integration
- Run \`bd ready\` to check for existing related work.
- If the brainstorm identifies new tasks, suggest creating them with \`bd create\`.
`,

  'plan.md': `$ARGUMENTS

# Plan

## Purpose
Create a structured implementation plan with concrete tasks and dependencies.

## Workflow
1. Parse the goal from \`$ARGUMENTS\`. If empty, ask the user what to plan.
2. Call \`memory_search\` with the goal to find relevant past lessons.
3. Analyze the codebase to understand current structure and constraints.
4. Break the goal into concrete, ordered tasks with clear acceptance criteria.
5. Identify dependencies between tasks.
6. Create a beads issue for each task:
   \`\`\`bash
   bd create --title="<task>" --type=task --priority=<1-4>
   \`\`\`
7. Output the plan as a structured list with task IDs and dependencies.

## Memory Integration
- Call \`memory_search\` before planning to learn from past approaches.
- Search for architectural patterns relevant to the goal.

## Beads Integration
- Create one \`bd\` issue per task with \`bd create\`.
- Set priority (1=critical, 4=low) based on dependency order.
- Note blocking relationships in issue descriptions.
`,

  'work.md': `$ARGUMENTS

# Work

## Purpose
Execute implementation following strict TDD: tests first, then minimal code.

## Workflow
1. Run \`bd ready\` to find available tasks. If \`$ARGUMENTS\` specifies a task ID, work on that.
2. Mark the task in progress: \`bd update <id> --status=in_progress\`.
3. Call \`memory_search\` with the task description before starting.
4. Write failing tests FIRST that define the expected behavior.
5. Verify tests fail for the right reason (missing implementation, not syntax errors).
6. Write the minimal code to pass each test, one at a time.
7. Refactor only after all tests pass.
8. Run the full test suite to check for regressions.
9. Close the task: \`bd close <id>\`.

## Memory Integration
- Call \`memory_search\` before architectural decisions.
- After corrections or discoveries, call \`memory_capture\` to record them.

## Beads Integration
- Start with \`bd ready\` to pick work.
- Update status with \`bd update <id> --status=in_progress\`.
- Close with \`bd close <id>\` when tests pass.
`,

  'review.md': `$ARGUMENTS

# Review

## Purpose
Multi-perspective code review covering security, architecture, performance, tests, and simplicity.

## Workflow
1. Identify what to review from \`$ARGUMENTS\` or recent changes (\`git diff\`).
2. Call \`memory_search\` with the changed areas to find relevant past lessons.
3. Review from each perspective:
   - **Security**: Injection risks, auth issues, data exposure
   - **Architecture**: Module boundaries, coupling, cohesion
   - **Performance**: Unnecessary allocations, N+1 queries, blocking calls
   - **Test coverage**: Missing edge cases, cargo-cult tests, mocked business logic
   - **Simplicity**: Over-engineering, dead code, unnecessary abstractions
4. For each finding, create a beads issue:
   \`\`\`bash
   bd create --title="<finding>" --type=bug --priority=<1-4>
   \`\`\`
5. Output a review summary with pass/fail per perspective.

## Memory Integration
- Call \`memory_search\` for known issues in the changed areas.
- After the review, call \`memory_capture\` for novel findings.

## Beads Integration
- Create \`bd\` issues for each actionable finding with \`bd create --type=bug\`.
- Reference the reviewed code in issue descriptions.
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

4. **Review phase**: Multi-perspective review.
   - Check security, architecture, performance, tests, simplicity.
   - Create issues for findings.

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
