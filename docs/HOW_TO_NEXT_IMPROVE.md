# How to Next Improve Compound Agent

> Analysis based on comparing our codebase against Anthropic's [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) blog post (March 2026).

## What We Already Do Well

| Area | Blog Recommends | We Already Have |
|------|-----------------|-----------------|
| Separated evaluation | Distinct Evaluator agent | 24-agent review phase, separate from work |
| Structured phases | Planner -> Generator -> Evaluator | spec-dev -> plan -> work -> review -> compound |
| File-based handoffs | Files as inter-agent contracts | Phase state JSON, skill files, JSONL lessons |
| Context management | Resets or compaction | PreCompact hook + prime for context recovery |
| Active crash recovery | Not covered | 3-layer memory defense + watchdog in infinity loop |
| Learning from failures | Not covered (the blog's blind spot) | Our entire product -- lesson capture, retrieval, synthesis |
| Autonomous multi-session | Single harness run | Infinity loop with per-epic sessions + cross-model review |

Our lesson system is genuinely novel relative to the blog. They have no equivalent -- their evaluator catches bugs *this run* but doesn't learn across runs.

---

## Improvements (Priority Order)

### 1. Lesson-Calibrated Reviewers

**Effort**: Low | **Impact**: High

**Blog insight**: Evaluators need few-shot calibration -- examples of past failures where the evaluator let bad work through.

**Our advantage**: We already have a lesson database of past mistakes. But lessons currently flow into the *work* phase (via plan-time retrieval), not into the *review* phase.

**Action**: Feed relevant lessons into review agents as calibration context. When the security-reviewer runs, inject past security lessons as "things that were missed before -- don't let these through again." Connect compound synthesis directly to the review pipeline.

### 2. Active Runtime Verification

**Effort**: Medium | **Impact**: High

**Blog insight**: The evaluator uses Playwright to *interact with running apps*, catching real bugs that static code review misses (API 422s, broken drag-and-drop, state bugs).

**Our gap**: Our 24 review agents are static code reviewers. They read code and reason about it but don't execute anything.

**Action**: Add a `runtime-verifier` agent to the review pipeline that:
- Runs the test suite and parses actual failures (not just code review)
- For web projects: uses Playwright/browser automation to exercise the running app
- Produces concrete bug reports with reproduction steps
- This single agent would likely catch more real bugs than several of the static reviewers combined

### 3. Simplification Audit

**Effort**: Low | **Impact**: Prevents over-engineering

**Blog insight**: *"Every harness component encodes an assumption about model limitations. Test those assumptions at each model release by removing components one at a time."*

**Our risk**: 24 review agents is a lot of surface area. With Opus 4.6, many may be redundant -- the implementation-reviewer alone might catch what 5 specialized reviewers used to catch separately.

**Action**:
- Instrument each reviewer to report findings count and severity
- Track which reviewers produce actionable findings vs. noise over time
- Establish a periodic "simplification audit": disable one reviewer, run the same code through the remaining pipeline, measure delta
- The blog went from sprint-per-sprint evaluation to a single end-of-run pass with Opus 4.6. Our pipeline may be ready for similar consolidation.

### 4. Acceptance Criteria Negotiation

**Effort**: Medium | **Impact**: Improves review consistency

**Blog insight**: Before implementation, the Generator and Evaluator negotiate a contract with specific testable criteria. This catches misalignment *before* wasted work.

**Our gap**: spec-dev produces a spec, plan produces tasks, work implements, review evaluates -- but the review phase discovers its own criteria at review time. There's no pre-negotiation.

**Action**: At the end of the `plan` phase (or start of `work`), generate an explicit acceptance criteria file that both `work` and `review` reference. The review phase checks against these criteria rather than inventing its own.

### 5. Per-Phase Context Resets

**Effort**: High | **Impact**: High quality for complex tasks

**Blog insight**: Full context resets with structured handoff artifacts outperform compaction for maintaining coherence across long tasks.

**Our current approach**: cook-it runs all 5 phases in one session, relying on compaction. The infinity loop uses separate sessions per epic (good), but within a single cook-it cycle, context degrades.

**Action**: For complex cook-it cycles, consider spawning each phase as a separate Claude Code session (like infinity loop does for epics). The handoff artifact would be the phase state file + a structured summary of decisions made.

### 6. Smarter Failure Escalation

**Effort**: Low | **Impact**: Incremental

**Blog insight**: Failed sprints trigger regeneration with specific feedback. The evaluator doesn't just flag -- it causes action.

**Our current state**: The `stop-audit` hook blocks premature exits, and `phase-guard` prevents out-of-order edits. But `post-tool-failure` only tracks failure counts and emits tips.

**Action**: Make `post-tool-failure` smarter. After N failures on the same target:
- Auto-search lessons for similar past failures (`ca search` with the error context)
- Inject the matching lesson directly into the hook output, not just a generic "try ca search" tip
- Close the loop between failure detection and lesson retrieval automatically

---

## What NOT to Change

The blog's approach is simpler in areas where our product is justifiably more complex:

- **Don't simplify the lesson system** -- the blog has nothing comparable, and this is our moat
- **Don't remove the hook system** -- the blog doesn't cover hooks because they built a standalone harness, not a Claude Code extension. Our hooks are the right integration pattern for our distribution model
- **Don't reduce to 3 agents** -- the blog's 3-agent model (Planner/Generator/Evaluator) works for their use case (building apps from scratch). Our 24-agent review pipeline serves a different purpose (catching subtle defects in existing codebases). But *do* measure which ones earn their keep

---

## Skill Review

It is time for a comprehensive skill review using the `skill-creator` plugin. Our skills (phase skills, agent role skills, workflow commands) should be audited for:

- **Triggering accuracy** -- are skills firing when they should and staying silent when they shouldn't?
- **Prompt quality** -- do skill prompts follow current best practices given model improvements?
- **Redundancy** -- are multiple skills covering the same ground?
- **Calibration** -- are review-oriented skills calibrated with real past failures from our lesson system?

Run `/skill-creator:skill-creator` to begin the audit cycle.

---

## Core Principle

> *Build the simplest harness that compensates for current model limitations, and re-test those assumptions regularly.*

The blog's strongest message applies directly to us: our product has excellent bones -- the risk is complexity creep in the review pipeline without measuring whether each component still earns its place.
