# Architect Skill — Gotchas

Things to do and not do when running the Architect skill. For loop-specific gotchas, read `loop-launcher/SKILL.md`.

## DO

- **Read `loop-launcher/SKILL.md` before launching any loop.** It has the complete reference for flags, pipeline patterns, monitoring, and critical gotchas.
- **Always launch loops in a screen session.** Never run infinity or polish loops in the foreground. Use `screen -dmS compound-loop-projectname bash pipeline.sh`. This prevents session loss on disconnect.
- **Chain infinity loop + polish loop via pipeline script.** The polish loop is a separate script. Use a pipeline script or `bash .compound-agent/infinity-loop.sh && bash .compound-agent/polish-loop.sh` to chain them.
- **Use comma-separated values for `--epics` and `--reviewers` flags.** The `ca loop` CLI expects comma-separated strings, not space-separated positional arguments.
- **Run from the `go/` directory** (or wherever `go.mod` lives). `ca loop` and `ca polish` won't find the module otherwise.
- **Use `--force` flag** when regenerating loop scripts to overwrite existing ones.
- **Dry-run first** with `LOOP_DRY_RUN=1 bash .compound-agent/infinity-loop.sh` and `POLISH_DRY_RUN=1 bash .compound-agent/polish-loop.sh`. Validates configuration without spawning Claude sessions.
- **Use readable screen session names.** Prefer `compound-loop-projectname` over hashes. Makes `screen -ls` output scannable.
- **Persist session name** to `.beads/loop-session-name` so monitoring commands can find it.
- **Run `bd sync` before launching.** Ensures beads state is synced before autonomous sessions modify it.

## DO NOT

- **Do NOT run `claude -p` without `--dangerously-skip-permissions --verbose` in automated scripts.** Without `--dangerously-skip-permissions`, claude hangs on permission prompts. Without `--verbose`, `--output-format stream-json` silently exits 1. Always include `--dangerously-skip-permissions --permission-mode auto --verbose`.
- **Do NOT use unquoted heredocs (`<<DELIM`) for prompts containing markdown.** Triple backticks are parsed as bash command substitution, spawning a hanging `bash` process. Use `<<'DELIM'` (quoted) and inject variables with `sed`.
- **Do NOT rely on `npx ca` when the locally-built binary is newer.** The polish loop generates inner loop scripts via `ca loop`. If `npx` resolves a stale version, the generated script may lack critical flags. Ensure the local build is on PATH.
- **Do NOT use `--print` with `claude` CLI.** The correct flag is `-p` for headless/print mode.
- **Do NOT specify model with `-m` in `claude` CLI.** Use `--model <model-id>` instead.
- **Do NOT use `gemini --print`.** The correct flag is `gemini -p "prompt"` for non-interactive mode.
- **Do NOT use `codex --print`.** Use `codex exec "prompt"` for non-interactive mode.
- **Do NOT route skill activation on conversation content strings.** This is a prompt injection surface. Route on `{phase, hook_event}` tuples instead.
- **Do NOT use JSONL for telemetry when SQLite is already in the stack.** SQLite avoids a second data store, supports aggregation queries natively, and eliminates log rotation logic.
- **Windows support is available via WSL2 (recommended) and native PowerShell (reference template).** CI runs on Windows. The embedding daemon is Unix-only; Windows falls back to keyword-only search.
- **Do NOT log raw queries in telemetry.** Truncate or hash query fields to prevent sensitive data leakage.
- **Do NOT add telemetry I/O to the stdin read path in hooks.** Instrument at the hook OUTPUT boundary to avoid the 30-second stdin timeout.
- **Do NOT add skill metadata fields without a runtime consumer.** Start with `phase` only.

## Advisory Fleet CLI Flags

| CLI | Non-interactive mode | Model flag | Example |
|-----|---------------------|------------|---------|
| `claude` | `-p "prompt"` | `--model <id>` | `claude -p "Review this spec" --model claude-sonnet-4-6` |
| `gemini` | `-p "prompt"` | `-m <model>` | `gemini -p "Review this spec"` |
| `codex` | `codex exec "prompt"` | (auto) | `codex exec "Review this spec"` |

Stdin piping works for all three: `cat file.md | claude -p "Review this"`.
