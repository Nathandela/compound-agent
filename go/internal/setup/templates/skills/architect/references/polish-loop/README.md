# Polish Loop Reference

The polish loop iterates N cycles of quality refinement after the infinity loop completes. Each cycle: audit fleet evaluates the full implementation against the build-great-things quality bar, a mini-architect decomposes findings into improvement epics, and an inner infinity loop implements them.

## Parameters

| Parameter | CLI Flag | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| Cycles | `--cycles <N>` | Yes | (none) | Exact number of polish cycles to run |
| Meta-epic | `--meta-epic <id>` | Yes | (none) | Parent meta-epic ID |
| Spec file | `--spec <path>` | Yes | (none) | Path to system spec for reviewer context |
| Reviewers | `--reviewers <names...>` | Yes | (none) | Comma-separated: claude-opus, claude-sonnet, gemini, codex |
| Model | `--model <model>` | No | claude-opus-4-6[1m] | Model for mini-architect and inner loop |
| Output | `-o, --output <path>` | No | polish-loop.sh | Generated script path |
| Force | `--force` | No | false | Overwrite existing script |

## Cycle Structure

Each of the N cycles runs exactly three steps:

### Step 1: Audit

All configured reviewers evaluate the full implementation in parallel. Each reviewer receives:
- The build-great-things pre-ship checklist (34 quality items + 12 laziness anti-patterns)
- The system spec for context
- The current cycle number

Reviewers produce structured reports with P0/P1/P2 severity findings. Reports are collected into `agent_logs/polish-cycle-<N>/`.

### Step 2: Mini-Architect

A Claude Opus[1M] session reads the synthesized audit report and:
1. Groups related findings into improvement epics (2-5 per cycle)
2. Creates beads via `bd create`
3. Wires dependencies via `bd dep add`

The mini-architect outputs `POLISH_EPIC: <id>` markers for each created epic.

### Step 3: Inner Loop

A fresh `ca loop` script is generated and executed for the improvement epics. This reuses the full cook-it pipeline (plan, work, review, compound) for each epic.

## Loop Behavior

- The loop runs exactly N times. No early exit.
- If the mini-architect creates no epics in a cycle, the inner loop is a no-op and the next cycle's audit evaluates the current state.
- `git push` runs after all cycles complete.

## Reviewer CLI Flags

| Reviewer | CLI | Flags |
|----------|-----|-------|
| claude-opus | claude | `--model claude-opus-4-6 --dangerously-skip-permissions --output-format text` |
| claude-sonnet | claude | `--model claude-sonnet-4-6 --dangerously-skip-permissions --output-format text` |
| gemini | gemini | `--yolo` |
| codex | codex | `exec --full-auto -o <report>` |

## Observability

| File | Content |
|------|---------|
| `agent_logs/.polish-status.json` | Current cycle and status |
| `agent_logs/polish-cycle-<N>/` | Per-cycle audit reports, architect logs |
| `agent_logs/polish-cycle-<N>/<reviewer>-report.md` | Individual reviewer reports |
| `agent_logs/polish-cycle-<N>/mini-architect.log` | Architect session output |
| `agent_logs/polish-cycle-<N>/inner-loop.sh` | Generated inner loop script |
| `docs/specs/polish-report-cycle-<N>.md` | Synthesized polish report |

## Dry Run

```bash
POLISH_DRY_RUN=1 ./polish-loop.sh
```

Validates configuration, prints what would happen, but does not spawn any sessions.

## Graceful Degradation

- If a reviewer CLI is unavailable, it is skipped with a warning.
- If no reviewer CLIs are available, the script exits with an error.
- If the inner loop exits non-zero, the polish loop logs a warning and continues to the next cycle.
- On crash, the EXIT trap writes status to `.polish-status.json`.
