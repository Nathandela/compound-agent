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
  --model "claude-opus-4-7[1m]" \
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
  --model "claude-opus-4-7[1m]" \
  --force
```

### Flags Reference — Infinity Loop (`ca loop`)

| Flag | Default | Description |
|------|---------|-------------|
| `--epics` | (auto-discover) | Comma-separated epic IDs |
| `--model` | `claude-opus-4-7[1m]` | Model for implementation sessions |
| `--reviewers` | (none) | Comma-separated: `claude-sonnet,claude-opus,gemini,codex` |
| `--review-every` | `0` (end-only) | Review after every N epics |
| `--max-review-cycles` | `3` | Max review/fix iterations |
| `--max-retries` | `1` | Retries per epic on failure |
| `--review-blocking` | `false` | Fail loop if review not approved after max cycles |
| `--review-model` | `claude-opus-4-7[1m]` | Model for implementer fix sessions |
| `-o, --output` | `.compound-agent/infinity-loop.sh` | Output script path |
| `--force` | (off) | Overwrite existing script |

### Flags Reference — Polish Loop (`ca polish`)

| Flag | Default | Description |
|------|---------|-------------|
| `--meta-epic` | (required) | Parent meta-epic ID for traceability |
| `--spec-file` | (required) | Path to the spec for reviewer context |
| `--cycles` | `3` | Number of polish cycles |
| `--model` | `claude-opus-4-7[1m]` | Model for polish architect sessions |
| `--reviewers` | `claude-sonnet,claude-opus,gemini,codex` | Comma-separated audit fleet |
| `-o, --output` | `.compound-agent/polish-loop.sh` | Output script path |
| `--force` | (off) | Overwrite existing script |

## Launching

Always launch in a screen session. Never run loops in the foreground.

### Single loop
```bash
LOOP_SESSION="compound-loop-$(basename "$(pwd)")"
screen -dmS "$LOOP_SESSION" bash .compound-agent/infinity-loop.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Chained pipeline (infinity + polish)
```bash
cat > pipeline.sh << 'SCRIPT'
#!/bin/bash
set -e
trap 'echo "[pipeline] FAILED at line $LINENO" >&2' ERR
cd "$(dirname "$0")"
bash .compound-agent/infinity-loop.sh
bash .compound-agent/polish-loop.sh
SCRIPT
LOOP_SESSION="compound-loop-$(basename "$(pwd)")"
screen -dmS "$LOOP_SESSION" bash pipeline.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
```

### Screen session naming
Use readable names: `compound-loop-projectname`, `polish-loop-projectname-cycle2`. Never use hashes.

## Pre-Flight

Before launching:
1. **Verify `ca` is the Go binary** (not the old TypeScript CLI): run `ca loop --help` and confirm it shows Cobra-style output (`Usage: ca loop [flags]`). If you see `Usage: ca [options] [command]` (Commander.js format), the binary is stale — reinstall with `npm install compound-agent@latest` or use the local Go build at `go/dist/ca`.
2. Verify `ca polish --help` succeeds (command exists). If it fails, same stale binary issue.
3. Verify all epics are status=open: `bd show <id>` for each
4. Verify `claude` CLI is available and authenticated
5. Verify `bd` CLI is available
6. Sync beads: `bd dolt push`
7. Dry-run infinity loop: `LOOP_DRY_RUN=1 bash .compound-agent/infinity-loop.sh`
8. Dry-run polish loop: `POLISH_DRY_RUN=1 bash .compound-agent/polish-loop.sh`
9. Verify screen is available: `command -v screen`

Full pre-flight checklist with monitoring protocol: `architect/references/infinity-loop/pre-flight.md`.

## Monitoring

### Quick Reference

| Command | What it shows |
|---------|---------------|
| `screen -r "$(cat .beads/loop-session-name)"` | Attach to live session (Ctrl-A D to detach) |
| `ca watch` | Live trace tail from active session |
| `cat .compound-agent/agent_logs/.loop-status.json` | Current epic and status |
| `cat .compound-agent/agent_logs/loop-execution.jsonl` | Completed epics with durations |
| `ls .compound-agent/agent_logs/polish-cycle-*/` | Polish cycle reports and audit findings |
| `screen -S "$(cat .beads/loop-session-name)" -X quit` | Kill the loop |

### Post-Launch Verification

After launching a loop in screen, verify it started by running a background Bash command (`run_in_background: true`):

```bash
# Check 1: status file
sleep 60 && cat .compound-agent/agent_logs/.loop-status.json 2>/dev/null || echo "No status file yet"
# Check 2: screen session
screen -ls 2>/dev/null | grep "$(cat .beads/loop-session-name 2>/dev/null || echo compound-loop)" || echo "No screen session found"
```

When the result comes back: if `.loop-status.json` shows `"status":"running"` and screen lists the session, report success to the user. If not, check for crash details or missing screen session and report the issue.

### Health Check Protocol

When the user asks about loop progress, follow this protocol to build a structured overview.

**Step 1 — Gather data** (use parallel subagents for speed):
- Read `.compound-agent/agent_logs/.loop-status.json` — current epic, attempt number, status
- Read `.compound-agent/agent_logs/loop-execution.jsonl` — all completed epics with result, duration
- Run `bd show <epic-id>` for each epic to get titles and statuses
- Run `git log --oneline -5` to see recent commit activity
- For polish loops: also read `.compound-agent/agent_logs/.polish-status.json` and list `.compound-agent/agent_logs/polish-cycle-*/`

**Step 2 — Detect stalls**:
- If `.loop-status.json` shows `"status":"running"`, check when it was last modified:
  - macOS: `stat -f '%m' .compound-agent/agent_logs/.loop-status.json`
  - Linux: `stat -c '%Y' .compound-agent/agent_logs/.loop-status.json`
- Calculate the delta: `DELTA=$(( $(date +%s) - $(stat -f '%m' .compound-agent/agent_logs/.loop-status.json) ))` (macOS) or `DELTA=$(( $(date +%s) - $(stat -c '%Y' .compound-agent/agent_logs/.loop-status.json) ))` (Linux). If `$DELTA > 300`, proceed with stall check below.
- If last modified > 5 minutes ago: read the last 20 lines of the active trace (`tail -20 ".compound-agent/agent_logs/$(readlink .compound-agent/agent_logs/.latest)"`), wait 15 seconds, read again. If output is identical, flag as potentially stalled.
- If status is `"crashed"`: report crash details (exit code, line number, timestamp) immediately.
- Verify screen session is alive: `screen -ls | grep "$(cat .beads/loop-session-name)"`

**Step 3 — Build the overview**:

Present a structured report like this:

```
[one-line summary: "X of Y epics done, currently working on Z"]

| # | Epic | Status | Duration |
|---|------|--------|----------|
| 1 | Epic title from beads | Closed | ~8 min |
| 2 | Another epic | Running | started HH:MM UTC |
| 3 | Upcoming epic | Open | -- |

[total runtime, average per completed epic, ETA for remaining epics]
[any anomalies: failures, retries, human_required, stalls]
```

**Note on ETA**: The loop does not persist a target epic count. To calculate "X of Y", query `bd list --type=epic --status=open` for remaining epics and count completed entries in `loop-execution.jsonl`. ETAs are rough estimates — epic duration varies with complexity, retries, and memory pressure.

- **Closed epics**: duration from `loop-execution.jsonl` (convert seconds to human-readable)
- **Running epic**: "started HH:MM UTC" from `.loop-status.json` timestamp
- **Open epics**: "--"
- **Pace**: total elapsed, average per epic, rough ETA for remaining
- **Anomalies**: flag failures, retries (attempt > 1), human_required markers, or stalled sessions

### Log File Map

| Path | Content | When to read |
|------|---------|-------------|
| `.compound-agent/agent_logs/.loop-status.json` | Current epic, attempt, status | Always -- primary status |
| `.compound-agent/agent_logs/loop-execution.jsonl` | Completed epics with result, duration | Always -- progress history |
| `.compound-agent/agent_logs/.latest` | Symlink to active trace file | Stall detection |
| `.compound-agent/agent_logs/trace_<id>-<ts>.jsonl` | Raw stream-json per session | Deep debugging only |
| `.compound-agent/agent_logs/loop_<id>-<ts>.log` | Extracted assistant text per session | Investigating a specific epic |
| `.compound-agent/agent_logs/memory_<id>-<ts>.log` | Memory watchdog readings | Suspecting OOM |
| `.compound-agent/agent_logs/.polish-status.json` | Polish loop cycle/status | During polish loops |
| `.compound-agent/agent_logs/polish-cycle-<N>/` | Per-cycle audit findings and reports | Polish loop review |

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

## Windows Users

All sections above assume Unix/macOS. Windows users should read the `references/windows/` directory:

- **`windows-wsl2.md`** — Recommended path. Run loops unmodified inside WSL2 with tmux for session management. Covers both infinity and polish loops.
- **`infinity-loop.ps1`** — Native PowerShell reference template. Static translation of the bash infinity loop for users who cannot use WSL2. Runs in foreground only (no screen/tmux equivalent). See the Known Limitations header in the file for gaps.

The `references/windows/` directory is ONLY relevant for Windows users. Unix/macOS users can ignore it entirely.
