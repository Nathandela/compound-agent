# Improve Loop Reference

> Loaded on demand. Read when referenced by SKILL.md.

The improve phase is an optional post-epic stage of the infinity loop (`ca loop --improve`). After all epics complete, it iterates over improvement programs (`improve/*.md`) to refine the codebase through autonomous Claude sessions with git-based rollback safety.

## Configuration Parameters

| Parameter | CLI Flag | Default | Description |
|-----------|----------|---------|-------------|
| Enable | `--improve` | false | Run improvement phase after epics |
| Max iterations | `--improve-max-iters <n>` | 5 | Max iterations per topic |
| Time budget | `--improve-time-budget <s>` | 0 (unlimited) | Total improvement phase time |

## How It Works

1. Discovers topics by scanning `improve/*.md` files
2. For each topic, loops up to `--improve-max-iters` iterations:
   - Creates git checkpoint (tag: `improve/{topic}/iter-{n}/pre`)
   - Builds prompt from the program's markdown content
   - Runs Claude session with the program as instructions
   - Detects output markers: `IMPROVED`, `NO_IMPROVEMENT`, `FAILED`
3. Stops a topic when:
   - `IMPROVED` — commits changes, continues to next iteration
   - `NO_IMPROVEMENT` — reverts, exits after 2 consecutive
   - `FAILED` — reverts and exits immediately
4. Respects global `--improve-time-budget`

## Monitoring

- Live watch: `ca watch --improve`
- Status file: `agent_logs/.loop-status.json`
- Execution log: `agent_logs/loop-execution.jsonl`

## Where to Look

| Task | File |
|------|------|
| Writing effective improvement programs | `program-authoring.md` |
| Starting from templates | `example-programs.md` |
| Diagnosing failures or unexpected behavior | `troubleshooting.md` |
| Infinity loop configuration | `../infinity-loop/README.md` |

## Example

```bash
ca loop --epics E1 E2 E3 \
  --reviewers claude-sonnet claude-opus \
  --improve \
  --improve-max-iters 5 \
  --improve-time-budget 1800 \
  --force
```
