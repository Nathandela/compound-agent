---
name: Loop Launcher
description: Reference for configuring, launching, and monitoring infinity loops and polish loops
phase: architect
---

# Loop Launcher

Reference skill for launching and monitoring autonomous loop pipelines. This skill is NOT auto-loaded — it is read on-demand when launching loops.

> **Two launch styles.** This skill documents the **detached `ca loop` / screen loop** -- an autonomous pipeline that runs in a background screen session. There is also an in-conversation **LIVE ORCHESTRATION** alternative documented in `architect/references/live-orchestration.md`, where the architect model itself orchestrates the epics sequentially in the current conversation. Live orchestration does NOT use `ca loop` or a screen session. The two are the mode A / mode B choice at the architect's Phase 5 launch gate.

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
  --reviewers "claude-sonnet,claude-opus,agy,codex" \
  --review-every 1 \
  --max-review-cycles 3 \
  --max-retries 1 \
  --force
# Default backend is bg (claude --bg, subscription-billed). Use --backend p for legacy claude -p.
# Default implementer is claude. Alternative engines (PID-based, in-tree, plain model names):
#   ca loop --implementer codex --model gpt-5.5-codex     # codex exec; auth = ChatGPT login (codex login)
#   ca loop --implementer agy --model gemini-3.1-pro      # agy -p --dangerously-skip-permissions --model; auth = OAuth (no API-key env)
# codex/agy take a PLAIN model name (no provider/ slash); only --implementer goose uses provider/model.
# agy is the Antigravity CLI, the engine that replaces the standalone gemini CLI (sunset 2026-06-18; its usage was removed).
```

### Polish Loop
```bash
ca polish --spec-file "docs/specs/your-spec.md" \
  --meta-epic "meta-epic-id" \
  --reviewers "claude-sonnet,claude-opus,agy,codex" \
  --cycles 2 \
  --model "claude-opus-4-7[1m]" \
  --force
# Default backend is bg. Use --backend p for legacy claude -p.
```

### Flags Reference — Infinity Loop (`ca loop`)

| Flag | Default | Description |
|------|---------|-------------|
| `--epics` | (auto-discover) | Comma-separated epic IDs |
| `--model` | `claude-opus-4-7[1m]` | Model for implementation sessions. Plain name for codex/agy; `provider/model` for goose |
| `--implementer` | `claude` | Implementer engine: `claude` \| `goose` \| `codex` \| `agy`. codex/agy are PID-based, in-tree, plain model names. `agy` is the Antigravity CLI that replaces the standalone gemini CLI (sunset 2026-06-18); the deprecated `gemini` and `antigravity` aliases still resolve to `agy` with a warning |
| `--backend` | `bg` | Execution backend: `bg` (claude --bg, subscription-billed) or `p` (legacy claude -p) |
| `--reviewers` | (none) | Comma-separated: `claude-sonnet,claude-opus,agy,codex` |
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
| `--backend` | `bg` | Execution backend: `bg` (claude --bg, subscription-billed) or `p` (legacy claude -p) |
| `--reviewers` | `claude-sonnet,claude-opus,agy,codex` | Comma-separated audit fleet |
| `-o, --output` | `.compound-agent/polish-loop.sh` | Output script path |
| `--force` | (off) | Overwrite existing script |

### Backend and Environment Precedence

```
Precedence: explicit --backend flag > CA_BACKEND env > default (bg)
```

- `ca loop --backend bg` → hardcodes `CA_BACKEND=bg` (env override ignored)
- `ca loop --backend p` → hardcodes `CA_BACKEND=p` (env override ignored)
- `ca loop` (no flag) → emits `CA_BACKEND=${CA_BACKEND:-bg}` (env override allowed; default bg)
- `CA_BACKEND=p ca loop` (no flag) → uses p at runtime via env override

## Launching

Always launch in a screen session. Never run loops in the foreground.

**Why screen?** Screen provides two things: (1) durability — the orchestrator keeps running if your terminal disconnects; and (2) `ca watch` source — the screen session stdout/stderr is the live data source for `ca watch`. Note that screen wraps the *orchestrator shell*, not Claude itself. With the bg backend, `claude --bg` sessions run as separate jobs and survive regardless of the screen session; the screen session is for the loop's coordination logic.

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
3. **Accept the bypass-permissions disclaimer (bg backend, one-time per machine)**: The default bg backend requires `--dangerously-skip-permissions`. Run `claude --dangerously-skip-permissions` once interactively to accept the disclaimer. This is a one-time step per machine; the generated script's bootstrap preflight detects if it is missing and fails with remediation instructions before the loop starts.
4. Verify all epics are status=open: `bd show <id>` for each
5. Verify `claude` CLI is available and authenticated
6. Verify `bd` CLI is available
7. Sync beads: `bd dolt push`
8. Dry-run infinity loop: `LOOP_DRY_RUN=1 bash .compound-agent/infinity-loop.sh`
9. Dry-run polish loop: `POLISH_DRY_RUN=1 bash .compound-agent/polish-loop.sh`
10. Verify screen is available: `command -v screen`

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
| `.compound-agent/agent_logs/trace_<id>-<ts>.jsonl` | Raw stream-json per session (p backend) | Deep debugging only |
| `.compound-agent/agent_logs/loop_<id>-<ts>.log` | Extracted assistant text per session | Investigating a specific epic |
| `.compound-agent/agent_logs/memory_<id>-<ts>.log` | Memory watchdog readings | Suspecting OOM |
| `.compound-agent/agent_logs/.polish-status.json` | Polish loop cycle/status | During polish loops |
| `.compound-agent/agent_logs/polish-cycle-<N>/` | Per-cycle audit findings and reports | Polish loop review |
| `~/.claude/jobs/<id>/state.json` | bg session state: `.state`, `.output`, `.inFlight` | bg backend — session status |
| `~/.claude/jobs/<id>/` | bg session job dir (transcript at `.linkScanPath`) | bg backend — deep debugging |

**`ca watch` and the bg backend**: `ca watch` follows the symlink at `.compound-agent/agent_logs/.latest` which points to the active trace file. Under the bg backend, the trace file is updated during harvest. For live session progress under bg, use `ca watch` after harvest completes, or inspect `~/.claude/jobs/<id>/state.json` directly.

**Worktree harvest**: with the bg backend, each `claude --bg` session auto-isolates into a git worktree on branch `worktree-<name>`. After the session reaches terminal state, the loop harvests the worktree (merges `worktree-<name>` into the working branch) before cleanup (`claude stop && claude rm`). If harvest fails (e.g., merge conflict), the worktree is RETAINED and the epic is marked `HUMAN_REQUIRED` — the loop never destroys unmerged work.

## Gotchas

### Critical

- **Accept the bypass-permissions disclaimer before the first bg loop run.** Run `claude --dangerously-skip-permissions` once interactively on each machine. The bootstrap preflight in the generated script detects the un-accepted disclaimer and exits non-zero with remediation instructions rather than entering the loop. This is a one-time step per machine.

- **Always include `--dangerously-skip-permissions --permission-mode auto` in non-interactive claude invocations.** Without `--dangerously-skip-permissions`, claude hangs on permission prompts. The `ca loop` generator includes these — if a generated script is missing them, the binary is stale.

- **bg backend worktree isolation**: With the default bg backend, each `claude --bg` session creates a git worktree on branch `worktree-<name>`. All agent commits land there. The loop harvests (merges) the worktree into your working branch before cleanup. If you need the legacy in-tree behavior, use `--backend p` or `CA_BACKEND=p`.

- **Legacy p backend opt-in**: Use `ca loop --backend p` or `ca polish --backend p` to retain the legacy `claude -p` streaming pipeline. The p and bg backends are byte-identical at the epic-framework level (same epic queue, same `EPIC_COMPLETE`/`HUMAN_REQUIRED:`/`EPIC_FAILED` protocol, same retry logic). Switch only the backend if needed; the rest of the script is unchanged.

- **Always use a quoted heredoc (`<<'DELIM'`) for prompt templates containing markdown.** Triple backticks in markdown code blocks are interpreted as bash command substitution in unquoted heredocs (`<<DELIM`). This causes `bash` to spawn and hang silently. Use `<<'DELIM'` and inject variables with `sed` instead.

- **Prefer the local `ca` binary over `npx ca`.** The polish loop generates inner loop scripts via `ca loop`. If `npx` resolves a stale npm-installed version, the generated script may lack critical flags (`--dangerously-skip-permissions`, `--verbose`) and use unquoted heredocs. The current Go CLI already handles all these correctly — ensure the local build is on PATH.

- **Use comma-separated values for `--epics` and `--reviewers`.** Space-separated arguments are interpreted as subcommands and cause parse errors.

### CLI Flags for Advisory/Review Fleet

| CLI | Non-interactive mode | Model flag |
|-----|---------------------|------------|
| `claude` | `-p "prompt"` | `--model <id>` |
| `agy` | `-p "prompt" --dangerously-skip-permissions --print-timeout 1h` | `--model <model>` |
| `codex` | `codex exec "prompt"` | (default model) |

Stdin piping: `cat file.md | claude -p "Review this"`. For `agy`, pass the file as the prompt: `agy -p "$(cat file.md)" --dangerously-skip-permissions --model <model> --print-timeout 1h`.

### Other Gotchas
- Run `ca loop` and `ca polish` from the directory containing `go.mod` (usually `go/`)
- Use `--force` when regenerating scripts to overwrite existing ones
- The polish loop is a separate script — chain via pipeline script, not `&&` in the terminal
- Do not use `agy --print`, `codex --print`, or `claude --print` -- wrong flags (agy uses `-p`)
- Do not use `claude -m sonnet` — use `claude --model claude-sonnet-4-6`

## Windows Users

All sections above assume Unix/macOS. Windows users should read the `references/windows/` directory:

- **`windows-wsl2.md`** — Recommended path. Run loops unmodified inside WSL2 with tmux for session management. Covers both infinity and polish loops.
- **`infinity-loop.ps1`** — Native PowerShell reference template. Static translation of the bash infinity loop for users who cannot use WSL2. Runs in foreground only (no screen/tmux equivalent). See the Known Limitations header in the file for gaps.

The `references/windows/` directory is ONLY relevant for Windows users. Unix/macOS users can ignore it entirely.
