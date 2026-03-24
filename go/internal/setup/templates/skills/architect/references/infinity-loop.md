# Infinity Loop Reference Guide

## Overview

The infinity loop (`ca loop`) generates a standalone bash script that autonomously processes beads epics via Claude Code sessions. The architect skill's Phase 5 configures and launches this loop on the materialized epics.

Each epic runs through a full `/compound:cook-it from plan` cycle. The loop handles retries, dependency ordering, memory safety, and optional multi-model review.

---

## Configuration Parameters

| Parameter | CLI Flag | Default | Description |
|-----------|----------|---------|-------------|
| Epic IDs | `--epics <ids...>` | auto-discover | Specific epics to process |
| Model | `--model <model>` | claude-opus-4-6[1m] | Claude model for sessions |
| Max retries | `--max-retries <n>` | 1 | Retries per epic on failure |
| Output | `-o, --output <path>` | ./infinity-loop.sh | Script output path |
| Force | `--force` | false | Overwrite existing script |
| Reviewers | `--reviewers <names...>` | none | Review fleet: claude-sonnet, claude-opus, gemini, codex |
| Review cadence | `--review-every <n>` | 0 (end-only) | Review every N completed epics |
| Review cycles | `--max-review-cycles <n>` | 3 | Max review/fix iterations |
| Review blocking | `--review-blocking` | false | Fail loop if review not approved |
| Review model | `--review-model <model>` | claude-opus-4-6[1m] | Model for fix sessions |
| Improve | `--improve` | false | Run improvement phase after epics |
| Improve iters | `--improve-max-iters <n>` | 5 | Max iterations per topic |
| Improve budget | `--improve-time-budget <s>` | 0 (unlimited) | Total improvement time budget |

---

## Pre-flight Checklist

Before launching, verify:
- [ ] All epic beads exist and are status=open (`bd show <id> --json` for each)
- [ ] Dependencies wired correctly (`bd show <id> --json` shows depends_on)
- [ ] `claude` CLI available and authenticated
- [ ] `bd` CLI available
- [ ] `screen` available (`command -v screen`)
- [ ] Sufficient disk space for agent_logs/

---

## Launch Commands

### Generate script
```bash
ca loop --epics E1 E2 E3 \
  --reviewers claude-sonnet claude-opus gemini codex \
  --max-retries 1 \
  --max-review-cycles 3 \
  --force
```

### Dry-run (preview without executing Claude sessions)
```bash
LOOP_DRY_RUN=1 ./infinity-loop.sh
```

### Launch in background
```bash
screen -dmS compound-loop ./infinity-loop.sh
```

### Verify launch
```bash
screen -ls | grep compound-loop
```

---

## Monitoring Guide

### Real-time watch
```bash
ca watch                    # Live trace from active session
ca watch --epic <id>        # Watch specific epic
ca watch --improve          # Watch improvement phase
ca watch --no-follow        # Print current trace and exit
```

### Status files

| File | Content |
|------|---------|
| `agent_logs/.loop-status.json` | Current loop state (epic, attempt, status) |
| `agent_logs/loop-execution.jsonl` | Completed epic results with timing |
| `agent_logs/loop_*.log` | Per-session extracted text log |
| `agent_logs/trace_*.jsonl` | Per-session raw stream-json trace |

### Screen session
```bash
screen -r compound-loop         # Attach to running loop
# Ctrl-A D                      # Detach without stopping
screen -S compound-loop -X quit # Kill the loop
```

### Health checks
```bash
# Is the loop still running?
screen -ls | grep compound-loop

# Current status
cat agent_logs/.loop-status.json

# How many epics completed?
wc -l agent_logs/loop-execution.jsonl

# Any failures?
grep '"result":"failed"' agent_logs/loop-execution.jsonl
```

---

## 30-Minute Probe Protocol

Passive monitoring checks to run periodically:

1. **Progress check**: Is `.loop-status.json` advancing? Same epic_id for >30 minutes suggests a stuck session.
2. **Failure scan**: `grep failed agent_logs/loop-execution.jsonl` -- any new failures since last check?
3. **Git activity**: `git log --oneline -5` -- are commits being produced? Healthy loop commits per epic.
4. **Disk usage**: `du -sh agent_logs/` -- trace files can grow large.
5. **Process health**: `screen -ls` -- is the screen session still alive?

**Warning signs**:
- No progress for >30 minutes (stuck)
- Multiple consecutive failures on the same epic
- Disk usage growing rapidly without new commits
- Screen session disappeared (crash -- check `.loop-status.json` for crash details)

---

## Examples

### Minimal (auto-discover epics, no review)
```bash
ca loop --force
LOOP_DRY_RUN=1 ./infinity-loop.sh
screen -dmS compound-loop ./infinity-loop.sh
```

### Full review fleet with improvement phase
```bash
ca loop --epics E1 E2 E3 \
  --reviewers claude-sonnet claude-opus gemini codex \
  --max-review-cycles 3 \
  --review-blocking \
  --improve \
  --improve-max-iters 5 \
  --force
```

### Conservative (review every 2 epics, blocking)
```bash
ca loop --epics E1 E2 E3 E4 \
  --reviewers claude-sonnet gemini \
  --review-every 2 \
  --review-blocking \
  --max-retries 2 \
  --force
```

### Real-world: 6 epics with full review fleet (compound-agent project)

This configuration was used to implement a multi-epic feature in the compound-agent project itself (Go CLI migration, 6 dependent epics):

```bash
ca loop \
  --epics learning_agent-j5l learning_agent-w37q learning_agent-ko94 \
         learning_agent-xhbr learning_agent-w0tg learning_agent-2zzc \
  --model "claude-opus-4-6[1m]" \
  --max-retries 2 \
  --reviewers claude-sonnet claude-opus gemini codex \
  --review-every 1 \
  --max-review-cycles 3 \
  --review-model "claude-opus-4-6[1m]" \
  --force
```

**Configuration rationale:**
- `--max-retries 2`: Allows two retry attempts per epic before marking as failed
- `--review-every 1`: Reviews after every completed epic (aggressive; use `--review-every 2` for faster throughput)
- `--model claude-opus-4-6[1m]`: The 1M context variant handles large epics without truncation
- `--reviewers claude-sonnet claude-opus gemini codex`: Full fleet for comprehensive coverage (gemini/codex may be unavailable -- the loop auto-detects and skips them)

**What actually happened:**
- Epics E1-E4 completed successfully; E2 triggered 3 review cycles before approval
- Gemini and Codex failed health checks (CLI not installed) -- logged as warnings, review continued with Claude models only
- Memory watchdog triggered once during E2 (killed session at 12% free memory), retry succeeded
- Total runtime: ~3 hours for 4 completed epics

---

## Troubleshooting

Field-tested failure modes observed in production loop runs, with symptoms, root causes, and fixes.

### Uncommitted changes after loop exit

**Symptom**: `git status` shows modified/untracked files after loop finishes. Work appears done but isn't committed.

**Root cause**: The agent session completed its work and output `EPIC_COMPLETE`, but the commit/push step inside the session failed silently (e.g., hook rejection, merge conflict).

**Fix**: The loop now auto-checks `git diff --quiet` after each epic completion and runs `git add -A && git commit` if dirty. Additionally, the loop pushes to remote at exit. If you still see uncommitted changes, run:
```bash
git status --short
git add -A && git commit -m "chore: post-loop cleanup"
git push
```

### Reviews skipped for some epics

**Symptom**: With `--review-every 1`, some epics get reviewed but others don't. Logs show "No commits in range ... skipping review phase."

**Root cause**: The review phase checks `git log --oneline "$REVIEW_DIFF_RANGE"` and skips if zero commits exist in the range. This happens when the reviewed code was already committed before the diff range started (e.g., the implementer committed during a prior review fix cycle, advancing HEAD past the range).

**Fix**: This is usually benign -- the code was already reviewed in a previous cycle. Check the review logs in `agent_logs/reviews/` to verify. If you need every epic reviewed independently, consider `--review-every 1` with `--review-blocking`.

### Reviewer fleet underutilized

**Symptom**: Configured 4 reviewers but logs show only Claude models were used.

**Root cause**: Gemini/Codex CLIs not installed or not authenticated. The `detect_reviewers()` function logs per-reviewer warnings and a summary of configured vs available reviewers.

**Diagnosis**:
```bash
grep "configured but unavailable" agent_logs/loop_*.log
grep "Configured reviewers:" agent_logs/loop_*.log
grep "Available reviewers:" agent_logs/loop_*.log
```

**Fix**: Install and authenticate the missing CLIs, or remove them from `--reviewers` to avoid noise.

### extract_text produces empty logs

**Symptom**: `agent_logs/loop_*.log` files are empty but `agent_logs/trace_*.jsonl` files have content. Warning in loop output: "Macro log is empty but trace has content."

**Root cause**: The `extract_text` jq parser failed (jq not installed, or Claude's stream-json format changed). The loop falls back to trace-file marker detection (unanchored grep), which is less reliable.

**Diagnosis**: Check if jq is available: `command -v jq`. If not, install it or ensure python3 is available (used as fallback).

**Fix**: The loop now has both jq and python3 extraction paths. If both fail, markers are still detected via the fallback grep in the raw trace file.

### Memory watchdog kills sessions

**Symptom**: Logs show "WATCHDOG: memory X% < 15%, killing PID". Session marked as failed.

**Root cause**: The Claude session (or spawned test processes) consumed too much memory. The watchdog killed the session to prevent system freeze.

**Fix**: Tune the thresholds via environment variables:
```bash
WATCHDOG_THRESHOLD=10 WATCHDOG_INTERVAL=60 ./infinity-loop.sh  # More lenient
```
Or kill memory-hungry background processes before running:
```bash
pkill -f vitest; pkill -f "node.*test"
```

### No git push at loop end

**Symptom**: Loop completed but changes aren't on remote.

**Root cause**: In older versions of the generated script, `git push` was not included. The loop now pushes at exit, but SSH/auth failures are non-fatal (logged as warnings).

**Diagnosis**: `grep "git push" agent_logs/loop_*.log`

**Fix**: Push manually: `git push`. If SSH fails, check authentication: `ssh -T git@github.com`.

---

## Implementation Deep Dive

The generated `infinity-loop.sh` is a self-contained bash script. Below are the key implementation patterns that make it production-grade. Use this as a reference when customizing the generated script or building your own loop.

### 1. Crash Handler

The script installs an EXIT trap that logs crash details to the status file, so you can diagnose why the loop died even if no one was watching.

```bash
set -euo pipefail

_loop_cleanup() {
  local exit_code=$?
  stop_memory_watchdog 2>/dev/null || true
  if [ $exit_code -ne 0 ]; then
    log "CRASH: Script exited with code $exit_code at line ${BASH_LINENO[0]:-unknown}"
    echo "{\"status\":\"crashed\",\"exit_code\":$exit_code,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"line\":\"${BASH_LINENO[0]:-unknown}\"}" \
      > "${LOG_DIR:-.}/.loop-status.json" 2>/dev/null || true
  fi
}
trap _loop_cleanup EXIT
```

### 2. Memory Management (3-Layer Defense)

Long-running loops can exhaust system memory through zombie test processes or large Claude sessions. The script uses three layers of protection:

**Layer 1 -- Orphan Cleanup** between sessions. Kills leftover test/build processes scoped to the current repo directory (avoids killing unrelated processes). Adapt the `pgrep` pattern to your stack (shown: Node/vitest; for Go use `go.test`; for Python use `pytest`; for Rust use `cargo.test`):

```bash
cleanup_orphans() {
  local killed=0
  local repo_dir
  repo_dir=$(pwd)
  # Adapt pattern to your stack: "vitest|node.*\.test\." | "go\.test" | "pytest" | "cargo.test"
  local proc_pattern="${ORPHAN_PROC_PATTERN:-vitest|node.*\.test\.|go\.test|pytest|cargo\.test}"
  for pid in $(pgrep -f "$proc_pattern" 2>/dev/null || true); do
    local proc_cwd=""
    if [ "$(uname)" = "Darwin" ]; then
      proc_cwd=$(lsof -p "$pid" -Fn 2>/dev/null | grep '^ncwd' | sed 's/^n//' || true)
    else
      proc_cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
    fi
    case "$proc_cwd" in
      "$repo_dir"|"$repo_dir"/*) kill "$pid" 2>/dev/null && killed=$((killed + 1)) ;;
    esac
  done
  [ "$killed" -gt 0 ] && log "Cleaned up $killed orphan test processes" && sleep 2
}
```

**Layer 2 -- Pre-session Memory Gate**. Before each epic, check free memory and abort the loop if below threshold:

```bash
get_memory_pct() {
  if [ "$(uname)" = "Darwin" ]; then
    memory_pressure 2>/dev/null | awk -F: '/free percentage/ {gsub(/%| /,"",$2); print $2}'
  else
    local mem_total mem_available
    mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    mem_available=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    [ "$mem_total" -gt 0 ] && echo $(( mem_available * 100 / mem_total ))
  fi
}

check_memory() {
  local free_pct
  free_pct=$(get_memory_pct)
  [ -z "$free_pct" ] && return 0  # Can't measure, assume OK
  if [ "$free_pct" -lt "$MIN_FREE_MEMORY_PCT" ]; then
    log "WARN: System memory ${free_pct}% free (minimum: ${MIN_FREE_MEMORY_PCT}%)"
    return 1
  fi
  return 0
}
```

**Layer 3 -- Memory Watchdog**. A background process monitors free memory during a Claude session and kills it if memory drops below a critical threshold:

```bash
WATCHDOG_PID=""

start_memory_watchdog() {
  local target_pid="$1" mem_log="$2"
  (
    while kill -0 "$target_pid" 2>/dev/null; do
      local pct
      pct=$(get_memory_pct)
      if [ -n "$pct" ]; then
        echo "[$(date '+%Y-%m-%d_%H-%M-%S')] memory_free=${pct}%" >> "$mem_log"
        if [ "$pct" -lt "$WATCHDOG_THRESHOLD" ]; then
          echo "[$(date '+%Y-%m-%d_%H-%M-%S')] WATCHDOG: killing PID $target_pid" >> "$mem_log"
          kill -TERM -- -"$target_pid" 2>/dev/null || kill "$target_pid" 2>/dev/null || true
          exit 0
        fi
      fi
      sleep "$WATCHDOG_INTERVAL"
    done
  ) &
  WATCHDOG_PID=$!
}
```

Environment variables for tuning:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MIN_FREE_MEMORY_PCT` | 20 | Stop loop if free memory below this % |
| `WATCHDOG_THRESHOLD` | 15 | Kill active session if free memory below this % |
| `WATCHDOG_INTERVAL` | 30 | Seconds between watchdog checks |

### 3. JSON Parsing with Fallback

The script prefers `jq` but falls back to `python3` for environments without `jq`. Both paths auto-unwrap single-element arrays (beads `bd show --json` returns `[{...}]`):

```bash
HAS_JQ=false
command -v jq >/dev/null 2>&1 && HAS_JQ=true
[ "$HAS_JQ" = false ] && command -v python3 >/dev/null 2>&1 || die "jq or python3 required"

parse_json() {
  local filter="$1"
  if [ "$HAS_JQ" = true ]; then
    jq -r "if type == \"array\" then .[0] else . end | $filter"
  else
    python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    data = data[0] if data else {}
f = '$filter'.strip('.')
parts = [p for p in f.split('.') if p]
v = data
try:
    for p in parts:
        v = v[p]
except (KeyError, IndexError, TypeError):
    v = None
print('' if v is None else v)
"
  fi
}
```

### 4. Dependency-Aware Epic Ordering

Before processing an epic, the loop checks that all `depends_on` entries are status=closed. Epics with open dependencies are skipped until their blockers are resolved:

```bash
check_deps_closed() {
  local epic_id="$1"
  local deps_json
  deps_json=$(bd show "$epic_id" --json 2>/dev/null || echo "")
  [ -z "$deps_json" ] && return 0

  local blocking_dep
  if [ "$HAS_JQ" = true ]; then
    blocking_dep=$(echo "$deps_json" | jq -r '
      if type == "array" then .[0] else . end |
      (.depends_on // .dependencies // []) |
      map(select(.status != "closed")) |
      .[0].id // empty
    ' 2>/dev/null || echo "")
  fi
  # ... python3 fallback follows the same logic

  if [ -n "$blocking_dep" ]; then
    log "Skip $epic_id: blocked by dependency $blocking_dep (not closed)"
    return 1
  fi
  return 0
}
```

The `get_next_epic()` function supports two modes:
- **Explicit**: iterates over `EPIC_IDS`, checking status=open and deps closed
- **Auto-discover**: queries `bd list --type=epic --ready --limit=10` for available work

### 5. Two-Scope Logging

Claude Code's `--output-format stream-json` emits JSONL events. The loop captures both the raw trace and extracted human-readable text:

```bash
claude --dangerously-skip-permissions \
       --model "$MODEL" \
       --output-format stream-json \
       --verbose \
       -p "$PROMPT" \
       2>"$LOGFILE.stderr" | tee "$TRACEFILE" | extract_text > "$LOGFILE"
```

- `$TRACEFILE` (`trace_*.jsonl`): raw stream-json for `ca watch` and forensic analysis
- `$LOGFILE` (`loop_*.log`): extracted assistant text for marker detection and human reading
- `.stderr`: captured separately and appended to the macro log

The `extract_text` function pulls text from assistant messages in the stream-json format:

```bash
extract_text() {
  if [ "$HAS_JQ" = true ]; then
    jq -j --unbuffered '
      select(.type == "assistant") |
      .message.content[]? |
      select(.type == "text") |
      .text // empty
    ' 2>/dev/null || { echo "WARN: extract_text parser failed" >&2; }
  fi
  # ... python3 fallback for environments without jq
}
```

### 6. Marker Detection (Primary + Fallback)

The agent outputs markers (`EPIC_COMPLETE`, `EPIC_FAILED`, `HUMAN_REQUIRED: <reason>`) that the loop detects. Detection uses two strategies: anchored grep in the extracted log (reliable), then unanchored grep in the raw trace (fallback when text extraction fails):

```bash
detect_marker() {
  local logfile="$1" tracefile="$2"

  # Primary: anchored patterns in extracted text
  if [ -s "$logfile" ]; then
    if grep -q "^EPIC_COMPLETE$" "$logfile"; then echo "complete"; return 0; fi
    if grep -q "^HUMAN_REQUIRED:" "$logfile"; then
      local reason
      reason=$(grep "^HUMAN_REQUIRED:" "$logfile" | head -1 | sed 's/^HUMAN_REQUIRED: *//')
      echo "human:$reason"; return 0
    fi
    if grep -q "^EPIC_FAILED$" "$logfile"; then echo "failed"; return 0; fi
  fi

  # Fallback: unanchored patterns in raw trace JSONL
  if [ -s "$tracefile" ]; then
    if grep -q "EPIC_COMPLETE" "$tracefile"; then echo "complete"; return 0; fi
    if grep -q "HUMAN_REQUIRED:" "$tracefile"; then echo "human:detected in trace"; return 0; fi
    if grep -q "EPIC_FAILED" "$tracefile"; then echo "failed"; return 0; fi
  fi

  echo "none"
}
```

The `HUMAN_REQUIRED` marker is distinct from `EPIC_FAILED` -- it signals a blocker that needs human action (API keys, account creation, design decisions) rather than a code failure. The loop skips the epic and continues to the next one.

### 7. Session Prompt Design

The prompt injected into each Claude session includes memory safety rules, workflow instructions, and all three exit markers. Key design choices:

- **No questions**: the agent must make decisions autonomously (no human is watching)
- **Incremental commits**: progress is saved even if the session crashes
- **Memory safety rules**: prevents the agent from running expensive test suites that leak memory

```bash
build_prompt() {
  local epic_id="$1"
  cat <<'PROMPT_BODY'
You are running in an autonomous infinity loop.

## Step 1: Load context
```bash
npx ca load-session
bd show <epic_id>
```

## Step 2: Execute the workflow
/compound:cook-it from plan -- Epic: <epic_id>

## Step 3: On completion
1. Close the epic: `bd close <epic_id>`
2. Commit and push all changes
3. Output: EPIC_COMPLETE

## Step 4: On failure
1. Add a note with reason
2. Output: EPIC_FAILED

## Step 5: On human required
1. Add a note with reason
2. Output: HUMAN_REQUIRED: <reason>

## Memory Safety Rules
- NEVER run full test suites
- Between test runs, wait for child processes to exit

## Rules
- Do NOT ask questions -- there is no human
- Do NOT stop early -- complete the full workflow
- If tests fail, fix them. Retry up to 3 times before declaring failure
- Commit incrementally as you make progress
PROMPT_BODY
}
```

### 8. Multi-Model Review Phase

When reviewers are configured, the loop runs a review cycle after every N completed epics (or at the end). The review phase:

1. **Detects available reviewers** by health-checking each CLI with a timeout
2. **Spawns reviewers sequentially** (not parallel -- prevents OOM) with per-reviewer memory gates
3. **Parses results**: distinguishes APPROVED, CHANGES_REQUESTED, and API errors (rate limits, auth failures are not treated as rejections)
4. **Feeds findings to an implementer session** that fixes P0/P1 issues
5. **Loops** up to `MAX_REVIEW_CYCLES` until all reviewers approve or budget is exhausted

```bash
run_review_phase() {
  local trigger="$1"

  detect_reviewers || return 0  # Skip if no CLIs available
  mkdir -p "$REVIEW_DIR"

  local cycle=1
  while [ "$cycle" -le "$MAX_REVIEW_CYCLES" ]; do
    spawn_reviewers "$cycle" "$cycle_dir"

    local all_approved=true
    for reviewer in $AVAILABLE_REVIEWERS; do
      local report="$cycle_dir/$reviewer.md"
      if [ ! -s "$report" ]; then
        log "$reviewer: NO OUTPUT (crashed or timed out)"
      elif tr -d '\r' < "$report" | grep -q "^REVIEW_APPROVED$"; then
        log "$reviewer: APPROVED"
      elif grep -qi "rate limit\|API.*[Ee]rror\|API_KEY" "$report"; then
        log "$reviewer: ERROR (API/auth issue, not a code review rejection)"
      else
        log "$reviewer: CHANGES_REQUESTED"
        all_approved=false
      fi
    done

    [ "$all_approved" = true ] && return 0

    # Feed findings to implementer for fixes, then re-review
    [ "$cycle" -lt "$MAX_REVIEW_CYCLES" ] && feed_implementer "$cycle_dir"
    cycle=$((cycle + 1))
  done

  # Budget exhausted
  [ "$REVIEW_BLOCKING" = true ] && die "Review blocking enabled, exiting"
}
```

Reviewer invocation uses `portable_timeout` for cross-platform support and session resume for multi-cycle reviews:

```bash
portable_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"       # macOS Homebrew
  else
    "$@" &                       # Shell fallback
    local pid=$!
    ( sleep "$secs" && kill "$pid" 2>/dev/null ) &
    local watchdog=$!
    wait "$pid" 2>/dev/null; local rc=$?
    kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
    return $rc
  fi
}
```

### 9. Main Loop State Machine

The main loop tracks completion counts, diff ranges for review, and processes epics with retries:

```bash
COMPLETED=0; FAILED=0; SKIPPED=0; PROCESSED=""
LOOP_START=$(date +%s)
COMPLETED_SINCE_REVIEW=0
REVIEW_BASE_SHA=$(git rev-parse HEAD)

while true; do
  cleanup_orphans
  check_memory || break

  EPIC_ID=$(get_next_epic) || break

  ATTEMPT=0; SUCCESS=false
  while [ $ATTEMPT -le $MAX_RETRIES ]; do
    ATTEMPT=$((ATTEMPT + 1))
    write_status "running" "$EPIC_ID" "$ATTEMPT"

    # Run claude session in background subshell with memory watchdog
    (
      claude --dangerously-skip-permissions \
             --model "$MODEL" \
             --output-format stream-json \
             --verbose \
             -p "$PROMPT" \
             2>"$LOGFILE.stderr" | tee "$TRACEFILE" | extract_text > "$LOGFILE"
    ) &
    CLAUDE_PGID=$!
    start_memory_watchdog "$CLAUDE_PGID" "$MEM_LOG"
    wait "$CLAUDE_PGID" 2>/dev/null || true
    stop_memory_watchdog

    MARKER=$(detect_marker "$LOGFILE" "$TRACEFILE")
    case "$MARKER" in
      complete)  SUCCESS=true;  break ;;
      human:*)   SUCCESS=skip;  break ;;  # Skip, continue to next epic
      failed|*)  ;; # Retry
    esac
  done

  case "$SUCCESS" in
    true)  # Verify working tree is clean after epic completion
           if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
             log "WARN: Working tree dirty after epic completion, auto-committing"
             git add -A && git commit -m "chore: auto-commit uncommitted changes from $EPIC_ID"
           fi
           COMPLETED=$((COMPLETED + 1))
           COMPLETED_SINCE_REVIEW=$((COMPLETED_SINCE_REVIEW + 1))
           # Trigger periodic review if cadence reached
           if [ "$COMPLETED_SINCE_REVIEW" -ge "$REVIEW_EVERY" ]; then
             REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
             run_review_phase "periodic"
             COMPLETED_SINCE_REVIEW=0
             REVIEW_BASE_SHA=$(git rev-parse HEAD)
           fi ;;
    skip)  SKIPPED=$((SKIPPED + 1)) ;;
    *)     FAILED=$((FAILED + 1)); break ;;  # Stop loop on failure
  esac

  PROCESSED="$PROCESSED $EPIC_ID"
done

# Final review for any unreviewed completed epics
[ "$COMPLETED_SINCE_REVIEW" -gt 0 ] && run_review_phase "final"

# Push to remote if available
if git remote get-url origin >/dev/null 2>&1; then
  log "Pushing to remote..."
  git push 2>&1 || log "WARN: git push failed (check SSH/auth)"
fi
```

### 10. Observability Output

The loop writes structured observability data for monitoring and post-mortem analysis:

**Status file** (`agent_logs/.loop-status.json`) -- current state, updated on every attempt:
```json
{"epic_id":"E1","attempt":2,"started_at":"2026-03-21T12:00:00Z","status":"running"}
```

**Execution log** (`agent_logs/loop-execution.jsonl`) -- one line per completed epic:
```json
{"epic_id":"E1","result":"complete","attempts":1,"duration_s":342,"timestamp":"2026-03-21T12:05:42Z"}
{"epic_id":"E2","result":"skipped","attempts":1,"duration_s":15,"timestamp":"2026-03-21T12:06:00Z"}
```

**Summary** (appended at end):
```json
{"type":"summary","completed":5,"failed":0,"skipped":1,"total_duration_s":1847}
```

**Memory log** (`agent_logs/memory_<epic>-<ts>.log`) -- watchdog readings:
```
[2026-03-21_12-01-30] memory_free=45%
[2026-03-21_12-02-00] memory_free=38%
[2026-03-21_12-02-30] WATCHDOG: killing PID 54321
```

**Latest symlink** (`agent_logs/.latest`) -- points to the active trace file for `ca watch`.
