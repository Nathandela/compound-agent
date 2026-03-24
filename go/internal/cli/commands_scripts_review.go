package cli

import (
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/util"
)

// validLoopReviewerSet returns a map of valid reviewer names for validation.
func validLoopReviewerSet() map[string]bool {
	return map[string]bool{
		"claude-sonnet": true,
		"claude-opus":   true,
		"gemini":        true,
		"codex":         true,
	}
}

// validLoopReviewerNames returns the valid reviewer names as a slice.
func validLoopReviewerNames() []string {
	return []string{"claude-sonnet", "claude-opus", "gemini", "codex"}
}

// loopReviewOptions holds review-phase configuration for the loop script.
type loopReviewOptions struct {
	reviewers       []string
	maxReviewCycles int
	reviewBlocking  bool
	reviewModel     string
	reviewEvery     int
}

// loopImproveOptions holds improve-phase configuration for the loop script.
type loopImproveOptions struct {
	maxIters   int
	timeBudget int // seconds, 0 = unlimited
}

// validateReviewers checks that all reviewer names are valid.
func validateReviewers(reviewers []string) error {
	valid := validLoopReviewerSet()
	for _, r := range reviewers {
		if !valid[r] {
			return fmt.Errorf("invalid reviewer %q, valid: %s", r, strings.Join(validLoopReviewerNames(), ", "))
		}
	}
	return nil
}

// loopScriptReviewTriggers returns three bash code fragments that splice review calls
// into the main loop: initialization, periodic trigger (after each completed epic),
// and final trigger (after the loop exits).
func loopScriptReviewTriggers(reviewEvery int) (init, periodic, final string) {
	usePeriodic := reviewEvery > 0

	init = "\nREVIEW_BASE_SHA=$(git rev-parse HEAD)\n"
	if usePeriodic {
		init += "COMPLETED_SINCE_REVIEW=0\n"
	}

	if usePeriodic {
		periodic = fmt.Sprintf(`
    COMPLETED_SINCE_REVIEW=$((COMPLETED_SINCE_REVIEW + 1))
    if [ "$COMPLETED_SINCE_REVIEW" -ge %d ]; then
      REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
      run_review_phase "periodic" || log "WARN: review phase (periodic) failed, continuing"
      COMPLETED_SINCE_REVIEW=0
      REVIEW_BASE_SHA=$(git rev-parse HEAD)
    fi
`, reviewEvery)
	}

	if usePeriodic {
		final = `
if [ "$COMPLETED_SINCE_REVIEW" -gt 0 ]; then
  REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
  run_review_phase "final" || log "WARN: review phase (final) failed, continuing"
fi
`
	} else {
		final = `
if [ "$COMPLETED" -gt 0 ]; then
  REVIEW_DIFF_RANGE="$REVIEW_BASE_SHA..HEAD"
  run_review_phase "final" || log "WARN: review phase (final) failed, continuing"
fi
`
	}
	return init, periodic, final
}

// loopScriptReviewConfig returns the review phase config section of the loop script.
func loopScriptReviewConfig(opts loopReviewOptions) string {
	escapedModel := util.ShellEscape(opts.reviewModel)
	reviewerList := strings.Join(opts.reviewers, " ")
	escapedReviewers := util.ShellEscape(reviewerList)
	blocking := "false"
	if opts.reviewBlocking {
		blocking = "true"
	}

	return fmt.Sprintf(`
# Review phase config
REVIEW_EVERY=%d
MAX_REVIEW_CYCLES=%d
REVIEW_BLOCKING=%s
REVIEW_MODEL=%s
REVIEW_REVIEWERS=%s
REVIEW_DIR="$LOG_DIR/reviews"
REVIEW_TIMEOUT=${REVIEW_TIMEOUT:-600}

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
`, opts.reviewEvery, opts.maxReviewCycles, blocking, escapedModel, escapedReviewers)
}

// loopScriptReviewerDetection returns the reviewer CLI detection function.
func loopScriptReviewerDetection() string { //nolint:funlen // bash template string
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
  AVAILABLE_REVIEWERS="${AVAILABLE_REVIEWERS# }"
  log "Configured reviewers: $REVIEW_REVIEWERS"
  if [ -z "$AVAILABLE_REVIEWERS" ]; then
    log "WARN: No reviewer CLIs available, skipping review phase"
    return 1
  fi
  log "Available reviewers: $AVAILABLE_REVIEWERS"
  # Log unavailable reviewers for diagnostics
  for r in $REVIEW_REVIEWERS; do
    case " $AVAILABLE_REVIEWERS " in
      (*" $r "*) ;;
      (*) log "WARN: $r configured but unavailable" ;;
    esac
  done
  return 0
}
`
}

// loopScriptSessionIDManagement returns the session ID init function for Claude reviewers.
func loopScriptSessionIDManagement() string {
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
          existing=$(cat "$sessions_file" | jq -r ".[\"$reviewer\"] // empty" 2>/dev/null)
        else
          existing=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get(sys.argv[2], ''))" "$sessions_file" "$reviewer" 2>/dev/null || echo "")
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
              log "WARN: jq failed to update sessions.json for $reviewer"
            fi
          else
            python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
d[sys.argv[2]] = sys.argv[3]
json.dump(d, open(sys.argv[1], 'w'))" "$sessions_file" "$reviewer" "$sid" 2>/dev/null || true
          fi
        fi
        ;;
    esac
  done
}
`
}

// loopScriptReviewPrompt returns the build_review_prompt function.
func loopScriptReviewPrompt() string {
	return `
build_review_prompt() {
  local diff_range="${1:-HEAD~1..HEAD}"
  local beads_context
  beads_context=$(bd list --status=closed --limit=20 2>/dev/null || echo "(no beads)")
  local commit_log
  commit_log=$(git log --oneline "$diff_range" 2>/dev/null | head -20 || echo "(no commits)")

  printf '%s\n' "You are reviewing code changes made by an autonomous agent loop."
  printf '\n## Recently Completed Epics/Tasks\n'
  echo "$beads_context"
  printf '\n## Commits in scope\n'
  echo "$commit_log"
  cat <<'REVIEW_PROMPT'

## Your job
Review the code that was changed by those commits. Use git, read files, and
explore the codebase yourself to understand what was done.

Review for: correctness, security, edge cases, code quality.
Provide a numbered list of findings with severity (P0/P1/P2/P3).
Be concise, actionable, no praise.

If everything looks good: output REVIEW_APPROVED on its own line.
If changes needed: output REVIEW_CHANGES_REQUESTED then your findings.
REVIEW_PROMPT
}
`
}

// loopScriptReadSessionID returns the read_session_id helper function.
func loopScriptReadSessionID() string {
	return `
read_session_id() {
  local reviewer="$1" sessions_file="$2"
  if [ "$HAS_JQ" = true ]; then
    cat "$sessions_file" | jq -r ".[\"$reviewer\"] // empty" 2>/dev/null
  else
    python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
print(d.get(sys.argv[2], ''))" "$sessions_file" "$reviewer" 2>/dev/null || echo ""
  fi
}
`
}

// loopScriptSpawnReviewers returns the spawn_reviewers function.
func loopScriptSpawnReviewers() string { //nolint:funlen // bash template string
	return loopScriptReadSessionID() + `
spawn_reviewers() {
  local cycle="$1" cycle_dir="$2"
  local prompt
  prompt=$(build_review_prompt "$REVIEW_DIFF_RANGE")

  local prompt_file="$cycle_dir/review-prompt.txt"
  echo "$prompt" > "$prompt_file"

  local follow_up="Review the latest fixes. If all issues are resolved, output REVIEW_APPROVED alone on its own line. Otherwise output REVIEW_CHANGES_REQUESTED on its own line followed by your findings."

  local pids=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    case "$reviewer" in
      (claude-sonnet|claude-opus)
        local model_name
        if [ "$reviewer" = "claude-sonnet" ]; then model_name="claude-sonnet-4-6"
        else model_name="claude-opus-4-6[1m]"; fi
        local sid=""
        sid=$(read_session_id "$reviewer" "$REVIEW_DIR/sessions.json")
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" \
            --output-format text --session-id "$sid" \
            -p "$(cat "$prompt_file")" > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" \
            --output-format text --resume "$sid" \
            -p "$follow_up" > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
      (gemini)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" gemini \
            -p "$(cat "$prompt_file")" --yolo > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" gemini --resume latest \
            -p "$follow_up" --yolo > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
      (codex)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" codex exec --full-auto \
            - < "$prompt_file" > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" codex exec resume --last \
            "$follow_up" > "$report" 2>&1 || true) &
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
`
}

// loopScriptImplementerPhase returns the feed_implementer function.
func loopScriptImplementerPhase() string {
	return `
feed_implementer() {
  local cycle_dir="$1"
  local implementer_report="$cycle_dir/implementer.md"

  local prompt_file="$cycle_dir/implementer-prompt.md"
  cat > "$prompt_file" <<'IMPL_PROMPT_HEADER'
You received feedback from independent code reviewers. Analyze and implement all fixes.

First, load your context:
` + "```bash" + `
npx ca load-session
` + "```" + `

IMPL_PROMPT_HEADER

  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    if [ -s "$report" ]; then
      printf '<%s-review>\n' "$reviewer" >> "$prompt_file"
      cat "$report" >> "$prompt_file"
      printf '</%s-review>\n\n' "$reviewer" >> "$prompt_file"
    fi
  done

  cat >> "$prompt_file" <<'IMPL_PROMPT_FOOTER'

Fix ALL P0 and P1 findings. Address P2 where reasonable. Commit fixes.
Run tests to verify. Output FIXES_APPLIED when done.
IMPL_PROMPT_FOOTER

  local impl_prompt
  impl_prompt=$(cat "$prompt_file")

  log "Running implementer session (prompt: $prompt_file)..."
  local impl_start
  impl_start=$(date +%s)
  portable_timeout "$REVIEW_TIMEOUT" claude --model "$REVIEW_MODEL" --output-format text \
         --dangerously-skip-permissions \
         -p "$impl_prompt" > "$implementer_report" 2>&1 || true
  local impl_duration=$(( $(date +%s) - impl_start ))
  log "Implementer session complete (${impl_duration}s)"
}
`
}

// loopScriptReviewLoop returns the run_review_phase function (composed from sub-sections).
func loopScriptReviewLoop() string {
	return loopScriptReviewLoopInit() + loopScriptReviewLoopCycle()
}

func loopScriptReviewLoopInit() string {
	return `
run_review_phase() {
  local trigger="$1"
  local review_start
  review_start=$(date +%s)
  log "=========================================="
  log "Starting review phase (trigger: $trigger)"
  log "=========================================="
  if [ -z "${REVIEW_DIFF_RANGE:-}" ]; then
    log "WARN: REVIEW_DIFF_RANGE not set, using HEAD~1..HEAD"
    REVIEW_DIFF_RANGE="HEAD~1..HEAD"
  fi
  local commit_count
  commit_count=$(git log --oneline "$REVIEW_DIFF_RANGE" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${commit_count:-0}" -eq 0 ]; then
    log "No commits in range $REVIEW_DIFF_RANGE, skipping review phase"
    return 0
  fi
  detect_reviewers || return 0
  mkdir -p "$REVIEW_DIR"
  echo "{}" > "$REVIEW_DIR/sessions.json"
  local cycle=1
`
}

func loopScriptReviewLoopCycle() string { //nolint:funlen // bash template string
	return `  while [ "$cycle" -le "$MAX_REVIEW_CYCLES" ]; do
    local cycle_dir="$REVIEW_DIR/cycle-$cycle"
    mkdir -p "$cycle_dir"
    init_review_sessions "$cycle_dir"
    log "Review cycle $cycle/$MAX_REVIEW_CYCLES -- spawning reviewers..."
    local spawn_start
    spawn_start=$(date +%s)
    spawn_reviewers "$cycle" "$cycle_dir"
    local spawn_duration=$(( $(date +%s) - spawn_start ))
    log "Reviewers completed in ${spawn_duration}s"
    local all_approved=true
    local reviewers_with_findings=0
    local reviewers_errored=0
    for reviewer in $AVAILABLE_REVIEWERS; do
      local report="$cycle_dir/$reviewer.md"
      if [ ! -s "$report" ]; then
        log "$reviewer: NO OUTPUT (empty report -- likely crashed or timed out)"
        reviewers_errored=$((reviewers_errored + 1))
      elif tr -d '\r' < "$report" | grep -q "^REVIEW_APPROVED$"; then
        log "$reviewer: APPROVED"
      elif grep -qi "rate limit\|Rate limit\|API.*[Ee]rror\|API_KEY\|GEMINI_API_KEY\|authentication" "$report"; then
        log "$reviewer: ERROR (API/auth issue, not a code review rejection)"
        log "  -> $(head -1 "$report")"
        reviewers_errored=$((reviewers_errored + 1))
      else
        log "$reviewer: CHANGES_REQUESTED"
        all_approved=false
        reviewers_with_findings=$((reviewers_with_findings + 1))
        local p0_count p1_count
        p0_count=$(grep -co "P0" "$report" 2>/dev/null | awk '{s+=$1} END{print s+0}')
        p1_count=$(grep -co "P1" "$report" 2>/dev/null | awk '{s+=$1} END{print s+0}')
        if [ "${p0_count:-0}" -gt 0 ] || [ "${p1_count:-0}" -gt 0 ]; then
          log "  -> ${p0_count} P0, ${p1_count} P1 findings"
        fi
      fi
    done
    if [ "$all_approved" = true ]; then
      log "All reviewers approved (cycle $cycle)"
      return 0
    fi
    if [ "$reviewers_with_findings" -eq 0 ]; then
      log "No actual code findings -- all rejections were errors. Treating as approved."
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
  local review_duration=$(( $(date +%s) - review_start ))
  log "Review phase ended after $MAX_REVIEW_CYCLES cycles without full approval (${review_duration}s)"
  if [ "$REVIEW_BLOCKING" = true ]; then
    log "FATAL: Review blocking enabled, exiting"
    exit 1
  fi
  log "Review non-blocking: continuing to next epic"
}
`
}
