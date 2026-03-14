/**
 * Bash script templates for the improvement loop.
 * Pure functions that return bash script fragments.
 */

export function buildTopicDiscovery(): string {
  return `
get_topics() {
  local improve_dir="\${IMPROVE_DIR:-improve}"
  local topics=""
  if [ -n "$TOPIC_FILTER" ]; then
    # Use explicit topic list from CLI --topics
    for topic in $TOPIC_FILTER; do
      if [ -f "$improve_dir/\${topic}.md" ]; then
        topics="$topics $topic"
      else
        log "WARN: $improve_dir/\${topic}.md not found, skipping"
      fi
    done
  else
    for f in "$improve_dir"/*.md; do
      [ -f "$f" ] || continue
      local topic
      topic=$(basename "$f" .md)
      topics="$topics $topic"
    done
  fi
  topics="\${topics# }"
  if [ -z "$topics" ]; then
    log "No improve/*.md files found"
    return 1
  fi
  echo "$topics"
  return 0
}
`;
}

export function buildImprovePrompt(): string {
  return `
build_improve_prompt() {
  local topic="$1"
  local improve_dir="\${IMPROVE_DIR:-improve}"
  local program_file="$improve_dir/\${topic}.md"

  if [ ! -f "$program_file" ]; then
    log "ERROR: $program_file not found"
    return 1
  fi

  # Stream static parts via quoted heredoc (no expansion) + file content via cat
  # Avoids heredoc delimiter collision if .md file contains the delimiter string
  cat <<'IMPROVE_PROMPT_HEADER'
You are running in an autonomous improvement loop. Your task is to make ONE improvement to the codebase.

## Your Program
IMPROVE_PROMPT_HEADER

  cat "$program_file"

  cat <<'IMPROVE_PROMPT_FOOTER'

## Rules
- Make ONE focused improvement per iteration.
- Run the validation described in your program.
- If you successfully improved something and validation passes, commit your changes then output on its own line:
  IMPROVED
- If you tried but found nothing to improve (or improvements don't pass validation), output:
  NO_IMPROVEMENT
- If you encountered an error that prevents you from working, output:
  FAILED
- Do NOT ask questions -- there is no human.
- Commit your changes before outputting the marker.
- You can inspect what changed with git diff before committing.
IMPROVE_PROMPT_FOOTER
}
`;
}

export function buildImproveMarkerDetection(): string {
  return `
# detect_improve_marker() - Check for improvement markers in log and trace
# Primary: macro log (anchored patterns). Fallback: trace JSONL (unanchored).
# Usage: MARKER=$(detect_improve_marker "$LOGFILE" "$TRACEFILE")
# Returns: "improved", "no_improvement", "failed", or "none"
detect_improve_marker() {
  local logfile="$1" tracefile="$2"

  # Primary: check extracted text with anchored patterns
  if [ -s "$logfile" ]; then
    if grep -q "^IMPROVED$" "$logfile"; then
      echo "improved"; return 0
    elif grep -q "^NO_IMPROVEMENT$" "$logfile"; then
      echo "no_improvement"; return 0
    elif grep -q "^FAILED$" "$logfile"; then
      echo "failed"; return 0
    fi
  fi

  # Fallback: check raw trace JSONL (unanchored -- markers are inside JSON strings)
  if [ -s "$tracefile" ]; then
    if grep -q "IMPROVED" "$tracefile"; then
      echo "improved"; return 0
    elif grep -q "NO_IMPROVEMENT" "$tracefile"; then
      echo "no_improvement"; return 0
    elif grep -q "FAILED" "$tracefile"; then
      echo "failed"; return 0
    fi
  fi

  echo "none"
}
`;
}

export function buildImproveObservability(): string {
  return `
# Observability: status file and execution log
IMPROVE_STATUS_FILE="$LOG_DIR/.improve-status.json"
IMPROVE_EXEC_LOG="$LOG_DIR/improvement-log.jsonl"

write_improve_status() {
  local status="$1"
  local topic="\${2:-}"
  local iteration="\${3:-0}"
  if [ "$status" = "idle" ]; then
    echo "{\\"status\\":\\"idle\\",\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" > "$IMPROVE_STATUS_FILE"
  else
    echo "{\\"topic\\":\\"$topic\\",\\"iteration\\":$iteration,\\"started_at\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\",\\"status\\":\\"$status\\"}" > "$IMPROVE_STATUS_FILE"
  fi
}

log_improve_result() {
  local topic="$1" result="$2" improvements="$3" duration="$4"
  echo "{\\"topic\\":\\"$topic\\",\\"result\\":\\"$result\\",\\"improvements\\":$improvements,\\"duration_s\\":$duration,\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"}" >> "$IMPROVE_EXEC_LOG"
}
`;
}

export function buildImproveSessionRunner(): string {
  return `
    # Run claude session with two-scope logging
    PROMPT=$(build_improve_prompt "$TOPIC")

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

    MARKER=$(detect_improve_marker "$LOGFILE" "$TRACEFILE")
`;
}

export interface ImproveMainLoopOptions {
  maxIters: number;
  timeBudget: number; // seconds, 0 = unlimited
  embedded?: boolean; // true when used inside ca loop --improve (no exit calls)
}

function buildImproveIterationBody(): string {
  return buildImproveSessionRunner() + `

    case "$MARKER" in
      (improved)
        # Verify the agent actually committed
        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
          log "WARN: Uncommitted changes detected after IMPROVED marker"
        fi
        log "Topic $TOPIC improved (iter $ITER)"
        TOPIC_IMPROVED=$((TOPIC_IMPROVED + 1))
        CONSECUTIVE_NO_IMPROVE=0
        git tag -d "$TAG" 2>/dev/null || true
        ;;
      (no_improvement)
        log "Topic $TOPIC: no improvement (iter $ITER), reverting"
        git reset --hard "$TAG"
        git clean -fd 2>/dev/null || true
        git tag -d "$TAG" 2>/dev/null || true
        CONSECUTIVE_NO_IMPROVE=$((CONSECUTIVE_NO_IMPROVE + 1))
        if [ $CONSECUTIVE_NO_IMPROVE -ge 2 ]; then
          log "Diminishing returns for $TOPIC, moving on"
          break
        fi
        ;;
      (failed)
        log "Topic $TOPIC failed (iter $ITER), reverting"
        git reset --hard "$TAG"
        git clean -fd 2>/dev/null || true
        git tag -d "$TAG" 2>/dev/null || true
        TOPIC_FAILED=1
        break
        ;;
      (*)
        log "Topic $TOPIC: no marker detected (iter $ITER), reverting"
        git reset --hard "$TAG"
        git clean -fd 2>/dev/null || true
        git tag -d "$TAG" 2>/dev/null || true
        TOPIC_FAILED=1
        break
        ;;
    esac
  done

  TOPIC_DURATION=$(( $(date +%s) - TOPIC_START ))

  if [ $TOPIC_IMPROVED -gt 0 ]; then
    IMPROVED_COUNT=$((IMPROVED_COUNT + TOPIC_IMPROVED))
    log_improve_result "$TOPIC" "improved" "$TOPIC_IMPROVED" "$TOPIC_DURATION"
  elif [ $TOPIC_FAILED -eq 1 ]; then
    FAILED_TOPICS=$((FAILED_TOPICS + 1))
    log_improve_result "$TOPIC" "failed" "0" "$TOPIC_DURATION"
  else
    SKIPPED_TOPICS=$((SKIPPED_TOPICS + 1))
    log_improve_result "$TOPIC" "no_improvement" "0" "$TOPIC_DURATION"
  fi
done`;
}

export function buildImproveMainLoop(options: ImproveMainLoopOptions): string {
  const embedded = options.embedded ?? false;

  return `
# Improve loop
MAX_ITERS=${options.maxIters}
TIME_BUDGET=${options.timeBudget}
IMPROVED_COUNT=0
FAILED_TOPICS=0
SKIPPED_TOPICS=0
IMPROVE_START=$(date +%s)

# Worktree-clean preflight: refuse to run with dirty working tree
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  log "ERROR: Working tree is dirty. Commit or stash changes before running the improvement loop."
  log "  git status:"
  git status --short
  ${embedded ? 'IMPROVE_RESULT=1' : 'exit 1'}
fi

TOPICS=$(get_topics) || { log "No topics found, exiting"; ${embedded ? 'IMPROVE_RESULT=0' : 'exit 0'}; }
log "Improve loop starting"
log "Config: max_iters=$MAX_ITERS time_budget=$TIME_BUDGET model=$MODEL"
log "Topics: $TOPICS"

for TOPIC in $TOPICS; do
  log "Starting topic: $TOPIC"
  TOPIC_IMPROVED=0
  TOPIC_FAILED=0
  CONSECUTIVE_NO_IMPROVE=0
  TOPIC_START=$(date +%s)

  ITER=0
  while [ $ITER -lt $MAX_ITERS ]; do
    ITER=$((ITER + 1))

    # Time budget check
    if [ $TIME_BUDGET -gt 0 ]; then
      ELAPSED=$(( $(date +%s) - IMPROVE_START ))
      if [ $ELAPSED -ge $TIME_BUDGET ]; then
        log "Time budget exhausted ($ELAPSED >= $TIME_BUDGET seconds)"
        break 2
      fi
    fi

    # Dry-run check BEFORE any side effects (tags, sessions)
    if [ -n "\${IMPROVE_DRY_RUN:-}" ]; then
      log "[DRY RUN] Would run claude session for $TOPIC (iter $ITER)"
      TOPIC_IMPROVED=$((TOPIC_IMPROVED + 1))
      continue
    fi

    TS=$(timestamp)
    LOGFILE="$LOG_DIR/loop_improve_\${TOPIC}-\${TS}.log"
    TRACEFILE="$LOG_DIR/trace_improve_\${TOPIC}-\${TS}.jsonl"
    TAG="improve/\${TOPIC}/iter-\${ITER}/pre"

    git tag -f "$TAG"
    write_improve_status "running" "$TOPIC" "$ITER"
    ln -sf "$(basename "$TRACEFILE")" "$LOG_DIR/.latest"

    log "Iteration $ITER/$MAX_ITERS for $TOPIC"

` + buildImproveIterationBody() + `

# Summary
TOTAL_DURATION=$(( $(date +%s) - IMPROVE_START ))
echo "{\\"type\\":\\"summary\\",\\"improved\\":$IMPROVED_COUNT,\\"failed_topics\\":$FAILED_TOPICS,\\"skipped_topics\\":$SKIPPED_TOPICS,\\"total_duration_s\\":$TOTAL_DURATION}" >> "$IMPROVE_EXEC_LOG"
write_improve_status "idle"
log "Improve loop finished. Improvements: $IMPROVED_COUNT, Failed topics: $FAILED_TOPICS, Skipped: $SKIPPED_TOPICS"
${embedded ? 'IMPROVE_RESULT=$( [ $FAILED_TOPICS -eq 0 ] && echo 0 || echo 1 )' : '[ $FAILED_TOPICS -eq 0 ] && exit 0 || exit 1'}
`;
}
