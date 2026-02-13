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
2. Search memory with \`memory_search\` for similar past features and known constraints
3. Use \`AskUserQuestion\` to clarify scope, constraints, and preferences
4. Divergent phase: generate multiple approaches without filtering
5. Optional: spawn Explore subagents for quick codebase research on relevant areas
6. Identify constraints and non-functional requirements (performance, security, etc.)
7. Convergent phase: evaluate approaches against constraints
8. Document decisions with rationale, list open questions, and create a beads epic

## Memory Integration
- Call \`memory_search\` with relevant keywords before generating approaches
- Look for past architectural decisions, pitfalls, and preferences
- If the problem domain matches past work, review those lessons first

## Common Pitfalls
- Jumping to the first solution without exploring alternatives
- Ignoring non-functional requirements (scalability, maintainability)
- Not searching memory for similar past features
- Over-scoping: trying to solve everything at once
- Skipping the "why" and diving into "how"
- Not creating a beads epic from conclusions (losing brainstorm output)

## Quality Criteria
- Multiple approaches were considered (at least 2-3)
- Constraints and requirements are explicitly listed
- Memory was searched for relevant context
- User was engaged via \`AskUserQuestion\` for clarification
- A clear decision was made with documented rationale
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
2. Search memory with \`memory_search\` for architectural patterns and past mistakes
3. Spawn research agent team (repo-analyst for codebase, memory-analyst for deep memory search)
4. Synthesize research findings into a coherent approach
5. Decompose into tasks small enough to verify individually
6. Define acceptance criteria for each task
7. Map dependencies between tasks
8. Create beads issues: \`bd create --title="..." --type=task\`

## Memory Integration
- Call \`memory_search\` for patterns related to the feature area
- Look for past planning mistakes (missing dependencies, unclear criteria)
- Check for preferred architectural patterns in this codebase

## Common Pitfalls
- Creating too many fine-grained tasks (aim for 3-7 per feature)
- Unclear acceptance criteria ("make it work" is not a criterion)
- Missing dependencies between tasks
- Not checking memory for past architectural decisions
- Planning implementation details too early (stay at task level)

## Quality Criteria
- Each task has clear acceptance criteria
- Dependencies are mapped and no circular dependencies exist
- Tasks are ordered so each can be verified independently
- Memory was searched for relevant patterns and past mistakes
- Complexity estimates are realistic (no "should be quick")
`,

  work: `---
name: Work
description: Team-based TDD execution with adaptive complexity and agent delegation
---

# Work Skill

## Overview
Execute implementation through an agent team using adaptive TDD. The lead coordinates and delegates -- agents write code.

## Methodology
1. Pick a task from \`bd ready\` or \`$ARGUMENTS\`
2. Search memory with \`memory_search\` per agent/subtask for targeted context
3. Assess complexity (see below) and choose team strategy
4. Execute based on complexity:
   - If trivial: single agent handles directly, no TDD ceremony. Skip to step 7.
   - If simple: **Red** — delegate to test-writer for full test suite, then **Green** — delegate to implementer to make them pass.
   - If complex: **Red/Green ping-pong** — test-writer and implementer alternate in cycles until done.
5. When agents work on overlapping areas, they communicate directly to coordinate
6. **Refactor**: Review agent output, request cleanup if needed
7. Commit incrementally as tests pass — do not batch all commits to the end
8. Capture lessons with \`memory_capture\` after corrections or discoveries

## Team Structure
Adaptive TDD model based on task complexity:
- **Trivial**: Single agent handles the change directly, no TDD ceremony
- **Simple**: Sequential -- test-writer writes all tests, then implementer makes them pass
- **Complex**: Iterative ping-pong -- test-writer and implementer alternate in cycles

## Complexity Assessment
- **Trivial**: Config changes, typos, renaming, one-line fixes. No new behavior.
- **Simple**: Well-scoped feature or bug fix. Clear inputs/outputs. One module affected.
- **Complex**: Cross-module changes, architectural decisions, ambiguous requirements.

## Agent Delegation
The lead coordinates but does not write code:
- Spawn agents with task context and relevant memory items
- Review agent outputs for correctness and consistency
- Resolve conflicts between test expectations and implementation
- Escalate to user if agents cannot converge

## Memory Integration
- Call \`memory_search\` per delegated subtask with the subtask's specific description
- Each agent receives memory items tailored to their assigned task, not a shared blob
- Call \`memory_capture\` after corrections or novel discoveries

## Beads Lifecycle
- \`bd ready\` to find available tasks
- \`bd update <id> --status=in_progress\` when starting
- \`bd close <id>\` when all tests pass

## Common Pitfalls
- Lead writing code instead of delegating to agents
- Skipping complexity assessment and always using full TDD for trivial changes
- Not injecting memory context into agent prompts
- Modifying tests to make them pass instead of fixing implementation
- Not running the full test suite after agent work completes

## Quality Criteria
- Complexity was assessed before choosing team strategy
- Tests existed before implementation code
- Agents received relevant memory context
- Lead coordinated without writing implementation code
- Incremental commits made as tests pass
- All tests pass after refactoring
- Task lifecycle tracked via beads (\`bd\`)
`,

  review: `---
name: Review
description: Multi-agent review covering security, architecture, and quality
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, then consolidating and acting on findings.

## Methodology
1. Run all quality gates: \`pnpm test && pnpm lint\`
2. Spawn specialized reviewers in parallel (security, architecture, performance, etc.)
3. Collect findings from all reviewers
4. Deduplicate and prioritize findings by severity
5. Create beads issues for actionable findings: \`bd create --title="..."\`
6. Search memory with \`memory_search\` to check if findings match known patterns
7. Fix critical issues before proceeding

## Memory Integration
- Call \`memory_search\` to check if review findings match known patterns
- Past reviews may have identified recurring issues worth checking
- Use \`memory_capture\` for novel review findings that future sessions should know

## Common Pitfalls
- Ignoring reviewer feedback because "it works"
- Not running all specialized reviewers
- Treating all findings as equal priority (triage first)
- Not creating issues for deferred fixes
- Skipping the quality gates before review

## Quality Criteria
- All quality gates pass (tests, lint)
- Multiple review perspectives were applied
- Findings are prioritized and actionable
- Critical issues are fixed, others tracked as issues
- Memory was checked for recurring patterns
`,

  compound: `---
name: Compound
description: Reflect on the cycle and capture high-quality lessons for future sessions
---

# Compound Skill

## Overview
Extract and store lessons learned during the cycle. This is what makes the system compound -- each session leaves the next one better equipped.

## Methodology
1. Reflect on what happened during this cycle
2. Identify moments of learning: corrections, surprises, discoveries
3. Search memory with \`memory_search\` to check for duplicates
4. Apply quality filters: is the lesson novel, specific, and actionable?
5. Capture with \`memory_capture\` MCP tool (not CLI)
6. Verify the captured lesson reads well for a future session

## Memory Integration
- Call \`memory_search\` before capturing to avoid duplicates
- Call \`memory_capture\` for each high-quality lesson
- Focus on lessons that would change behavior in future sessions

## Common Pitfalls
- Capturing obvious or generic advice ("write good code")
- Lessons that are too vague to act on ("be careful with X")
- Not checking for duplicates before capturing
- Capturing too many low-value lessons (quality over quantity)
- Forgetting to capture -- this phase is easy to skip under time pressure

## Quality Criteria
- Each lesson is novel (not already in memory)
- Each lesson is specific (contains concrete guidance)
- Each lesson is actionable (clear what to do differently)
- Duplicates were checked with \`memory_search\`
- Lessons are written for a future session that has no context about this one
`,
};
