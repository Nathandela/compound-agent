# Memory Safety (4-Layer Defense)

> Loaded on demand. Read when referenced by SKILL.md.

## Table of Contents

1. [Overview](#overview)
2. [Layer 1: Orphan Cleanup](#layer-1-orphan-cleanup)
3. [Layer 2: Pre-session Memory Gate](#layer-2-pre-session-memory-gate)
4. [Layer 3: Memory Watchdog](#layer-3-memory-watchdog)
5. [Layer 4: Stale Output Watchdog](#layer-4-stale-output-watchdog)
6. [Environment Variables](#environment-variables)

---

## Overview

Long-running loops exhaust system memory through zombie test processes and large Claude sessions, and can hang when the Claude CLI fails to exit after completion. The generated script uses four layers of protection, each operating at a different point in the session lifecycle.

## Layer 1: Orphan Cleanup

Runs between sessions. Kills leftover test/build processes scoped to the current repo directory (avoids killing unrelated processes).

```bash
cleanup_orphans() {
  local killed=0
  local repo_dir
  repo_dir=$(pwd)
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

**Stack-specific patterns**: The `ORPHAN_PROC_PATTERN` env var controls which processes are considered orphans. Defaults cover common stacks:

| Stack | Pattern |
|-------|---------|
| JavaScript/TypeScript | `vitest\|node.*\.test\.` |
| Go | `go\.test` |
| Python | `pytest` |
| Rust | `cargo\.test` |

Override for your stack:
```bash
ORPHAN_PROC_PATTERN="vitest|node.*\.test\." ./.compound-agent/infinity-loop.sh   # JS only
ORPHAN_PROC_PATTERN="go\.test" ./.compound-agent/infinity-loop.sh                 # Go only
```

## Layer 2: Pre-session Memory Gate

Before each epic, check free memory and abort the loop if below threshold:

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

## Layer 3: Memory Watchdog

A background process monitors free memory during a Claude session and kills it if memory drops below a critical threshold:

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

Memory watchdog log files are written to `.compound-agent/agent_logs/memory_<epic>-<ts>.log`.

## Layer 4: Stale Output Watchdog

A background process monitors the trace file for output activity. If the Claude CLI produces its final result but the process hangs (a known non-deterministic issue), this watchdog detects the inactivity and kills the session.

```bash
STALE_WATCHDOG_PID=""

start_stale_watchdog() {
  local target_pid="$1" trace_file="$2" log_file="$3"
  (
    local last_size=0 stale_secs=0
    while kill -0 "$target_pid" 2>/dev/null; do
      sleep "$WATCHDOG_INTERVAL"
      local cur_size=0
      [ -f "$trace_file" ] && cur_size=$(wc -c < "$trace_file" 2>/dev/null || echo 0)
      if [ "$cur_size" -eq "$last_size" ] && [ "$last_size" -gt 0 ]; then
        stale_secs=$((stale_secs + WATCHDOG_INTERVAL))
        if [ "$stale_secs" -ge "$SESSION_STALE_TIMEOUT" ]; then
          echo "STALE_WATCHDOG: no output for ${stale_secs}s, killing" >> "$log_file"
          kill -TERM -- -"$target_pid" 2>/dev/null || kill "$target_pid" 2>/dev/null
          exit 0
        fi
      else
        stale_secs=0
      fi
      last_size=$cur_size
    done
  ) &
  STALE_WATCHDOG_PID=$!
}
```

The stale counter only increments when `last_size > 0` (trace file has content), so slow-starting sessions are not false-positived.

Stale watchdog events are written to the same memory log file with a `STALE_WATCHDOG:` prefix.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MIN_FREE_MEMORY_PCT` | 20 | Stop loop if free memory below this % (Layer 2) |
| `WATCHDOG_THRESHOLD` | 15 | Kill active session if free memory below this % (Layer 3) |
| `WATCHDOG_INTERVAL` | 30 | Seconds between watchdog checks (Layers 3-4) |
| `SESSION_STALE_TIMEOUT` | 1800 | Kill session if no output for this many seconds (Layer 4) |
| `ORPHAN_PROC_PATTERN` | `vitest\|node.*\.test\.\|go\.test\|pytest\|cargo\.test` | Process patterns for orphan cleanup (Layer 1) |

Lenient example (for machines with less RAM headroom):
```bash
MIN_FREE_MEMORY_PCT=10 WATCHDOG_THRESHOLD=8 WATCHDOG_INTERVAL=60 ./.compound-agent/infinity-loop.sh
```
