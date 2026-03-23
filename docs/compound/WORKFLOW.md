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

## Phase 2: Plan

Decompose work into small, testable tasks with dependencies.

- Review spec-dev output
- Create beads tasks: `bd create --title="..." --type=task`
- Create Review and Compound blocking tasks (these survive compaction)

## Phase 3: Work

Execute implementation through agent teams using TDD.

- Pick tasks from `bd ready`
- Delegate to test-writer and implementer agents
- Commit incrementally as tests pass
- Run `/implementation-reviewer` before closing tasks

## Phase 4: Review

Multi-agent code review with severity classification.

- Run quality gates: `pnpm test && pnpm lint`
- Spawn specialized reviewers (security, architecture, performance, etc.)
- Classify findings as P0 (blocks merge) / P1/P2/P3
- Fix all P0/P1 findings before proceeding

## Phase 5: Compound

Extract and store lessons learned. This is what makes the system compound.

- Analyze what happened during the cycle
- Capture lessons via `ca learn`
- Cluster patterns via `ca compound`
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
| Post-plan | After Plan | `bd list --status=open` shows Review + Compound tasks |
| Gate 3 | After Work | `bd list --status=in_progress` returns empty |
| Gate 4 | After Review | `/implementation-reviewer` returned APPROVED |
| Final | After Compound | `ca verify-gates <epic-id>` passes, `pnpm test` and `pnpm lint` pass |

If any gate fails, cook-it stops. You must fix the issue before proceeding.

### Resumption

If interrupted, cook-it can resume:

1. Run `bd show <epic-id>` and read the notes for phase state
2. Re-invoke with `from <phase>` to skip completed phases

### Phase state tracking

Cook-it persists state in `.claude/.ca-phase-state.json`. Useful commands:

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
