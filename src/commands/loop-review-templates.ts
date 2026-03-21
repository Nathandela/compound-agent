/**
 * Bash script templates for the loop review phase.
 * Pure functions that return bash script fragments for multi-model review.
 */

export interface ReviewConfigOptions {
  reviewers: string[];
  maxReviewCycles: number;
  reviewBlocking: boolean;
  reviewModel: string;
  reviewEvery: number;
}

export function buildReviewConfig(options: ReviewConfigOptions): string {
  return `
# Review phase config
REVIEW_EVERY=${options.reviewEvery}
MAX_REVIEW_CYCLES=${options.maxReviewCycles}
REVIEW_BLOCKING=${options.reviewBlocking}
REVIEW_MODEL="${options.reviewModel}"
REVIEW_REVIEWERS="${options.reviewers.join(' ')}"
REVIEW_DIR="$LOG_DIR/reviews"
REVIEW_TIMEOUT=\${REVIEW_TIMEOUT:-600}

# Portable timeout: GNU timeout -> gtimeout (macOS Homebrew) -> shell fallback
portable_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
  else
    "$@" &
    local pid=$!
    ( sleep "$secs" && kill "$pid" 2>/dev/null ) &
    local watchdog=$!
    wait "$pid" 2>/dev/null
    local rc=$?
    kill "$watchdog" 2>/dev/null
    wait "$watchdog" 2>/dev/null
    return $rc
  fi
}
`;
}

export function buildReviewerDetection(): string {
  return `
detect_reviewers() {
  AVAILABLE_REVIEWERS=""
  for reviewer in $REVIEW_REVIEWERS; do
    case "$reviewer" in
      (claude-sonnet|claude-opus)
        if ! command -v claude >/dev/null 2>&1; then
          log "WARN: claude CLI not found, skipping $reviewer"
        elif ! portable_timeout 10 claude --version >/dev/null 2>&1; then
          log "WARN: claude CLI not healthy, skipping $reviewer (health check failed)"
        else
          AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS $reviewer"
        fi
        ;;
      (gemini)
        if ! command -v gemini >/dev/null 2>&1; then
          log "WARN: gemini CLI not found, skipping gemini"
        elif ! portable_timeout 10 gemini --version >/dev/null 2>&1; then
          log "WARN: gemini CLI not healthy, skipping gemini (health check failed)"
        else
          AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS gemini"
        fi
        ;;
      (codex)
        if ! command -v codex >/dev/null 2>&1; then
          log "WARN: codex CLI not found, skipping codex"
        elif ! portable_timeout 10 codex --version >/dev/null 2>&1; then
          log "WARN: codex CLI not healthy, skipping codex (health check failed)"
        else
          AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS codex"
        fi
        ;;
    esac
  done
  AVAILABLE_REVIEWERS="\${AVAILABLE_REVIEWERS# }"
  if [ -z "$AVAILABLE_REVIEWERS" ]; then
    log "WARN: No reviewer CLIs available, skipping review phase"
    return 1
  fi
  log "Available reviewers: $AVAILABLE_REVIEWERS"
  return 0
}
`;
}

export function buildSessionIdManagement(): string {
  return `
init_review_sessions() {
  local cycle_dir="$1"
  mkdir -p "$cycle_dir"
  local sessions_file="$REVIEW_DIR/sessions.json"
  if [ ! -f "$sessions_file" ]; then
    echo "{}" > "$sessions_file"
  fi
  for reviewer in $AVAILABLE_REVIEWERS; do
    case "$reviewer" in
      (claude-sonnet|claude-opus)
        local existing=""
        if [ "$HAS_JQ" = true ]; then
          # cat pipe avoids jq file-arg open() which fails under seccomp sandbox
          existing=$(cat "$sessions_file" | jq -r ".[\\"$reviewer\\"] // empty" 2>/dev/null)
        else
          existing=$(python3 -c "
import json, sys
d = json.load(open('$sessions_file'))
print(d.get('$reviewer', ''))" 2>/dev/null || echo "")
        fi
        if [ -z "$existing" ]; then
          local sid
          sid=$(uuidgen | tr '[:upper:]' '[:lower:]')
          if [ "$HAS_JQ" = true ]; then
            local tmp
            tmp=$(cat "$sessions_file" | jq --arg k "$reviewer" --arg v "$sid" '. + {($k): $v}' 2>/dev/null)
            if [ -n "$tmp" ]; then
              echo "$tmp" > "$sessions_file"
            else
              log "WARN: jq failed to update sessions.json for $reviewer (session ID may not persist)"
            fi
          else
            python3 -c "
import json
d = json.load(open('$sessions_file'))
d['$reviewer'] = '$sid'
json.dump(d, open('$sessions_file', 'w'))" 2>/dev/null || true
          fi
        fi
        ;;
    esac
  done
}
`;
}

export function buildReviewPrompt(): string {
  return `
build_review_prompt() {
  local diff_range="\${1:-HEAD~1..HEAD}"
  local diff_content
  diff_content=$(git diff "$diff_range" 2>/dev/null || echo "(no diff)")
  if [ -z "$diff_content" ]; then diff_content="(empty diff)"; fi
  local beads_context
  beads_context=$(bd list --status=closed --limit=20 2>/dev/null || echo "(no beads)")
  cat <<REVIEW_PROMPT_EOF
You are reviewing code changes made by an autonomous agent loop.

## Completed Beads
$beads_context

## Git Diff
\`\`\`diff
$diff_content
\`\`\`

Review for: correctness, security, edge cases, code quality.
Provide a numbered list of findings with severity (P0/P1/P2/P3).
Be concise, actionable, no praise.

If everything looks good: output REVIEW_APPROVED on its own line.
If changes needed: output REVIEW_CHANGES_REQUESTED then your findings.
REVIEW_PROMPT_EOF
}
`;
}

export function buildSpawnReviewers(): string {
  return `
read_session_id() {
  local reviewer="$1" sessions_file="$2"
  if [ "$HAS_JQ" = true ]; then
    cat "$sessions_file" | jq -r ".[\\"$reviewer\\"] // empty" 2>/dev/null
  else
    python3 -c "
import json
d = json.load(open('$sessions_file'))
print(d.get('$reviewer', ''))" 2>/dev/null || echo ""
  fi
}

spawn_reviewers() {
  local cycle="$1" cycle_dir="$2"
  local prompt
  prompt=$(build_review_prompt "$REVIEW_DIFF_RANGE")
  local pids=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    case "$reviewer" in
      (claude-sonnet|claude-opus)
        local model_name
        if [ "$reviewer" = "claude-sonnet" ]; then model_name="claude-sonnet-4-6[1m]"
        else model_name="claude-opus-4-6[1m]"; fi
        local sid=""
        sid=$(read_session_id "$reviewer" "$REVIEW_DIR/sessions.json")
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" --output-format text \
                  --session-id "$sid" -p "$prompt" > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" --output-format text \
                  --resume "$sid" \
                  -p "Review the latest fixes. If all issues are resolved, output REVIEW_APPROVED alone on its own line. Otherwise output REVIEW_CHANGES_REQUESTED on its own line followed by your findings." \
                  > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
      (gemini)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" gemini -p "$prompt" -y > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" gemini --resume latest \
                  -p "Review the latest fixes. If all issues are resolved, output REVIEW_APPROVED alone on its own line. Otherwise output REVIEW_CHANGES_REQUESTED on its own line followed by your findings." \
                  > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
      (codex)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" codex exec "$prompt" > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" codex exec resume --last > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
    esac
    log "Spawned $reviewer (cycle $cycle) -> $report"
  done
  log "Waiting for reviewers: $pids"
  for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  log "All reviewers finished (cycle $cycle)"
}
`;
}

export function buildImplementerPhase(): string {
  return `
feed_implementer() {
  local cycle_dir="$1"
  local implementer_report="$cycle_dir/implementer.md"
  local review_sections=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    if [ -s "$report" ]; then
      review_sections="$review_sections
<$reviewer-review>
$(cat "$report")
</$reviewer-review>
"
    fi
  done
  local impl_prompt
  impl_prompt=$(cat <<IMPL_PROMPT_EOF
You received feedback from independent code reviewers. Analyze and implement all fixes.

First, load your context:
\`\`\`bash
npx ca load-session
\`\`\`

$review_sections

Fix ALL P0 and P1 findings. Address P2 where reasonable. Commit fixes.
Run tests to verify. Output FIXES_APPLIED when done.
IMPL_PROMPT_EOF
)
  log "Running implementer session..."
  portable_timeout "$REVIEW_TIMEOUT" claude --model "$REVIEW_MODEL" --output-format text \
         --dangerously-skip-permissions \
         -p "$impl_prompt" > "$implementer_report" 2>&1 || true
  log "Implementer session complete"
}
`;
}

export function buildReviewLoop(): string {
  return `
run_review_phase() {
  local trigger="$1"
  log "Starting review phase (trigger: $trigger)"
  if [ -z "\${REVIEW_DIFF_RANGE:-}" ]; then
    log "WARN: REVIEW_DIFF_RANGE not set, using HEAD~1..HEAD"
    REVIEW_DIFF_RANGE="HEAD~1..HEAD"
  fi
  local diff_output
  diff_output=$(git diff "$REVIEW_DIFF_RANGE" 2>/dev/null || echo "")
  if [ -z "$diff_output" ]; then
    log "Empty git diff, skipping review phase"
    return 0
  fi
  detect_reviewers || return 0
  mkdir -p "$REVIEW_DIR"
  local cycle=1
  while [ "$cycle" -le "$MAX_REVIEW_CYCLES" ]; do
    local cycle_dir="$REVIEW_DIR/cycle-$cycle"
    mkdir -p "$cycle_dir"
    init_review_sessions "$cycle_dir"
    log "Review cycle $cycle/$MAX_REVIEW_CYCLES"
    spawn_reviewers "$cycle" "$cycle_dir"
    local all_approved=true
    for reviewer in $AVAILABLE_REVIEWERS; do
      local report="$cycle_dir/$reviewer.md"
      if [ -s "$report" ] && tr -d '\\r' < "$report" | grep -q "^REVIEW_APPROVED$"; then
        log "$reviewer: APPROVED"
      else
        log "$reviewer: CHANGES_REQUESTED (or no report)"
        all_approved=false
      fi
    done
    if [ "$all_approved" = true ]; then
      log "All reviewers approved (cycle $cycle)"
      return 0
    fi
    if [ "$cycle" -lt "$MAX_REVIEW_CYCLES" ]; then
      feed_implementer "$cycle_dir"
      local impl_report="$cycle_dir/implementer.md"
      if [ -s "$impl_report" ] && ! grep -q "FIXES_APPLIED" "$impl_report"; then
        log "WARN: Implementer did not output FIXES_APPLIED marker"
      fi
    fi
    cycle=$((cycle + 1))
  done
  log "Review phase ended after $MAX_REVIEW_CYCLES cycles without full approval"
  if [ "$REVIEW_BLOCKING" = true ]; then
    log "FATAL: Review blocking enabled, exiting"
    exit 1
  fi
}
`;
}
