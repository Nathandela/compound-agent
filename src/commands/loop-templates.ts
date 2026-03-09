/**
 * Bash script templates for the loop command.
 *
 * Pure functions that return bash script fragments.
 * Separated from loop.ts to stay within max-lines.
 */

export function buildEpicSelector(): string {
  return `
get_next_epic() {
  if [ -n "$EPIC_IDS" ]; then
    for epic_id in $EPIC_IDS; do
      case " $PROCESSED " in (*" $epic_id "*) continue ;; esac
      local status
      status=$(bd show "$epic_id" --json 2>/dev/null | parse_json '.status' 2>/dev/null || echo "")
      if [ "$status" = "open" ]; then
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
        echo "$id"
        break
      done)
    else
      epic_id=$(bd list --type=epic --ready --json --limit=10 2>/dev/null | python3 -c "
import sys, json
processed = set('$PROCESSED'.split())
items = json.load(sys.stdin)
for item in items:
    if item['id'] not in processed:
        print(item['id'])
        break" 2>/dev/null || echo "")
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
  return {
    counterInit: '\nCOMPLETED_SINCE_REVIEW=0\nREVIEW_DIFF_RANGE="HEAD"',
    periodic: reviewEvery > 0
      ? `
    COMPLETED_SINCE_REVIEW=$((COMPLETED_SINCE_REVIEW + 1))
    if [ "$COMPLETED_SINCE_REVIEW" -ge "$REVIEW_EVERY" ]; then
      REVIEW_DIFF_RANGE="HEAD~$COMPLETED_SINCE_REVIEW..HEAD"
      run_review_phase "periodic"
      COMPLETED_SINCE_REVIEW=0
    fi`
      : '',
    final: `
if [ "$COMPLETED" -gt 0 ]; then
  REVIEW_DIFF_RANGE="HEAD~$COMPLETED..HEAD"
  run_review_phase "final"
fi
`,
  };
}

export function buildMainLoop(reviewOptions?: MainLoopReviewOptions): string {
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

log "Infinity loop starting"
log "Config: max_retries=$MAX_RETRIES model=$MODEL"
[ -n "$EPIC_IDS" ] && log "Targeting epics: $EPIC_IDS" || log "Targeting: all ready epics"

while true; do
  EPIC_ID=$(get_next_epic) || break

  log "Processing epic: $EPIC_ID"
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
log "Loop finished. Completed: $COMPLETED, Failed: $FAILED, Skipped: $SKIPPED"
[ $FAILED -eq 0 ] && exit 0 || exit 1`;
}
