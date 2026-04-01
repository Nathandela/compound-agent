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

### Flags Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--epics` | (required) | Comma-separated epic IDs |
| `--model` | `claude-opus-4-6[1m]` | Model for implementation sessions |
| `--reviewers` | (none) | Comma-separated: `claude-sonnet,claude-opus,gemini,codex` |
| `--review-every` | `0` (end-only) | Review after every N epics |
| `--max-review-cycles` | `3` | Max review/fix iterations |
| `--max-retries` | `1` | Retries per epic on failure |
| `--force` | (off) | Overwrite existing script |
| `--cycles` | (required for polish) | Number of polish cycles |
| `--spec-file` | (required for polish) | Path to the spec for reviewer context |

## Launching

Always launch in a screen session. Never run loops in the foreground.

### Single loop
```bash
screen -dmS compound-loop-$(basename $(pwd)) bash infinity-loop.sh
```

### Chained pipeline (infinity + polish)
```bash
cat > v3-pipeline.sh << 'SCRIPT'
#!/bin/bash
set -e
trap 'echo "[pipeline] FAILED at line $LINENO" >&2' ERR
cd "$(dirname "$0")"
bash infinity-loop.sh
bash polish-loop.sh
SCRIPT
screen -dmS compound-loop-$(basename $(pwd)) bash v3-pipeline.sh
```

### Screen session naming
Use readable names: `compound-loop-projectname`, `polish-loop-projectname-cycle2`. Never use hashes.

## Pre-Flight

Before launching:
1. Verify all epics are status=open: `bd show <id>` for each
2. Sync beads: `bd dolt push`
3. Dry-run: `LOOP_DRY_RUN=1 bash infinity-loop.sh`
4. Verify screen is available: `command -v screen`

## Monitoring

| Command | What it shows |
|---------|---------------|
| `screen -r compound-loop-projectname` | Attach to live session |
| `ca watch` | Live trace tail |
| `cat agent_logs/.loop-status.json` | Current epic and status |
| `cat agent_logs/loop-execution.jsonl` | Completed epics with durations |
| `ls agent_logs/polish-cycle-*/` | Polish cycle reports |

## Gotchas

### Critical
- **Always include `--dangerously-skip-permissions --permission-mode auto --verbose` in non-interactive claude invocations.** Without `--dangerously-skip-permissions`, claude hangs waiting for permission prompts. Without `--verbose`, `--output-format stream-json` silently fails with exit code 1. The `ca loop` generator should include all three automatically — if a generated script is missing them, this is a bug.
- **Always use a quoted heredoc (`<<'DELIM'`) for prompt templates containing markdown.** Triple backticks in markdown code blocks are interpreted as bash command substitution in unquoted heredocs (`<<DELIM`). This causes `bash` to spawn and hang silently. Use `<<'DELIM'` and inject variables with `sed` instead.
- **Never use `npx ca` when the locally-built binary is newer.** The polish loop calls `npx ca loop` to generate inner loop scripts, but `npx` resolves the npm-installed version which may be outdated. Stale templates produce scripts with missing flags and unescaped heredocs. Build and use the local binary directly.
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
- The polish loop is a separate script, not triggered by the infinity loop — chain them via pipeline script
- Do not use `gemini --print`, `codex --print`, or `claude --print` — these are wrong flags
- Do not use `claude -m sonnet` — use `claude --model claude-sonnet-4-6`
