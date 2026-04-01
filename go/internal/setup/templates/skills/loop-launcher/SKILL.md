---
name: Loop Launcher
description: Reference for configuring, launching, and monitoring infinity loops and polish loops
phase: architect
---

# Loop Launcher

Reference skill for launching and monitoring autonomous loop pipelines. This skill is NOT auto-loaded — it is read on-demand when launching loops.

## Authorization Gate

Before launching any loop, you MUST have authorization:
- The user explicitly asked to launch a loop, OR
- You are inside an architect workflow where the user approved Phase 5 (launch), OR
- The user started this session by invoking `/compound:architect` with loop/launch intent

If none of these apply, use `AskUserQuestion` to confirm: "This will launch an autonomous loop with full permissions. Proceed?"

**If the user declines**: Do NOT generate scripts or launch anything. Report the parameters you would have used and stop. The user can invoke `/compound:launch-loop` later.

Do NOT autonomously decide to launch loops.

## Script Generation

### Infinity Loop
```bash
ca loop --epics "id1,id2,id3" \
  --model "claude-opus-4-6[1m]" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --review-every 1 \
  --max-review-cycles 3 \
  --max-retries 1 \
  --force
```

### Polish Loop
```bash
ca polish --spec-file "docs/specs/your-spec.md" \
  --meta-epic "meta-epic-id" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --cycles 2 \
  --model "claude-opus-4-6[1m]" \
  --force
```

### Flags Reference — Infinity Loop (`ca loop`)

| Flag | Default | Description |
|------|---------|-------------|
| `--epics` | (auto-discover) | Comma-separated epic IDs |
| `--model` | `claude-opus-4-6[1m]` | Model for implementation sessions |
| `--reviewers` | (none) | Comma-separated: `claude-sonnet,claude-opus,gemini,codex` |
| `--review-every` | `0` (end-only) | Review after every N epics |
| `--max-review-cycles` | `3` | Max review/fix iterations |
| `--max-retries` | `1` | Retries per epic on failure |
| `--review-blocking` | `false` | Fail loop if review not approved after max cycles |
| `--review-model` | `claude-opus-4-6[1m]` | Model for implementer fix sessions |
| `-o, --output` | `infinity-loop.sh` | Output script path |
| `--force` | (off) | Overwrite existing script |

### Flags Reference — Polish Loop (`ca polish`)

| Flag | Default | Description |
|------|---------|-------------|
| `--meta-epic` | (required) | Parent meta-epic ID for traceability |
| `--spec-file` | (required) | Path to the spec for reviewer context |
| `--cycles` | `3` | Number of polish cycles |
| `--model` | `claude-opus-4-6[1m]` | Model for polish architect sessions |
| `--reviewers` | `claude-sonnet,claude-opus,gemini,codex` | Comma-separated audit fleet |
| `-o, --output` | `polish-loop.sh` | Output script path |
| `--force` | (off) | Overwrite existing script |

## Launching

Always launch in a screen session. Never run loops in the foreground.

### Single loop
```bash
LOOP_SESSION="compound-loop-$(basename "$(pwd)")"
screen -dmS "$LOOP_SESSION" bash infinity-loop.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Chained pipeline (infinity + polish)
```bash
cat > pipeline.sh << 'SCRIPT'
#!/bin/bash
set -e
trap 'echo "[pipeline] FAILED at line $LINENO" >&2' ERR
cd "$(dirname "$0")"
bash infinity-loop.sh
bash polish-loop.sh
SCRIPT
LOOP_SESSION="compound-loop-$(basename "$(pwd)")"
screen -dmS "$LOOP_SESSION" bash pipeline.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Screen session naming
Use readable names: `compound-loop-projectname`, `polish-loop-projectname-cycle2`. Never use hashes.

## Pre-Flight

Before launching:
1. Verify all epics are status=open: `bd show <id>` for each
2. Verify `claude` CLI is available and authenticated
3. Verify `bd` CLI is available
4. Sync beads: `bd dolt push`
5. Dry-run infinity loop: `LOOP_DRY_RUN=1 bash infinity-loop.sh`
6. Dry-run polish loop: `POLISH_DRY_RUN=1 bash polish-loop.sh`
7. Verify screen is available: `command -v screen`

Full pre-flight checklist with monitoring protocol: `architect/references/infinity-loop/pre-flight.md`.

## Monitoring

| Command | What it shows |
|---------|---------------|
| `screen -r "$(cat .beads/loop-session-name)"` | Attach to live session (Ctrl-A D to detach) |
| `ca watch` | Live trace tail from active session |
| `cat agent_logs/.loop-status.json` | Current epic and status |
| `cat agent_logs/loop-execution.jsonl` | Completed epics with durations |
| `ls agent_logs/polish-cycle-*/` | Polish cycle reports and audit findings |
| `screen -S "$(cat .beads/loop-session-name)" -X quit` | Kill the loop |

## Gotchas

### Critical

- **Always include `--dangerously-skip-permissions --permission-mode auto --verbose` in non-interactive claude invocations.** Without `--dangerously-skip-permissions`, claude hangs on permission prompts. Without `--verbose`, `--output-format stream-json` silently exits 1. The `ca loop` generator includes all three — if a generated script is missing them, the binary is stale.

- **Always use a quoted heredoc (`<<'DELIM'`) for prompt templates containing markdown.** Triple backticks in markdown code blocks are interpreted as bash command substitution in unquoted heredocs (`<<DELIM`). This causes `bash` to spawn and hang silently. Use `<<'DELIM'` and inject variables with `sed` instead.

- **Prefer the local `ca` binary over `npx ca`.** The polish loop generates inner loop scripts via `ca loop`. If `npx` resolves a stale npm-installed version, the generated script may lack critical flags (`--dangerously-skip-permissions`, `--verbose`) and use unquoted heredocs. The current Go CLI already handles all these correctly — ensure the local build is on PATH.

- **Use comma-separated values for `--epics` and `--reviewers`.** Space-separated arguments are interpreted as subcommands and cause parse errors.

### CLI Flags for Advisory/Review Fleet

| CLI | Non-interactive mode | Model flag |
|-----|---------------------|------------|
| `claude` | `-p "prompt"` | `--model <id>` |
| `gemini` | `-p "prompt"` | `-m <model>` |
| `codex` | `codex exec "prompt"` | (default model) |

Stdin piping works for all three: `cat file.md | claude -p "Review this"`.

### Other Gotchas
- Run `ca loop` and `ca polish` from the directory containing `go.mod` (usually `go/`)
- Use `--force` when regenerating scripts to overwrite existing ones
- The polish loop is a separate script — chain via pipeline script, not `&&` in the terminal
- Do not use `gemini --print`, `codex --print`, or `claude --print` — wrong flags
- Do not use `claude -m sonnet` — use `claude --model claude-sonnet-4-6`
