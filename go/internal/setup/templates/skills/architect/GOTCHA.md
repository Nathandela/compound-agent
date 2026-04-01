# Architect Skill — Gotchas

Things to do and not do when running the Architect skill.

## DO

- **Always launch loops in a screen session.** Never run infinity or polish loops in the foreground. Use `screen -dmS compound-loop-projectname bash v3-pipeline.sh`. This prevents session loss on disconnect and allows monitoring via `screen -r`.
- **Chain infinity loop + polish loop via pipeline script.** The polish loop is a separate script, not triggered by the infinity loop. Use `v3-pipeline.sh` or `bash infinity-loop.sh && bash polish-loop.sh` to chain them automatically.
- **Use comma-separated values for `--epics` and `--reviewers` flags.** The `ca loop` CLI expects comma-separated strings, not space-separated positional arguments.
- **Run from the `go/` directory** (or wherever `go.mod` lives). `ca loop` and `ca polish` won't find the module otherwise.
- **Use `--force` flag** when regenerating loop scripts to overwrite existing ones.
- **Dry-run first** with `LOOP_DRY_RUN=1 bash infinity-loop.sh`. Validates configuration and dependency ordering without spawning Claude sessions.
- **Use readable screen session names.** Prefer `compound-loop-projectname` over hashes. Makes `screen -ls` output scannable.
- **Run `bd dolt push` before launching.** Ensures beads state is synced before autonomous sessions modify it.

## DO NOT

- **Do NOT use `--print` with `claude` CLI.** The correct flag is `-p` for headless/print mode.
- **Do NOT specify model with `-m` in `claude` CLI.** Use `--model <model-id>` instead.
- **Do NOT use `gemini --print`.** The correct flag is `gemini -p "prompt"` for non-interactive mode.
- **Do NOT use `codex --print`.** Use `codex exec "prompt"` for non-interactive mode.
- **Do NOT route skill activation on conversation content strings.** This is a prompt injection surface. Route on `{phase, hook_event}` tuples instead.
- **Do NOT use JSONL for telemetry when SQLite is already in the stack.** SQLite avoids a second data store, supports aggregation queries natively, and eliminates log rotation logic.
- **Do NOT add native Windows support without CI.** The advisory fleet (claude, gemini, codex) unanimously flagged this as release-sized with no verification path. Document WSL2 instead.
- **Do NOT log raw queries in telemetry.** Truncate or hash query fields to prevent sensitive data leakage (file paths, code snippets, error traces).
- **Do NOT add telemetry I/O to the stdin read path in hooks.** Instrument at the hook OUTPUT boundary to avoid exceeding the 30-second stdin timeout (STPA critical hazard).
- **Do NOT add skill metadata fields without a runtime consumer.** `when-to-use` and `scope` fields are dead metadata if no skill selector exists to consume them. Start with `phase` only.
- **Do NOT run `claude -p` without `--dangerously-skip-permissions` in automated scripts.** Without this flag, claude will hang waiting for permission prompts that can't be displayed when stdout/stderr are redirected to files. Always include `--dangerously-skip-permissions --permission-mode auto` in any non-interactive claude invocation inside loops.

## Advisory Fleet CLI Flags (Correct Usage)

When spawning external model CLIs for advisory fleet or review phases:

| CLI | Non-interactive mode | Model flag | Example |
|-----|---------------------|------------|---------|
| `claude` | `-p "prompt"` | `--model <id>` | `claude -p "Review this spec" --model claude-sonnet-4-6` |
| `gemini` | `-p "prompt"` | `-m <model>` | `gemini -p "Review this spec"` |
| `codex` | `codex exec "prompt"` | (auto) | `codex exec "Review this spec"` |

Stdin piping works for all three: `cat file.md | claude -p "Review this"`.

## Pipeline Patterns

### Chain infinity + polish (recommended)
```bash
cd go
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

### Generate scripts
```bash
cd go
ca loop --epics "id1,id2,id3" --model "claude-opus-4-6[1m]" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --review-every 1 --max-review-cycles 3 --max-retries 1 --force

ca polish --spec-file "../docs/specs/your-spec.md" \
  --meta-epic "meta-id" --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --cycles 2 --model "claude-opus-4-6[1m]" --force
```

### Monitor
```bash
screen -r compound-loop-projectname   # Attach to session
ca watch                               # Live trace tail
cat agent_logs/.loop-status.json       # Current status
cat agent_logs/loop-execution.jsonl    # Execution history
```

### Dry-run
```bash
LOOP_DRY_RUN=1 bash infinity-loop.sh     # Validate without spawning
POLISH_DRY_RUN=1 bash polish-loop.sh     # Same for polish
```
