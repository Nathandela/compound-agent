# Live Orchestration

> Loaded on demand. Read when referenced by SKILL.md (Phase 5, Gate 4, mode B).

## Table of Contents

1. [Overview](#overview)
2. [When to Use](#when-to-use)
3. [Preconditions](#preconditions)
4. [Build the Ordered Worklist](#build-the-ordered-worklist)
5. [Harness-Adaptive Dispatch](#harness-adaptive-dispatch)
6. [The Sequential Per-Epic Loop](#the-sequential-per-epic-loop)
7. [Failure and Skip-Dependents Handling](#failure-and-skip-dependents-handling)
8. [Progress Tracking](#progress-tracking)
9. [Resume](#resume)
10. [Final Report](#final-report)
11. [Common Pitfalls](#common-pitfalls)

---

## Overview

Live orchestration is the in-conversation alternative to the detached infinity loop. Instead of generating a bash script and launching `ca loop` in a screen session, the architect model itself stays live in the current conversation and acts as the orchestrator. It walks the materialized epics in dependency order, running each one end-to-end via the existing `/compound:cook-it`, and tracks progress in beads + a live TodoWrite list.

**Key differences from the detached loop**:
- No `ca loop`, no screen session, no generated script. The orchestrator IS the live model.
- Epics are processed **SEQUENTIALLY**, one fully at a time, in dependency order.
- Each epic is run by invoking the existing `/compound:cook-it <epic-id>` -- the phases are NOT re-implemented here.
- Fully autonomous and **non-interactive**: each cook-it run proceeds with best-judgment defaults instead of pausing on `AskUserQuestion`. Dispatch cook-it so its phases do not block on human input (e.g. spawn it as a subagent/Task, or under the Workflow tool, where interactive prompts are not surfaced). If a decision genuinely cannot be made without the human, cook-it emits a `HUMAN_REQUIRED` marker for that epic; the orchestrator marks it blocked and continues, never pausing the whole run for input.

**Why sequential, never parallel**: Phase state lives in a single shared file (`.compound-agent/.ca-phase-state.json`) and the working tree is shared. Two epics running cook-it at the same time would clobber each other's phase state and produce colliding git commits. Parallelism still happens, but INSIDE each epic -- cook-it's work phase spawns parallel implementer teams. The epic-level loop stays strictly serial.

## When to Use

Live orchestration is mode B of the Phase 5 launch gate. Offer it when the user wants the architect to drive the build to completion in this conversation rather than detaching it to a background loop. Mode A (detached infinity loop via `/compound:launch-loop`) remains the default for long unattended runs; live orchestration is for in-session, observable, autonomous execution.

## Preconditions

Before starting the loop, verify all of the following. If any fails, fix it before proceeding:

- [ ] **All target epics are status=open** (`bd show <id> --json` for each). Already-closed epics are skipped as already-done (see [Resume](#resume)).
- [ ] **Dependencies are wired** (`bd show <id> --json` shows `depends_on`). The processing order depends on these.
- [ ] **The meta-epic exists** and carries the processing order (stored as notes during Phase 4). This is the authoritative ordering source.
- [ ] **`bd` and `ca` CLIs are available**.
- [ ] **The git working tree is clean** -- `git status --porcelain` is empty. Sequential epics share one tree, so any uncommitted changes from before the run must be committed or stashed first.
- [ ] **Phase state is clear** -- run `ca phase-check clean` to remove any stale `.compound-agent/.ca-phase-state.json`.
- [ ] **`/compound:cook-it` is available** as a command in this harness.

## Build the Ordered Worklist

1. Read the meta-epic processing order (Phase 4 stored it as notes: `bd show <meta-epic> --json`).
2. Read each epic's `depends_on` to confirm a valid topological order. Resolve ties by meta-epic priority, then by the stored processing order.
3. Produce a single ordered list of epic IDs. The Integration Verification (IV) epic, which depends on all others, naturally sorts last.
4. Drop any epic already status=closed (resume case).
5. Seed a TodoWrite list with one item per remaining epic, in worklist order, all `pending`.

The worklist is **static** once built -- do not re-topologically-sort mid-run. Dependency satisfaction is re-checked per epic at dispatch time against live epic statuses (see below).

## Harness-Adaptive Dispatch

The orchestrator adapts to whichever swarm primitive the harness exposes. Branch on availability:

- **If the harness exposes the Workflow tool (ultracode)**: use it to pipeline the epics through cook-it sequentially. Each worklist entry becomes a pipeline stage that runs `/compound:cook-it <epic-id>` end-to-end; stages execute one after another so phase state and the working tree are never shared concurrently.
- **Otherwise**: spawn one Task subagent per epic, one at a time, where each subagent runs `/compound:cook-it <epic-id>`. Use `AgentTeam`/`SendMessage` and opus subagents to drive the within-epic parallelism (cook-it's work phase). Wait for each epic's subagent to reach terminal state before dispatching the next.

In both branches the epic-level cadence is strictly serial: dispatch epic N, wait for it to finish (success or terminal failure), verify, mark, then dispatch epic N+1. Never overlap two epics.

## The Sequential Per-Epic Loop

For each epic in the ordered worklist, in order:

1. **Defensive phase-state reset and checkpoint**: run `ca phase-check clean` to clear any stale phase state from a prior epic before this one starts (the shared `.compound-agent/.ca-phase-state.json` must be clean at epic entry). Record the current commit so a failed epic can be rolled back cleanly: `EPIC_START_SHA=$(git rev-parse HEAD)`.
2. **Dependency re-check**: confirm every `depends_on` of this epic is status=closed. If a dependency is blocked or skipped, this epic is also skipped (see [Failure and Skip-Dependents Handling](#failure-and-skip-dependents-handling)).
3. **Mark in-progress**: set the TodoWrite item to `in_progress`.
4. **Run cook-it end-to-end**: dispatch `/compound:cook-it <epic-id>` via the harness-adaptive path above. Cook-it runs all five phases (spec-dev, plan, work, review, compound) and ALL its gates (post-plan, gate-3, gate-4, final). Do NOT re-implement or bypass any phase.
5. **Verify completion** after cook-it returns:
   - `ca verify-gates <epic-id>` must return PASS.
   - If it fails, treat the epic as failed/blocked (see below) even if cook-it claimed success.
6. **Close the epic**: run `bd close <epic-id>`. Cook-it closes the epic's Review and Compound tasks and cleans phase state, but the orchestrator owns closing the epic itself. Confirm `bd show <epic-id> --json` now shows status=closed; if it does not, treat the epic as blocked.
7. **Mark done**: set the TodoWrite item to `completed` and update the meta-epic checklist note (see [Progress Tracking](#progress-tracking)).
8. Continue to the next epic.

A cook-it run is considered failed when cook-it reports a failure, emits a `HUMAN_REQUIRED` marker, or post-run verification (step 5) does not pass.

## Failure and Skip-Dependents Handling

The run is fully autonomous and **never stops on a single epic failure**. When an epic fails or is blocked:

1. **Mark it blocked** in both the TodoWrite list and the meta-epic checklist note, with a short reason (`[!] <epic-id> <title>  (blocked: <reason>)`).
2. **Skip its dependents**: any epic whose `depends_on` (transitively) includes a blocked epic cannot run with its contract satisfied. Mark each such dependent as skipped/blocked with reason `blocked: depends on <failed-epic-id>`. Do this transitively -- a dependent of a dependent is also skipped.
3. **Roll back to the pre-epic commit** before continuing: a failed cook-it run may have made partial per-phase commits AND left staged/unstaged changes. Reset to the commit recorded at epic entry: `git reset --hard "$EPIC_START_SHA" && git clean -fd`. A plain `git reset --hard` (to HEAD) or `git restore .` would keep the failed epic's partial commits in history and push them; resetting to `$EPIC_START_SHA` discards them so only completed epics reach the pushed history. The blocked epic stays status=open and is re-attempted from scratch on a later run. Beads tasks the failed epic created remain under the blocked epic and are not reused. Then run `ca phase-check clean`.
4. **Continue** with the remaining epics that are still independent of the failure. The loop processes every reachable epic.
5. The IV epic depends on all others, so any upstream block will skip it -- record that explicitly in the final report.

Do not retry indefinitely and do not pause for human input mid-run. Record the block and move on. A `HUMAN_REQUIRED` marker from cook-it is treated as a block (the orchestrator does not attempt to satisfy the human request inline).

## Progress Tracking

Progress is **beads-backed**, with the live TodoWrite list as the in-session mirror. Done-state derives from epic status (open -> closed) plus a checklist note on the meta-epic.

Maintain a single checklist note on the meta-epic, rewritten after each epic transition. Format:

```
Orchestration checklist (<meta-epic>):
[ ] <epic-id> <title>
[x] <epic-id> <title>
[!] <epic-id> <title>  (blocked: <reason>)
```

- `[ ]` pending (not yet processed)
- `[x]` done (cook-it succeeded, verify-gates PASS, epic closed)
- `[!]` blocked or skipped, with the reason inline

Update the note via `bd update <meta-epic> --notes="..."` (or the project's note-append convention) after every epic. Keep the TodoWrite list in lockstep so the in-conversation view and the durable beads record never diverge.

## Resume

The run is resumable. On re-entry (e.g., the conversation was interrupted and restarted):

1. Read the meta-epic checklist note and the live epic statuses (`bd show <id> --json`).
2. **Skip already-closed epics** -- a `[x]` line plus status=closed means that epic is done; do not re-run it.
3. Reconstruct the worklist from the remaining `[ ]` and `[!]` epics. Previously-blocked `[!]` epics may now be runnable if their blocker was since resolved (re-check dependencies); otherwise they stay blocked.
4. Rebuild the TodoWrite list from the reconstructed state and continue the sequential loop from the first pending epic.

The checklist note is the authoritative resume record. If it disagrees with epic statuses (e.g., note says `[ ]` but the epic is closed), trust the epic status and reconcile the note.

## Final Report

When the worklist is exhausted (every epic is `[x]` or `[!]`):

1. Run `bd dolt push` to persist beads state to the Dolt remote.
2. `git push` to publish the per-epic commits (cook-it's final phase commits each epic; the orchestrator does not batch commits).
3. Emit ONE consolidated report covering all three outcomes:

```
Live orchestration complete (<meta-epic>)

Completed (<n>):
- <epic-id> <title>
...

Blocked (<n>):
- <epic-id> <title>  -- <reason>
...

Skipped (<n>):
- <epic-id> <title>  -- depends on <failed-epic-id>
...
```

Report blocked and skipped epics with concrete reasons so the human can decide on remediation. Do not silently drop any epic from the report.

## Common Pitfalls

- **Running epics in parallel in the shared tree** -- the cardinal sin. Phase state (`.compound-agent/.ca-phase-state.json`) and git commits collide. Sequential only.
- **Re-implementing the phases** instead of reusing `/compound:cook-it`. Always dispatch cook-it; never hand-roll spec-dev/plan/work/review/compound.
- **Skipping the defensive `ca phase-check clean`** between epics -- stale phase state from the prior epic poisons the next cook-it run.
- **Marking an epic done on cook-it's word alone** -- always confirm via `ca verify-gates <epic-id>` PASS and epic status=closed before writing `[x]`.
- **Running dependents of a failed epic** -- their interface contract is unmet. Skip transitively.
- **Pausing the run on a single failure** -- the run is autonomous; record the block, skip dependents, continue with independent epics.
- **Letting the TodoWrite list and the meta-epic checklist note diverge** -- update both after every epic.
- **Re-running closed epics on resume** -- always skip `[x]` + status=closed epics.
- **Batching commits to the end** -- cook-it commits per epic in its final phase; the orchestrator only does the closing `bd dolt push` + `git push`.
