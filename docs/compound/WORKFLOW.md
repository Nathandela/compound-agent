---
version: "1.7.4"
last-updated: "2026-03-11"
summary: "The 5-phase compound-agent workflow and cook-it orchestrator"
---

# Workflow

Every feature or epic follows five phases. The `/compound:cook-it` skill chains them with enforcement gates.

---

## Phase 1: Spec Dev

Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams.

- Ask "why" before "how" -- understand the real need
- Search memory for past features, constraints, decisions
- Use EARS notation for clear, testable requirements
- Create a beads epic: `bd create --title="..." --type=epic`
- Write the spec to a FILE at `docs/specs/<epic-id>-<slug>.md` -- this file is the single source of truth, including an empty `## Amendments` section
- Set the epic description to a pointer stub (a one-line summary plus `Spec: docs/specs/<epic-id>-<slug>.md`), not the full spec

## Phase 2: Plan

Decompose work into small, testable tasks with dependencies.

- Review spec-dev output (resolve the `Spec:` pointer and read the spec file)
- Append an `## Acceptance Criteria` table derived from the EARS requirements to the spec file, inserted just before `## Amendments`
- Append a `## Verification Contract` (profile, touched surfaces, principal risks, required evidence) to the spec file, also before `## Amendments` -- this is the per-epic definition of done
- Create beads tasks: `bd create --title="..." --type=task`
- Create Review and Compound blocking tasks (these survive compaction)

## Phase 3: Work

Execute implementation through agent teams using TDD.

- Pick tasks from `bd ready`
- Resolve the spec file from the epic's `Spec:` pointer and read its Acceptance Criteria and Verification Contract before implementation (legacy fallback: read the spec from the epic description if no pointer exists)
- Delegate to test-writer and implementer agents
- Commit incrementally as tests pass
- Run `/implementation-reviewer` before closing tasks

## Phase 4: Review

Multi-agent code review with severity classification.

- Run quality gates: `cd go && go test ./... && golangci-lint run ./...`
- Spawn specialized reviewers (security, architecture, performance, etc.)
- Verify every Acceptance Criteria row and Verification Contract evidence item against the spec file (legacy fallback to the epic description)
- If review strengthens the contract, append the new evidence to the spec file's `## Verification Contract` and log the escalation under its `## Amendments` section
- Classify findings as P0 (blocks merge) / P1/P2/P3
- Fix all P0/P1 findings before proceeding

## Phase 5: Compound

Extract and store lessons learned. This is what makes the system compound.

- Analyze what happened during the cycle
- Capture lessons via `ca learn`
- Cluster patterns via `ca compound`
- Detect spec drift against the spec file; if reconciliation updates it, log the change under its `## Amendments` section
- Update outdated docs and ADRs

---

## Cook-it orchestrator

`/compound:cook-it` chains all 5 phases with enforcement gates.

### Invocation

```
/compound:cook-it <epic-id>
/compound:cook-it <epic-id> from plan
```

### Phase execution protocol

For each phase, cook-it:

1. Announces progress: `[Phase N/5] PHASE_NAME`
2. Initializes state: `ca phase-check start <phase>`
3. Reads the phase skill file (non-negotiable -- never from memory)
4. Runs `ca search` with the current goal
5. Executes the phase following skill instructions
6. Updates epic notes: `bd update <epic-id> --notes="Phase: NAME COMPLETE | Next: NEXT"`
7. Verifies the phase gate before proceeding

### Phase gates

| Gate | When | Verification |
|------|------|-------------|
| Post-plan | After Plan | `bd list --status=open` shows Review + Compound tasks, and the resolved spec file (`docs/specs/<epic-id>-<slug>.md`, legacy fallback: epic description) contains both `## Acceptance Criteria` and `## Verification Contract` |
| Gate 3 | After Work | `bd list --status=in_progress` returns empty |
| Gate 4 | After Review | `/implementation-reviewer` returned APPROVED |
| Final | After Compound | `ca verify-gates <epic-id>` passes, `go test ./...` and `golangci-lint run` pass |

If any gate fails, cook-it stops. You must fix the issue before proceeding.

### Resumption

If interrupted, cook-it can resume:

1. Run `bd show <epic-id>` and read the notes for phase state
2. Re-invoke with `from <phase>` to skip completed phases

### Phase state tracking

Cook-it persists state in `.compound-agent/.ca-phase-state.json`. Useful commands:

```bash
ca phase-check status      # See current phase state
ca phase-check clean       # Reset phase state (escape hatch)
```

### Session close

Before saying "done", cook-it runs this inviolable checklist:

```bash
git status
git add <files>
bd sync
git commit -m "..."
bd sync
git push
```

---

## Implementation: launch

When the epic graph is planned, the architect's Launch gate offers two ways to drive the build to completion. Both are autonomous; pick by how you want to watch it.

### Mode A: Detached infinity loop

An autonomous loop runs in a background `screen` session, then you disconnect. Choose this for long unattended runs.

```bash
LOOP_SESSION="compound-loop-$(basename "$(pwd)")"
screen -dmS "$LOOP_SESSION" bash .compound-agent/infinity-loop.sh
```

The loop drives ready epics through the full pipeline. It can run any of four implementers:

```bash
ca loop --implementer claude   # default
ca loop --implementer goose
ca loop --implementer codex
ca loop --implementer gemini
```

Monitor it via the status and trace files under `.compound-agent/agent_logs/` (`.loop-status.json`, `loop-execution.jsonl`) or follow the live trace with `ca watch`.

### Mode B: Live orchestration

The architect stays in-session and drives each epic to completion itself, sequentially in dependency order (never in parallel -- the shared phase-state file and working tree would collide). Each epic runs end-to-end via `/compound:cook-it <epic-id>`; on any failure or `HUMAN_REQUIRED` marker, the epic is marked blocked, its dependents are skipped, and the run continues. Choose this for an in-session, observable run. This mode does NOT use `ca loop` or a screen session.

Progress is beads-backed in a meta-epic checklist note, so the run is resumable: on re-entry, already-closed epics (`[x]` plus status=closed) are skipped.
