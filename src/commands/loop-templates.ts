/**
 * Bash script templates for the loop command.
 *
 * Pure functions that return bash script fragments.
 * Separated from loop.ts to stay within max-lines.
 */

export function buildMemorySafety(): string {
  return `
# Memory safety config
MIN_FREE_MEMORY_PCT=\${MIN_FREE_MEMORY_PCT:-20}

# cleanup_orphans() - Kill leftover node/vitest processes between sessions
# Prevents memory accumulation from zombie test processes
cleanup_orphans() {
  local killed=0
  for pid in $(pgrep -f "vitest" 2>/dev/null || true); do
    kill "$pid" 2>/dev/null && killed=$((killed + 1))
  done
  for pid in $(pgrep -f "node.*\\.test\\." 2>/dev/null || true); do
    kill "$pid" 2>/dev/null && killed=$((killed + 1))
  done
  if [ "$killed" -gt 0 ]; then
    log "Cleaned up $killed orphan test processes"
    sleep 2
  fi
}

# check_memory() - Abort if system free memory is too low
# Returns 0 if OK, 1 if memory pressure detected
check_memory() {
  local free_pct
  if [ "$(uname)" = "Darwin" ]; then
    free_pct=$(memory_pressure 2>/dev/null | awk -F: '/free percentage/ {gsub(/%| /,"",$2); print $2}')
    if [ -z "$free_pct" ]; then
      return 0
    fi
    if [ "$free_pct" -lt "$MIN_FREE_MEMORY_PCT" ]; then
      log "WARN: System memory \${free_pct}% free (minimum: \${MIN_FREE_MEMORY_PCT}%)"
      return 1
    fi
    log "Memory OK: \${free_pct}% free"
  else
    local mem_total mem_available
    mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    mem_available=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    if [ "$mem_total" -gt 0 ]; then
      free_pct=$(( mem_available * 100 / mem_total ))
    else
      return 0
    fi
    if [ "$free_pct" -lt "$MIN_FREE_MEMORY_PCT" ]; then
      log "WARN: System memory \${free_pct}% free (minimum: \${MIN_FREE_MEMORY_PCT}%)"
      return 1
    fi
    log "Memory OK: \${free_pct}% free"
  fi
  return 0
}
`;
}

export function buildDependencyCheck(): string {
  return `
# check_deps_closed() - Verify all depends_on for an epic are closed
# Returns 0 if all deps closed (or no deps), 1 if any dep is open
# Uses the depends_on array from bd show --json (objects with .id/.status)
check_deps_closed() {
  local epic_id="$1"
  local deps_json
  deps_json=$(bd show "$epic_id" --json 2>/dev/null || echo "")
  if [ -z "$deps_json" ]; then
    return 0
  fi
  local blocking_dep
  if [ "$HAS_JQ" = true ]; then
    blocking_dep=$(echo "$deps_json" | jq -r '
      if type == "array" then .[0] else . end |
      (.depends_on // .dependencies // []) |
      map(select(.status != "closed")) |
      .[0].id // empty
    ' 2>/dev/null || echo "")
  else
    blocking_dep=$(echo "$deps_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    data = data[0] if data else {}
deps = data.get('depends_on', data.get('dependencies', []))
for d in deps:
    s = d.get('status', 'open') if isinstance(d, dict) else 'open'
    if s != 'closed':
        print(d.get('id', d) if isinstance(d, dict) else d)
        break
" 2>/dev/null || echo "")
  fi
  if [ -n "$blocking_dep" ]; then
    log "Skip $epic_id: blocked by dependency $blocking_dep (not closed)"
    return 1
  fi
  return 0
}
`;
}

export function buildEpicSelector(): string {
  return buildDependencyCheck() + `
get_next_epic() {
  if [ -n "$EPIC_IDS" ]; then
    for epic_id in $EPIC_IDS; do
      case " $PROCESSED " in (*" $epic_id "*) continue ;; esac
      local status
      status=$(bd show "$epic_id" --json 2>/dev/null | parse_json '.status' 2>/dev/null || echo "")
      if [ "$status" = "open" ]; then
        check_deps_closed "$epic_id" || continue
        echo "$epic_id"
        return 0
      fi
    done
    return 1
  else
    local epic_id
    if [ "$HAS_JQ" = true ]; then
      epic_id=$(bd list --type=epic --ready --json --limit=10 2>/dev/null | jq -r '.[].id' 2>/dev/null | while read -r id; do
        case " $PROCESSED " in (*" $id "*) continue ;; esac
        check_deps_closed "$id" || continue
        echo "$id"
        break
      done)
    else
      # Emit ALL unprocessed candidates so the shell loop can check each one's deps.
      local candidates epic_id=""
      candidates=$(bd list --type=epic --ready --json --limit=10 2>/dev/null | python3 -c "
import sys, json
processed = set('$PROCESSED'.split())
items = json.load(sys.stdin)
for item in items:
    if item['id'] not in processed:
        print(item['id'])" 2>/dev/null || echo "")
      for cid in $candidates; do
        check_deps_closed "$cid" || continue
        epic_id="$cid"
        break
      done
    fi
    if [ -z "$epic_id" ]; then
      return 1
    fi
    echo "$epic_id"
    return 0
  fi
}
`;
}

export function buildPromptFunction(): string {
  return `
build_prompt() {
  local epic_id="$1"
  cat <<'PROMPT_HEADER'
You are running in an autonomous infinity loop. Your task is to fully implement a beads epic.

## Step 1: Load context
Run these commands to prime your session:
PROMPT_HEADER
  cat <<PROMPT_BODY
\\\`\\\`\\\`bash
npx ca load-session
bd show $epic_id
\\\`\\\`\\\`

Read the epic details carefully. Understand scope, acceptance criteria, and sub-tasks.

## Step 2: Execute the workflow
Run the full compound workflow for this epic, starting from the plan phase
(spec-dev is already done -- the epic exists):

/compound:cook-it from plan -- Epic: $epic_id

Work through all phases: plan, work, review, compound.

## Step 3: On completion
When all work is done and tests pass:
1. Close the epic: \`bd close $epic_id\`
2. Sync beads: \`bd sync\`
3. Commit and push all changes
4. Output this exact marker on its own line:

EPIC_COMPLETE

## Step 4: On failure
If you cannot complete the epic after reasonable effort:
1. Add a note: \`bd update $epic_id --notes "Loop failed: <reason>"\`
2. Output this exact marker on its own line:

EPIC_FAILED

## Step 5: On human required
If you hit a blocker that REQUIRES human action (account creation, API keys,
external service setup, design decisions you cannot make, etc.):
1. Add a note: \`bd update $epic_id --notes "Human required: <reason>"\`
2. Output this exact marker followed by a short reason on the SAME line:

HUMAN_REQUIRED: <reason>

Example: HUMAN_REQUIRED: Need AWS credentials configured in .env

## Memory Safety Rules
- NEVER run \\\`pnpm test\\\` (full suite) -- it peaks at 900MB+ and leaks memory.
- For TypeScript regression checks, use \\\`pnpm test:unit\\\` (skips embedding + integration).
- For Go work, use \\\`go test ./...\\\` in the go/ directory.
- NEVER run embedding tests (\\\`pnpm test:fast\\\`, \\\`pnpm test:all\\\`) unless the epic modifies embedding code.
- Between test runs, wait for all vitest/node child processes to exit before starting another.

## Rules
- Do NOT ask questions -- there is no human. Make reasonable decisions.
- Do NOT stop early -- complete the full workflow.
- If tests fail, fix them. Retry up to 3 times before declaring failure.
- Use HUMAN_REQUIRED only for true blockers that no amount of retrying can solve.
- Commit incrementally as you make progress.
PROMPT_BODY
}`;
}

export function buildStreamExtractor(): string {
  return `
# extract_text() - Extract assistant text from stream-json events
# Claude Code stream-json format: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
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
    except (json.JSONDecodeError, KeyError, TypeError):
        pass
" 2>/dev/null || { echo "WARN: extract_text parser failed" >&2; }
  fi
}
`;
}

export function buildMarkerDetection(): string {
  return `
# detect_marker() - Check for completion markers in log and trace
# Primary: macro log (anchored patterns). Fallback: trace JSONL (unanchored).
# Usage: MARKER=$(detect_marker "$LOGFILE" "$TRACEFILE")
# Returns: "complete", "failed", "human:<reason>", or "none"
detect_marker() {
  local logfile="$1" tracefile="$2"

  # Primary: check extracted text with anchored patterns
  if [ -s "$logfile" ]; then
    if grep -q "^EPIC_COMPLETE$" "$logfile"; then
      echo "complete"; return 0
    elif grep -q "^HUMAN_REQUIRED:" "$logfile"; then
      local reason
      reason=$(grep "^HUMAN_REQUIRED:" "$logfile" | head -1 | sed 's/^HUMAN_REQUIRED: *//')
      echo "human:$reason"; return 0
    elif grep -q "^EPIC_FAILED$" "$logfile"; then
      echo "failed"; return 0
    fi
  fi

  # Fallback: check raw trace JSONL (unanchored -- markers are inside JSON strings)
  if [ -s "$tracefile" ]; then
    if grep -q "EPIC_COMPLETE" "$tracefile"; then
      echo "complete"; return 0
    elif grep -q "HUMAN_REQUIRED:" "$tracefile"; then
      echo "human:detected in trace"; return 0
    elif grep -q "EPIC_FAILED" "$tracefile"; then
      echo "failed"; return 0
    fi
  fi

  echo "none"
}
`;
}

export function buildObservability(): string {
  return `
# Observability: status file and execution log
STATUS_FILE="$LOG_DIR/.loop-status.json"
EXEC_LOG="$LOG_DIR/loop-execution.jsonl"

write_status() {
  local status="$1"
  local epic_id="\${2:-}"
  local attempt="\${3:-0}"
  if [ "$status" = "idle" ]; then
    echo "{\\"status\\":\\"idle\\",\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" > "$STATUS_FILE"
  else
    echo "{\\"epic_id\\":\\"$epic_id\\",\\"attempt\\":$attempt,\\"started_at\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\",\\"status\\":\\"$status\\"}" > "$STATUS_FILE"
  fi
}

log_result() {
  local epic_id="$1" result="$2" attempts="$3" duration="$4"
  echo "{\\"epic_id\\":\\"$epic_id\\",\\"result\\":\\"$result\\",\\"attempts\\":$attempts,\\"duration_s\\":$duration,\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" >> "$EXEC_LOG"
}
`;
}

export function buildSessionRunner(): string {
  return `
    PROMPT=$(build_prompt "$EPIC_ID")

    # Two-scope logging: stream-json to trace JSONL, extracted text to macro log
    claude --dangerously-skip-permissions \\
           --model "$MODEL" \\
           --output-format stream-json \\
           --verbose \\
           -p "$PROMPT" \\
           2>"$LOGFILE.stderr" | tee "$TRACEFILE" | extract_text > "$LOGFILE" || true

    # Append stderr to macro log
    [ -f "$LOGFILE.stderr" ] && cat "$LOGFILE.stderr" >> "$LOGFILE" && rm -f "$LOGFILE.stderr"

    # Health check: warn if macro log extraction failed
    if [ -s "$TRACEFILE" ] && [ ! -s "$LOGFILE" ]; then
      log "WARN: Macro log is empty but trace has content (extract_text may have failed)"
    fi

    MARKER=$(detect_marker "$LOGFILE" "$TRACEFILE")
    case "$MARKER" in
      (complete)
        log "Epic $EPIC_ID completed successfully"
        SUCCESS=true
        break
        ;;
      (human:*)
        REASON="\${MARKER#human:}"
        log "Epic $EPIC_ID needs human action: $REASON"
        bd update "$EPIC_ID" --notes "Human required: $REASON" 2>/dev/null || true
        SUCCESS=skip
        break
        ;;
      (failed)
        log "Epic $EPIC_ID reported failure (attempt $ATTEMPT)"
        ;;
      (*)
        log "Epic $EPIC_ID session ended without marker (attempt $ATTEMPT)"
        ;;
    esac`;
}

export interface MainLoopReviewOptions {
  hasReview: boolean;
  reviewEvery: number;
}

function buildReviewTriggers(hasReview: boolean, reviewEvery: number): {
  counterInit: string; periodic: string; final: string;
} {
  if (!hasReview) return { counterInit: '', periodic: '', final: '' };
  const usePeriodic = reviewEvery > 0;
  return {
    counterInit: usePeriodic
      ? '\nCOMPLETED_SINCE_REVIEW=0\nREVIEW_BASE_SHA=$(git rev-parse HEAD)'
      : '\nREVIEW_BASE_SHA=$(git rev-parse HEAD)',
    periodic: usePeriodic
      ? `
    COMPLETED_SINCE_REVIEW=$((COMPLETED_SINCE_REVIEW + 1))
    if [ "$COMPLETED_SINCE_REVIEW" -ge "$REVIEW_EVERY" ]; then
      REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
      run_review_phase "periodic" || log "WARN: review phase (periodic) failed, continuing"
      COMPLETED_SINCE_REVIEW=0
      REVIEW_BASE_SHA=$(git rev-parse HEAD)
    fi`
      : '',
    final: usePeriodic
      ? `
if [ "$COMPLETED_SINCE_REVIEW" -gt 0 ]; then
  REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
  run_review_phase "final" || log "WARN: review phase (final) failed, continuing"
fi
`
      : `
if [ "$COMPLETED" -gt 0 ]; then
  REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
  run_review_phase "final" || log "WARN: review phase (final) failed, continuing"
fi
`,
  };
}

export function buildMainLoop(reviewOptions?: MainLoopReviewOptions, skipExit?: boolean): string {
  const { counterInit, periodic, final } = buildReviewTriggers(
    reviewOptions?.hasReview ?? false,
    reviewOptions?.reviewEvery ?? 0,
  );

  return `
# Main loop
COMPLETED=0
FAILED=0
SKIPPED=0
PROCESSED=""
LOOP_START=$(date +%s)${counterInit}

log "=========================================="
log "Infinity loop starting"
log "=========================================="
log "Config: max_retries=$MAX_RETRIES model=$MODEL"
[ -n "$EPIC_IDS" ] && log "Targeting epics: $EPIC_IDS" || log "Targeting: all ready epics"

while true; do
  cleanup_orphans
  if ! check_memory; then
    log "FATAL: Memory pressure too high, stopping loop to prevent system freeze"
    log "  Hint: set MIN_FREE_MEMORY_PCT (current: \${MIN_FREE_MEMORY_PCT}%) or kill background processes"
    FAILED=$((FAILED + 1))
    break
  fi

  EPIC_ID=$(get_next_epic) || break

  log "=========================================="
  log "Processing epic: $EPIC_ID"
  log "=========================================="
  EPIC_START=$(date +%s)

  ATTEMPT=0
  SUCCESS=false

  write_status "running" "$EPIC_ID" 1

  while [ $ATTEMPT -le $MAX_RETRIES ]; do
    ATTEMPT=$((ATTEMPT + 1))
    TS=$(timestamp)
    LOGFILE="$LOG_DIR/loop_$EPIC_ID-$TS.log"
    TRACEFILE="$LOG_DIR/trace_$EPIC_ID-$TS.jsonl"

    write_status "running" "$EPIC_ID" "$ATTEMPT"

    # Update .latest symlink for ca watch (before claude invocation so watch can discover it)
    ln -sf "$(basename "$TRACEFILE")" "$LOG_DIR/.latest"

    log "Attempt $ATTEMPT/$((MAX_RETRIES + 1)) for $EPIC_ID (log: $LOGFILE)"

    if [ -n "\${LOOP_DRY_RUN:-}" ]; then
      log "[DRY RUN] Would run claude session for $EPIC_ID"
      SUCCESS=true
      break
    fi
` + buildSessionRunner() + `

    if [ $ATTEMPT -le $MAX_RETRIES ]; then
      log "Retrying $EPIC_ID..."
      cleanup_orphans
      sleep 5
    fi
  done

  EPIC_DURATION=$(( $(date +%s) - EPIC_START ))

  if [ "$SUCCESS" = true ]; then
    COMPLETED=$((COMPLETED + 1))
    log_result "$EPIC_ID" "complete" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID done. Completed so far: $COMPLETED"${periodic}
  elif [ "$SUCCESS" = skip ]; then
    SKIPPED=$((SKIPPED + 1))
    log_result "$EPIC_ID" "skipped" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID skipped (human required). Continuing."
  else
    FAILED=$((FAILED + 1))
    log_result "$EPIC_ID" "failed" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID failed after $((MAX_RETRIES + 1)) attempts. Stopping loop."
    PROCESSED="$PROCESSED $EPIC_ID"
    break
  fi

  PROCESSED="$PROCESSED $EPIC_ID"
done
${final}
TOTAL_DURATION=$(( $(date +%s) - LOOP_START ))
echo "{\\"type\\":\\"summary\\",\\"completed\\":$COMPLETED,\\"failed\\":$FAILED,\\"skipped\\":$SKIPPED,\\"total_duration_s\\":$TOTAL_DURATION}" >> "$EXEC_LOG"
write_status "idle"
log "=========================================="
log "Loop finished"
log "  Completed: $COMPLETED"
log "  Failed:    $FAILED"
log "  Skipped:   $SKIPPED"
log "  Duration:  \${TOTAL_DURATION}s ($(( TOTAL_DURATION / 60 ))m)"
log "  Processed: $PROCESSED"
log "=========================================="
${skipExit ? '' : '[ $FAILED -eq 0 ] && exit 0 || exit 1'}`;
}
