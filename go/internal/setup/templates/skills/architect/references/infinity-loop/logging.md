# Two-Scope Logging and Marker Detection

> Loaded on demand. Read when referenced by SKILL.md.

## Table of Contents

1. [Logging Pipeline](#logging-pipeline)
2. [The --verbose Flag](#the---verbose-flag)
3. [extract_text Function](#extract_text-function)
4. [Marker Detection](#marker-detection)
5. [The Three Markers](#the-three-markers)
6. [Latest Symlink](#latest-symlink)
7. [Crash Handler](#crash-handler)
8. [Observability Output](#observability-output)

---

## Logging Pipeline

Claude Code's `--output-format stream-json` emits JSONL events. The loop captures both the raw trace and extracted human-readable text:

```bash
claude --dangerously-skip-permissions \
       --model "$MODEL" \
       --output-format stream-json \
       --verbose \
       -p "$PROMPT" \
       2>"$LOGFILE.stderr" | tee "$TRACEFILE" | extract_text > "$LOGFILE"
```

| File | Pattern | Purpose |
|------|---------|---------|
| `$TRACEFILE` | `trace_*.jsonl` | Raw stream-json for `ca watch` and forensic analysis |
| `$LOGFILE` | `loop_*.log` | Extracted assistant text for marker detection and human reading |
| `.stderr` | `$LOGFILE.stderr` | Claude CLI stderr, appended to the macro log |

## The --verbose Flag

> **IMPORTANT**: The `--verbose` flag is required when using `--output-format stream-json` with `-p`.

Without `--verbose`, Claude CLI may produce no output on stdout when running in prompt mode (`-p`). This results in empty trace files and empty extracted logs, making marker detection impossible. The session still runs, but the loop cannot observe it.

Always include `--verbose` in the Claude invocation.

## extract_text Function

Pulls assistant text from stream-json events. Uses jq with a python3 fallback:

```bash
extract_text() {
  if [ "$HAS_JQ" = true ]; then
    jq -j --unbuffered '
      select(.type == "assistant") |
      .message.content[]? |
      select(.type == "text") |
      .text // empty
    ' 2>/dev/null || { echo "WARN: extract_text parser failed" >&2; }
  else
    python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
        if obj.get('type') == 'assistant':
            for block in obj.get('message', {}).get('content', []):
                if block.get('type') == 'text':
                    text = block.get('text', '')
                    if text:
                        print(text, end='', flush=True)
    except (json.JSONDecodeError, KeyError):
        pass
" 2>/dev/null || { echo "WARN: extract_text python fallback failed" >&2; }
  fi
}
```

If both jq and python3 fail, the loop falls back to trace-file marker detection (unanchored grep), which is less reliable. See `troubleshooting.md` for diagnosis.

## Marker Detection

Detection uses two strategies: anchored grep in the extracted log (reliable), then unanchored grep in the raw trace (fallback when text extraction fails):

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

## The Three Markers

| Marker | Meaning | Loop behavior |
|--------|---------|---------------|
| `EPIC_COMPLETE` | Epic finished successfully | Mark complete, advance to next epic |
| `EPIC_FAILED` | Code failure, agent could not fix | Retry up to `MAX_RETRIES`, then mark failed |
| `HUMAN_REQUIRED: <reason>` | Blocker needing human action | Skip epic, continue to next (distinct from failure) |

The agent outputs these markers as bare lines. The prompt instructs the agent to output exactly one marker per session.

## Latest Symlink

The loop maintains a `.latest` symlink pointing to the active trace file:

```bash
ln -sf "$TRACEFILE" "$LOG_DIR/.latest"
```

This allows `ca watch` to find the active session without knowing the filename.

## Crash Handler

The script installs an EXIT trap that logs crash details to the status file:

```bash
set -euo pipefail

_loop_cleanup() {
  local exit_code=$?
  stop_memory_watchdog 2>/dev/null || true
  stop_stale_watchdog 2>/dev/null || true
  if [ $exit_code -ne 0 ]; then
    log "CRASH: Script exited with code $exit_code at line ${BASH_LINENO[0]:-unknown}"
    echo "{\"status\":\"crashed\",\"exit_code\":$exit_code,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"line\":\"${BASH_LINENO[0]:-unknown}\"}" \
      > "${LOG_DIR:-.}/.loop-status.json" 2>/dev/null || true
  fi
}
trap _loop_cleanup EXIT
```

## Observability Output

| File | Content |
|------|---------|
| `.compound-agent/agent_logs/.loop-status.json` | Current state: `{"epic_id":"E1","attempt":2,"started_at":"...","status":"running"}` |
| `.compound-agent/agent_logs/loop-execution.jsonl` | One line per completed epic with result, attempts, duration |
| `.compound-agent/agent_logs/memory_<epic>-<ts>.log` | Watchdog memory readings per session |
| `.compound-agent/agent_logs/.latest` | Symlink to active trace file |

Summary record appended at loop exit:
```json
{"type":"summary","completed":5,"failed":0,"skipped":1,"total_duration_s":1847}
```
