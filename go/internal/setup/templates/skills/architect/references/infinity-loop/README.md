# Infinity Loop Reference

> Loaded on demand. Read when referenced by SKILL.md.

The infinity loop (`ca loop`) generates a standalone bash script that autonomously processes beads epics via Claude Code sessions. Each epic runs through a full `/compound:cook-it from plan` cycle. The loop handles retries, dependency ordering, memory safety, and optional multi-model review. The architect skill's Phase 5 configures and launches this loop on materialized epics.

## Configuration Parameters

| Parameter | CLI Flag | Default | Description |
|-----------|----------|---------|-------------|
| Epic IDs | `--epics <ids>` | auto-discover | Comma-separated epic IDs to process |
| Model | `--model <model>` | claude-opus-4-7[1m] | Claude model for sessions |
| Max retries | `--max-retries <n>` | 1 | Retries per epic on failure |
| Output | `-o, --output <path>` | .compound-agent/infinity-loop.sh | Script output path |
| Force | `--force` | false | Overwrite existing script |
| Reviewers | `--reviewers <names>` | none | Comma-separated: claude-sonnet,claude-opus,gemini,codex |
| Review cadence | `--review-every <n>` | 0 (end-only) | Review every N completed epics |
| Review cycles | `--max-review-cycles <n>` | 3 | Max review/fix iterations |
| Review blocking | `--review-blocking` | false | Fail loop if review not approved |
| Review model | `--review-model <model>` | claude-opus-4-7[1m] | Model for fix sessions |
| Compact threshold | `--compact-pct <0-100>` | 0 (Claude default) | Context auto-compaction % (suggested: 50 for 1M context) |

## Where to Look

Use this decision tree to find the right reference file:

| Symptom / Task | File |
|----------------|------|
| Stale session hangs, output inactivity | `memory-safety.md` (Layer 4) |
| Setting up and launching the loop | `pre-flight.md` |
| Memory issues, OOM, watchdog kills | `memory-safety.md` |
| Epics skipped, stuck, wrong order | `epic-ordering.md` |
| Empty logs, missing markers, silent sessions | `logging.md` |
| Reviewer fleet issues, 1-byte output, broken reviews | `review-fleet.md` |
| Any failure you can't diagnose | `troubleshooting.md` |

## Examples

### Minimal (auto-discover epics, no review)
```bash
ca loop --force
LOOP_DRY_RUN=1 .compound-agent/infinity-loop.sh
LOOP_SESSION="compound-loop-$(basename "$PWD")"
screen -dmS "$LOOP_SESSION" .compound-agent/infinity-loop.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Full review fleet
```bash
ca loop --epics "E1,E2,E3" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --max-review-cycles 3 \
  --review-blocking \
  --force
```

### Conservative (review every 2 epics, blocking)
```bash
ca loop --epics "E1,E2,E3,E4" \
  --reviewers "claude-sonnet,gemini" \
  --review-every 2 \
  --review-blocking \
  --max-retries 2 \
  --force
```
