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
Explore the problem space before committing to a solution. This phase produces a structured brainstorm document with decisions and open questions.

## Methodology
1. Ask "why" before "how" -- understand the real problem
2. Divergent phase: generate multiple approaches without filtering
3. Search memory with \`memory_search\` for similar past features and known constraints
4. Identify constraints and non-functional requirements (performance, security, etc.)
5. Convergent phase: evaluate approaches against constraints
6. Document decisions with rationale and list open questions

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

## Quality Criteria
- Multiple approaches were considered (at least 2-3)
- Constraints and requirements are explicitly listed
- Memory was searched for relevant context
- A clear decision was made with documented rationale
- Open questions are captured for the plan phase
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
description: Implement with strict TDD -- Red, Green, Refactor
---

# Work Skill

## Overview
Implement features using strict Test-Driven Development. Write tests first, make them pass with minimal code, then refactor.

## Methodology
1. Pick the next task from the plan
2. Search memory with \`memory_search\` before architectural decisions
3. **Red**: Write a failing test that describes expected behavior
4. Verify the test fails for the right reason (missing implementation, not syntax error)
5. **Green**: Write the minimum code to make the test pass
6. **Refactor**: Clean up while keeping tests green
7. Repeat for the next test case
8. After corrections or discoveries, call \`memory_capture\` to record the lesson

## Memory Integration
- Call \`memory_search\` before making architectural decisions
- Call \`memory_search\` when encountering unfamiliar patterns
- Call \`memory_capture\` after user corrections or test-fail-fix cycles
- Call \`memory_capture\` when discovering project-specific knowledge

## Common Pitfalls
- Skipping tests and writing implementation first
- Writing too much code at once instead of one test at a time
- Modifying tests to make them pass (fix the implementation instead)
- Over-engineering: adding features or abstractions not requested
- Not checking memory before architectural decisions

## Quality Criteria
- Tests existed before implementation code
- Each test describes a specific behavior (clear name)
- Implementation is the minimum needed to pass tests
- All tests pass after refactoring
- Memory was consulted for relevant decisions
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
