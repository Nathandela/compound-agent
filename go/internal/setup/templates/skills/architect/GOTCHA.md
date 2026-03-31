# Architect Skill — Gotchas

Things to do and not do when running the Architect skill.

## DO

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
