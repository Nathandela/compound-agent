package cli

import "fmt"

// loopScriptImprovePhase assembles the improvement phase from sub-functions.
func loopScriptImprovePhase(opts loopImproveOptions) string {
	return improvePhaseHeader() +
		improveTopicDiscovery() +
		improvePromptBuilder() +
		improveMarkerDetection() +
		improveObservability() +
		improveMainLoop(opts) +
		improvePhaseFooter()
}

func improvePhaseHeader() string {
	return "\n# Improvement phase (runs after epic loop completes successfully)\n" +
		"if [ $FAILED_COUNT -eq 0 ]; then\n" +
		"  log \"Epic loop completed successfully, starting improvement phase\"\n"
}

func improveTopicDiscovery() string {
	return `
get_topics() {
  local improve_dir="${IMPROVE_DIR:-improve}"
  local topics=""
  for f in "$improve_dir"/*.md; do
    [ -f "$f" ] || continue
    local topic
    topic=$(basename "$f" .md)
    topics="$topics $topic"
  done
  topics="${topics# }"
  if [ -z "$topics" ]; then
    log "No improve/*.md files found"
    return 1
  fi
  echo "$topics"
  return 0
}
`
}

func improvePromptBuilder() string {
	return `
build_improve_prompt() {
  local topic="$1"
  local improve_dir="${IMPROVE_DIR:-improve}"
  local program_file="$improve_dir/${topic}.md"

  if [ ! -f "$program_file" ]; then
    log "ERROR: $program_file not found"
    return 1
  fi

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
- If you tried but found nothing to improve, output:
  NO_IMPROVEMENT
- If you encountered an error, output:
  FAILED
- Do NOT ask questions -- there is no human.
- Commit your changes before outputting the marker.
IMPROVE_PROMPT_FOOTER
}
`
}

func improveMarkerDetection() string {
	return `
detect_improve_marker() {
  local logfile="$1" tracefile="$2"
  if [ -s "$logfile" ]; then
    if grep -q "^IMPROVED$" "$logfile"; then echo "improved"; return 0; fi
    if grep -q "^NO_IMPROVEMENT$" "$logfile"; then echo "no_improvement"; return 0; fi
    if grep -q "^FAILED$" "$logfile"; then echo "failed"; return 0; fi
  fi
  if [ -s "$tracefile" ]; then
    if grep -q "IMPROVED" "$tracefile"; then echo "improved"; return 0; fi
    if grep -q "NO_IMPROVEMENT" "$tracefile"; then echo "no_improvement"; return 0; fi
    if grep -q "FAILED" "$tracefile"; then echo "failed"; return 0; fi
  fi
  echo "none"
}
`
}

func improveObservability() string {
	return `
IMPROVE_STATUS_FILE="$LOG_DIR/.improve-status.json"
IMPROVE_EXEC_LOG="$LOG_DIR/improvement-log.jsonl"

write_improve_status() {
  local status="$1" topic="${2:-}" iteration="${3:-0}"
  if [ "$status" = "idle" ]; then
    echo "{\"status\":\"idle\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$IMPROVE_STATUS_FILE"
  else
    echo "{\"topic\":\"$topic\",\"iteration\":$iteration,\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"status\":\"$status\"}" > "$IMPROVE_STATUS_FILE"
  fi
}

log_improve_result() {
  local topic="$1" result="$2" improvements="$3" duration="$4"
  echo "{\"topic\":\"$topic\",\"result\":\"$result\",\"improvements\":$improvements,\"duration_s\":$duration,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$IMPROVE_EXEC_LOG"
}
`
}

func improveMainLoop(opts loopImproveOptions) string {
	return improveMainLoopInit(opts) + improveMainLoopBody()
}

func improveMainLoopInit(opts loopImproveOptions) string { //nolint:funlen // bash template string
	return fmt.Sprintf(`
MAX_ITERS=%d
TIME_BUDGET=%d
IMPROVED_COUNT=0
FAILED_TOPICS=0
SKIPPED_TOPICS=0
IMPROVE_START=$(date +%%s)

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  log "ERROR: Working tree is dirty. Commit or stash changes before running the improvement loop."
  git status --short
  IMPROVE_RESULT=1
else

TOPICS=$(get_topics) || { log "No topics found"; IMPROVE_RESULT=0; }
if [ -n "${TOPICS:-}" ]; then
  log "Improve loop starting"
  log "Config: max_iters=$MAX_ITERS time_budget=$TIME_BUDGET model=$MODEL"
  log "Topics: $TOPICS"

  for TOPIC in $TOPICS; do
    log "Starting topic: $TOPIC"
    TOPIC_IMPROVED=0
    TOPIC_FAILED=0
    CONSECUTIVE_NO_IMPROVE=0
    TOPIC_START=$(date +%%s)

    ITER=0
    while [ $ITER -lt $MAX_ITERS ]; do
      ITER=$((ITER + 1))
      if [ $TIME_BUDGET -gt 0 ]; then
        ELAPSED=$(( $(date +%%s) - IMPROVE_START ))
        if [ $ELAPSED -ge $TIME_BUDGET ]; then
          log "Time budget exhausted ($ELAPSED >= $TIME_BUDGET seconds)"
          break 2
        fi
      fi
      if [ -n "${IMPROVE_DRY_RUN:-}" ]; then
        log "[DRY RUN] Would run claude session for $TOPIC (iter $ITER)"
        TOPIC_IMPROVED=$((TOPIC_IMPROVED + 1))
        continue
      fi
      TS=$(timestamp)
      LOGFILE="$LOG_DIR/loop_improve_${TOPIC}-${TS}.log"
      TRACEFILE="$LOG_DIR/trace_improve_${TOPIC}-${TS}.jsonl"
      TAG="improve/${TOPIC}/iter-${ITER}/pre"
      git tag -f "$TAG"
      write_improve_status "running" "$TOPIC" "$ITER"
      ln -sf "$(basename "$TRACEFILE")" "$LOG_DIR/.latest"
      log "Iteration $ITER/$MAX_ITERS for $TOPIC"

      PROMPT=$(build_improve_prompt "$TOPIC")
      claude --dangerously-skip-permissions --permission-mode auto --model "$MODEL" --output-format stream-json --verbose \
        -p "$PROMPT" 2>/dev/null | tee "$TRACEFILE" | extract_text > "$LOGFILE" || true
      MARKER=$(detect_improve_marker "$LOGFILE" "$TRACEFILE")
`, opts.maxIters, opts.timeBudget)
}

func improveMainLoopBody() string {
	return `
      case "$MARKER" in
        (improved)
          log "Topic $TOPIC improved (iter $ITER)"
          TOPIC_IMPROVED=$((TOPIC_IMPROVED + 1))
          CONSECUTIVE_NO_IMPROVE=0
          git tag -d "$TAG" 2>/dev/null || true
          ;;
        (no_improvement)
          log "Topic $TOPIC: no improvement (iter $ITER), reverting"
          git reset --hard "$TAG"
          git clean -fd -e "$LOG_DIR/" 2>/dev/null || true
          git tag -d "$TAG" 2>/dev/null || true
          CONSECUTIVE_NO_IMPROVE=$((CONSECUTIVE_NO_IMPROVE + 1))
          if [ $CONSECUTIVE_NO_IMPROVE -ge 2 ]; then
            log "Diminishing returns for $TOPIC, moving on"
            break
          fi
          ;;
        (failed|*)
          log "Topic $TOPIC failed (iter $ITER), reverting"
          git reset --hard "$TAG"
          git clean -fd -e "$LOG_DIR/" 2>/dev/null || true
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
  done

  TOTAL_DURATION=$(( $(date +%s) - IMPROVE_START ))
  write_improve_status "idle"
  log "Improve loop finished. Improvements: $IMPROVED_COUNT, Failed topics: $FAILED_TOPICS, Skipped: $SKIPPED_TOPICS"
  IMPROVE_RESULT=$( [ $FAILED_TOPICS -eq 0 ] && echo 0 || echo 1 )
fi
fi
`
}

func improvePhaseFooter() string {
	return `
fi
[ $FAILED_COUNT -eq 0 ] && [ "${IMPROVE_RESULT:-0}" -eq 0 ] && exit 0 || exit 1
`
}
