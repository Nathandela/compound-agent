package cli

import (
	"fmt"
	"strings"

	"github.com/nathandelacretaz/compound-agent/internal/util"
)

// validLoopReviewerSet returns a map of valid reviewer names for validation.
// agy is the functional CLI-direct reviewer that replaced the removed gemini
// reviewer: the Antigravity CLI (agy) captures stdout in non-TTY/subprocess, so its
// report is real (unlike the old dead antigravity groundwork). The legacy gemini
// and antigravity reviewer names are no longer valid.
func validLoopReviewerSet() map[string]bool {
	return map[string]bool{
		"claude-sonnet": true,
		"claude-opus":   true,
		"agy":           true,
		"codex":         true,
	}
}

// validLoopReviewerNames returns the valid reviewer names as a slice.
func validLoopReviewerNames() []string {
	return []string{"claude-sonnet", "claude-opus", "agy", "codex"}
}

// loopReviewOptions holds review-phase configuration for the loop script.
type loopReviewOptions struct {
	reviewers       []string
	maxReviewCycles int
	reviewBlocking  bool
	reviewModel     string
	reviewEvery     int
	// reviewModels pins a goose fleet reviewer (security/correctness/quality) to
	// its own provider/model ref, making the open-model fleet heterogeneous. An
	// absent entry means the reviewer inherits the exported GOOSE_PROVIDER/MODEL.
	reviewModels map[string]string
}

// parseGooseReviewModels parses a --review-models value of the form
// "security=ollama/qwen2.5-coder:14b,quality=glm/glm-4-plus" into a
// reviewer->provider/model map. Each reviewer must be a valid goose fleet
// reviewer and each value must be a non-empty provider/model ref.
func parseGooseReviewModels(raw string) (map[string]string, error) {
	out := make(map[string]string)
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		reviewer, ref, ok := strings.Cut(item, "=")
		reviewer = strings.TrimSpace(reviewer)
		ref = strings.TrimSpace(ref)
		if !ok || reviewer == "" || ref == "" {
			return nil, fmt.Errorf("invalid --review-models entry %q, expected reviewer=provider/model", item)
		}
		if _, valid := gooseReviewerRecipe[reviewer]; !valid {
			return nil, fmt.Errorf("invalid goose reviewer %q in --review-models, valid: %s", reviewer, strings.Join(validGooseReviewerNames(), ", "))
		}
		if provider, model, slash := strings.Cut(ref, "/"); !slash || provider == "" || model == "" {
			return nil, fmt.Errorf("--review-models %q requires a provider/model ref (e.g. ollama/qwen2.5-coder:14b), got %q", reviewer, ref)
		}
		out[reviewer] = ref
	}
	return out, nil
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

// validCodexAgyReviewerSet returns the reviewer names valid when the loop
// implementer is codex or agy. These engines redefine the agent_invoke shell
// function to run codex/agy (NOT claude), so the claude-sonnet/claude-opus
// reviewer branches -- which dispatch through agent_invoke -- would run the wrong
// CLI with a claude-only model name, yielding empty/error reports and a review
// cycle that can pass without a real review (codex review P2). Only the agy and
// codex reviewer branches invoke their own CLIs directly and are safe, so the
// valid set is exactly {agy, codex}.
func validCodexAgyReviewerSet() map[string]bool {
	return map[string]bool{"agy": true, "codex": true}
}

// validCodexAgyReviewerNames returns the valid codex/agy reviewer names in
// stable order (for error messages).
func validCodexAgyReviewerNames() []string {
	return []string{"agy", "codex"}
}

// validateCodexAgyReviewers checks that every reviewer is a CLI-direct reviewer
// safe for the codex/agy implementers (i.e. in {agy, codex}). claude-sonnet
// and claude-opus are rejected because their dispatch goes through agent_invoke,
// which on these seams runs codex/agy rather than claude.
func validateCodexAgyReviewers(reviewers []string) error {
	valid := validCodexAgyReviewerSet()
	for _, r := range reviewers {
		if !valid[r] {
			return fmt.Errorf("invalid reviewer %q for codex/agy implementer, valid: %s", r, strings.Join(validCodexAgyReviewerNames(), ", "))
		}
	}
	return nil
}

// gooseReviewerRecipe maps a goose fleet reviewer specialty to its subrecipe
// name (the .yaml installed under .goose/recipes/). The keys are also the valid
// reviewer names for `--implementer goose --reviewers`.
var gooseReviewerRecipe = map[string]string{
	"security":    "review-security",
	"correctness": "review-correctness",
	"quality":     "review-quality",
}

// validGooseReviewerNames returns the valid goose fleet reviewer names in stable
// order (matching the installed subrecipes).
func validGooseReviewerNames() []string {
	return []string{"security", "correctness", "quality"}
}

// validateGooseReviewers checks that all reviewer names map to an installed
// open-model review-fleet subrecipe.
func validateGooseReviewers(reviewers []string) error {
	for _, r := range reviewers {
		if _, ok := gooseReviewerRecipe[r]; !ok {
			return fmt.Errorf("invalid goose reviewer %q, valid: %s", r, strings.Join(validGooseReviewerNames(), ", "))
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
      (agy)
        if ! command -v agy >/dev/null 2>&1; then
          log "WARN: agy CLI not found, skipping agy"
        elif ! portable_timeout 10 agy --version >/dev/null 2>&1; then
          log "WARN: agy CLI not healthy, skipping agy (health check failed)"
        else
          AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS agy"
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
// Under the p backend: pre-generates a UUID per reviewer (stored in sessions.json).
// Under the bg backend: initialises an empty slot; the real .sessionId is captured
// from state.json after cycle-1 dispatch (spike G1: --bg ignores --session-id).
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
        # p backend: pre-generate a UUID if not already set.
        # bg backend: leave slot empty; cycle-1 dispatch captures the bg-assigned .sessionId.
        if [ "$CA_BACKEND" = "p" ]; then
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
        fi
        # bg backend: slot stays empty until cycle-1 bg_dispatch_reviewer writes the .sessionId.
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

// loopScriptBgReviewHelpers returns the three bg-reviewer helper functions:
//   - bg_dispatch_reviewer: dispatches claude --bg for a reviewer, captures short id,
//     reads .sessionId from state.json, persists in sessions.json, writes pre-dispatch
//     worktree snapshot (T3/T4 invariant: structural check precedes every claude rm).
//   - bg_poll_reviewer: polls state.json to terminal (same defensive set as agent_poll; S12 guard).
//   - bg_collect_reviewer: reads .output/.detail from state.json into the report file;
//     checks for worktree commits before teardown (T3/T4 invariant); only claude rm when safe.
func loopScriptBgReviewHelpers() string { //nolint:funlen // bash template string
	return `
# --- bg reviewer helpers (R-REVIEW, R-FLEET) ---
# Reviewer bg sessions are advisory: --bg always auto-creates a worktree even for
# read-only sessions. bg_collect_reviewer performs a structural worktree-commit check
# before every claude rm (T3/T4 invariant): if the reviewer committed, skip rm and
# log HUMAN_REQUIRED instead of silently destroying work.
#
# Safe-default invariant: if the pre-dispatch snapshot file is missing (e.g. a future
# dispatch path forgot to write one), bg_collect_reviewer does NOT fall through to
# claude rm. Instead it calls claude stop (safe) and logs HUMAN_REQUIRED, leaving the
# session for human inspection. claude rm is only invoked when a snapshot exists AND
# the worktree-commit check confirms no commits were made.

# _bg_snapshot_worktrees <short_id> <pre_snapshot>
# Writes the pre-dispatch worktree snapshot to .ca-worktree-snapshots/<short_id>.txt.
# <pre_snapshot> must be captured BEFORE the claude --bg dispatch (git worktree list
# output at that moment). <short_id> is parsed from the dispatch output afterwards.
# Used by bg_dispatch_reviewer (cycle 1) and the cycle-2+ resume path to ensure every
# bg session handle has a snapshot so bg_collect_reviewer can verify worktree safety.
# No-op (|| true throughout) so set -e safe; must be called inside a function (T2).
_bg_snapshot_worktrees() {
  local _sid="$1" _pre="$2"
  local _snap_dir
  _snap_dir="$(git rev-parse --show-toplevel 2>/dev/null || true)/.ca-worktree-snapshots"
  if [ -n "$_snap_dir" ] && [ "$_snap_dir" != "/.ca-worktree-snapshots" ]; then
    mkdir -p "$_snap_dir" 2>/dev/null || true
    printf '%s\n' "$_pre" > "$_snap_dir/$_sid.txt" 2>/dev/null || true
  fi
}

# bg_dispatch_reviewer <reviewer> <model> <prompt_file> <sessions_file>
# Dispatches claude --bg for a reviewer (cycle 1: no --session-id per spike G1).
# Parses the 8-hex short id, reads .sessionId from state.json, persists in sessions.json.
# Writes a pre-dispatch worktree snapshot (T3 infra) keyed to short_id so that
# bg_collect_reviewer can identify the session's worktree via set-diff.
# Sets BG_REVIEWER_HANDLE_<reviewer_safe> to the short id.
bg_dispatch_reviewer() {
  local reviewer="$1" model="$2" prompt_file="$3" sessions_file="$4"
  # Dispatch claude --bg (no --session-id: spike G1 shows --bg ignores it).
  # Snapshot BEFORE dispatch so the pre-dispatch state is captured (T3 infra).
  local raw_output
  # NOTE: _bg_snapshot_worktrees is called before dispatch to capture pre-launch state.
  local pre_snapshot
  pre_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
  raw_output=$(claude --bg \
    --dangerously-skip-permissions \
    --permission-mode auto \
    --model "$model" \
    "$(cat "$prompt_file")" 2>&1 || true)
  # Strip ANSI; extract 8-hex short id from "backgrounded · <id>".
  local short_id
  short_id=$(printf '%s' "$raw_output" | sed 's/\x1b\[[0-9;]*m//g' | \
    grep -oE 'backgrounded[[:space:]]*[·•][[:space:]]*([0-9a-f]{8})' | \
    grep -oE '[0-9a-f]{8}' | head -1 || true)
  if [ -z "$short_id" ] || ! printf '%s' "$short_id" | grep -qE '^[0-9a-f]{8}$'; then
    log "WARN: bg reviewer dispatch failed for $reviewer: could not parse short id"
    return 1
  fi
  # Read the full .sessionId from state.json (bg assigns its own session id).
  local state_file="$HOME/.claude/jobs/$short_id/state.json"
  local session_id=""
  local deadline=$(( $(date +%s) + 10 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ -f "$state_file" ]; then
      if [ "$HAS_JQ" = true ]; then
        session_id=$(jq -r '.sessionId // empty' "$state_file" 2>/dev/null || true)
      else
        session_id=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('sessionId','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
      fi
      [ -n "$session_id" ] && break
    fi
    sleep 1
  done
  # Persist sessionId in sessions.json for cycle 2+ resume.
  if [ -n "$session_id" ]; then
    if [ "$HAS_JQ" = true ]; then
      local tmp
      tmp=$(cat "$sessions_file" | jq --arg k "$reviewer" --arg v "$session_id" '. + {($k): $v}' 2>/dev/null)
      [ -n "$tmp" ] && echo "$tmp" > "$sessions_file"
    else
      python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
d[sys.argv[2]] = sys.argv[3]
json.dump(d, open(sys.argv[1], 'w'))" "$sessions_file" "$reviewer" "$session_id" 2>/dev/null || true
    fi
  fi
  # Write pre-dispatch snapshot keyed to short_id (T3 infra: bg_collect_reviewer uses this
  # to identify the reviewer's worktree via set-diff and run the commit-safety check).
  _bg_snapshot_worktrees "$short_id" "$pre_snapshot"
  # Store short id for polling/teardown.
  local safe_reviewer
  safe_reviewer=$(printf '%s' "$reviewer" | tr '-' '_')
  eval "BG_REVIEWER_HANDLE_${safe_reviewer}=$short_id"
  log "bg reviewer dispatched: $reviewer short_id=$short_id session_id=${session_id:-<pending>}"
  return 0
}

# bg_poll_reviewer <short_id> -> "running" | "done"
# Defensive terminal set (S12: unknown/partial state -> running; never false-terminal).
bg_poll_reviewer() {
  local handle="$1"
  local state_file="$HOME/.claude/jobs/$handle/state.json"
  if [ ! -f "$state_file" ]; then
    echo "running"; return 0
  fi
  local state in_flight
  if [ "$HAS_JQ" = true ]; then
    state=$(jq -r '.state // empty' "$state_file" 2>/dev/null || true)
    in_flight=$(jq -r '.inFlight.tasks // 1' "$state_file" 2>/dev/null || echo 1)
  else
    state=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('state','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
    in_flight=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('inFlight',{}).get('tasks',1))
except Exception:
    print(1)
" "$state_file" 2>/dev/null || echo 1)
  fi
  case "$state" in
    done|completed|failed|stopped|error|cancel)
      if [ "${in_flight:-1}" -eq 0 ] 2>/dev/null; then
        echo "done"
      else
        echo "running"
      fi
      ;;
    *) echo "running" ;;
  esac
}

# bg_collect_reviewer <short_id> <report_file>
# Extracts output from state.json .output (then .detail, then transcript) into report_file.
# Tears down the ephemeral reviewer bg session (stop + rm; no harvest needed).
bg_collect_reviewer() {
  local handle="$1" report="$2"
  local state_file="$HOME/.claude/jobs/$handle/state.json"
  local output_text=""
  if [ -f "$state_file" ]; then
    if [ "$HAS_JQ" = true ]; then
      output_text=$(jq -r '
        (.output.result // .output // "") |
        if type == "string" then . else "" end
      ' "$state_file" 2>/dev/null || true)
      if [ -z "$output_text" ]; then
        output_text=$(jq -r '.detail // ""' "$state_file" 2>/dev/null || true)
      fi
      # Transcript fallback if .output/.detail empty.
      if [ -z "$output_text" ]; then
        local link_scan_path
        link_scan_path=$(jq -r '.linkScanPath // ""' "$state_file" 2>/dev/null || true)
        if [ -n "$link_scan_path" ] && [ -f "$link_scan_path" ]; then
          output_text=$(jq -j '
            select(.type == "assistant") |
            .message.content[]? |
            select(.type == "text") |
            .text // empty
          ' "$link_scan_path" 2>/dev/null | tail -c 8192 || true)
        fi
      fi
    else
      output_text=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    o = d.get('output','')
    if isinstance(o, dict):
        o = o.get('result','')
    print(o or d.get('detail','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
    fi
  fi
  printf '%s\n' "$output_text" > "$report"
  # Teardown: structural worktree-commit check before claude rm (T3/T4 invariant).
  # claude --bg ALWAYS auto-creates a worktree; claude rm ALWAYS destroys it.
  # If the reviewer committed (e.g. misbehaved), rm would silently destroy that work.
  # Use the pre-dispatch snapshot (written by bg_dispatch_reviewer / cycle-2+ path) to find the worktree.
  #
  # SAFE DEFAULT: if the snapshot file does not exist (e.g. a dispatch path forgot to write one,
  # or git rev-parse failed), we do NOT fall through to claude rm. Instead we call claude stop
  # (safe: idempotent) and log HUMAN_REQUIRED, leaving the session for human inspection.
  # claude rm is only invoked when: snapshot exists AND worktree-commit check proves no commits.
  claude stop "$handle" 2>/dev/null || true
  local _repo_root _snap_dir _snap_file _pre_wts _cur_wts _has_commits _snap_found
  _repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  _snap_dir="${_repo_root:+$_repo_root/.ca-worktree-snapshots}"
  _snap_file="${_snap_dir:+$_snap_dir/$handle.txt}"
  _pre_wts=""
  _has_commits=false
  _snap_found=false
  if [ -n "$_snap_file" ] && [ -f "$_snap_file" ]; then
    _snap_found=true
    _pre_wts=$(cat "$_snap_file" 2>/dev/null || true)
    _cur_wts=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
    local _wt_path=""
    while IFS= read -r _wt; do
      [ -z "$_wt" ] && continue
      if ! printf '%s\n' "$_pre_wts" | grep -qF "$_wt"; then
        _wt_path="$_wt"
        break
      fi
    done <<COLLECTEOF
$_cur_wts
COLLECTEOF
    if [ -n "$_wt_path" ]; then
      # Worktree found: check for commits ahead of main (reviewer should make none).
      local _base_sha
      _base_sha=$(git rev-parse HEAD 2>/dev/null || true)
      local _ahead
      _ahead=$(git -C "$_wt_path" log "${_base_sha}..HEAD" --oneline 2>/dev/null | head -1 || true)
      if [ -n "$_ahead" ]; then
        _has_commits=true
      fi
    fi
  fi
  if [ "$_has_commits" = true ]; then
    # Snapshot exists and worktree has commits: skip rm, require human inspection.
    local _hr_msg="HUMAN_REQUIRED: reviewer bg session $handle has committed worktree changes — left for inspection (skip claude rm)"
    log "$_hr_msg"
    if [ -n "${HARVEST_LOG:-}" ]; then
      printf '%s\n' "$_hr_msg" >> "${HARVEST_LOG}" 2>/dev/null || true
    fi
  elif [ "$_snap_found" = false ]; then
    # Snapshot missing: safe default — do NOT claude rm. Cannot verify worktree safety.
    local _hr_msg="HUMAN_REQUIRED: reviewer bg session $handle — no pre-dispatch snapshot, cannot verify worktree safety, left for inspection"
    log "$_hr_msg"
    if [ -n "${HARVEST_LOG:-}" ]; then
      printf '%s\n' "$_hr_msg" >> "${HARVEST_LOG}" 2>/dev/null || true
    fi
  else
    # Snapshot exists and no worktree commits: safe to rm.
    claude rm "$handle" 2>/dev/null || true
    rm -f "$_snap_file" 2>/dev/null || true
  fi
}
`
}

// loopScriptSpawnReviewers returns the spawn_reviewers function.
func loopScriptSpawnReviewers() string { //nolint:funlen // bash template string
	return loopScriptReadSessionID() + loopScriptBgReviewHelpers() + `
spawn_reviewers() {
  local cycle="$1" cycle_dir="$2"
  local prompt
  prompt=$(build_review_prompt "$REVIEW_DIFF_RANGE")

  local prompt_file="$cycle_dir/review-prompt.txt"
  echo "$prompt" > "$prompt_file"

  local follow_up="Review the latest fixes. If all issues are resolved, output REVIEW_APPROVED alone on its own line. Otherwise output REVIEW_CHANGES_REQUESTED on its own line followed by your findings."
  local follow_up_file="$cycle_dir/review-followup.txt"
  echo "$follow_up" > "$follow_up_file"

  local pids=""
  local bg_handles=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    case "$reviewer" in
      (claude-sonnet|claude-opus)
        local model_name
        if [ "$reviewer" = "claude-sonnet" ]; then model_name="claude-sonnet-4-6"
        else model_name="claude-opus-4-7[1m]"; fi
        if [ "$CA_BACKEND" = "bg" ]; then
          if [ "$cycle" -eq 1 ]; then
            # Cycle 1: dispatch plain claude --bg (no --session-id; spike G1).
            if bg_dispatch_reviewer "$reviewer" "$model_name" "$prompt_file" "$REVIEW_DIR/sessions.json"; then
              local safe_reviewer
              safe_reviewer=$(printf '%s' "$reviewer" | tr '-' '_')
              local handle
              eval "handle=\${BG_REVIEWER_HANDLE_${safe_reviewer}:-}"
              if [ -n "$handle" ]; then
                bg_handles="$bg_handles $reviewer:$handle:$report"
              fi
            fi
          else
            # Cycle 2+: resume the bg session via --bg --resume <sessionId>.
            local sid=""
            sid=$(read_session_id "$reviewer" "$REVIEW_DIR/sessions.json")
            if [ -n "$sid" ]; then
              # Capture pre-dispatch snapshot BEFORE resuming (T3 infra: same invariant as cycle 1).
              # The resumed session gets a NEW short_id; we write the snapshot keyed to that id
              # so bg_collect_reviewer can verify worktree safety before claude rm.
              local c2_pre_snapshot
              c2_pre_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
              local raw_output
              raw_output=$(claude --bg \
                --dangerously-skip-permissions \
                --permission-mode auto \
                --model "$model_name" \
                --resume "$sid" \
                "$(cat "$follow_up_file")" 2>&1 || true)
              local short_id
              short_id=$(printf '%s' "$raw_output" | sed 's/\x1b\[[0-9;]*m//g' | \
                grep -oE 'backgrounded[[:space:]]*[·•][[:space:]]*([0-9a-f]{8})' | \
                grep -oE '[0-9a-f]{8}' | head -1 || true)
              if [ -n "$short_id" ]; then
                # Write snapshot keyed to the new handle AFTER parsing short_id (T3 infra).
                _bg_snapshot_worktrees "$short_id" "$c2_pre_snapshot"
                bg_handles="$bg_handles $reviewer:$short_id:$report"
              else
                log "WARN: $reviewer cycle $cycle bg resume failed, output: $raw_output"
              fi
            else
              log "WARN: $reviewer no session id for cycle $cycle resume -- skipping"
            fi
          fi
        else
          # p backend: synchronous agent_invoke (R-PLEGACY -- byte-identical).
          local sid=""
          sid=$(read_session_id "$reviewer" "$REVIEW_DIR/sessions.json")
          if [ "$cycle" -eq 1 ]; then
            (portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$model_name" \
              --session-id "$sid" \
              -p "$(cat "$prompt_file")" > "$report" 2>&1 || true) &
          else
            (portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$model_name" \
              --resume "$sid" \
              -p "$follow_up" > "$report" 2>&1 || true) &
          fi
          pids="$pids $!"
        fi
        ;;
      (agy)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" agy \
            -p "$(cat "$prompt_file")" --dangerously-skip-permissions --model "$REVIEW_MODEL" --print-timeout 1h > "$report" 2>&1 || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" agy -c \
            -p "$follow_up" --dangerously-skip-permissions > "$report" 2>&1 || true) &
        fi
        pids="$pids $!"
        ;;
      (codex)
        if [ "$cycle" -eq 1 ]; then
          (portable_timeout "$REVIEW_TIMEOUT" codex exec --full-auto \
            -o "$report" -- - < "$prompt_file" 2>/dev/null || true) &
        else
          (portable_timeout "$REVIEW_TIMEOUT" codex exec resume --last --full-auto \
            -o "$report" "$follow_up" 2>/dev/null || true) &
        fi
        pids="$pids $!"
        ;;
    esac
    log "Spawned $reviewer (cycle $cycle) -> $report"
  done

  # Mixed-fleet barrier: poll bg Claude handles to terminal, wait sync agy/codex pids.
  # This ensures no reviewer's result is read until all have finished (R-FLEET).
  if [ -n "$bg_handles" ]; then
    local elapsed=0
    while [ -n "$bg_handles" ] && [ "$elapsed" -lt "$REVIEW_TIMEOUT" ]; do
      local remaining_handles=""
      for entry in $bg_handles; do
        local rev handle rpt
        rev=$(printf '%s' "$entry" | cut -d: -f1)
        handle=$(printf '%s' "$entry" | cut -d: -f2)
        rpt=$(printf '%s' "$entry" | cut -d: -f3)
        local poll_result
        poll_result=$(bg_poll_reviewer "$handle")
        if [ "$poll_result" = "done" ]; then
          log "$rev bg reviewer done (handle=$handle)"
          bg_collect_reviewer "$handle" "$rpt"
        else
          remaining_handles="$remaining_handles $entry"
        fi
      done
      bg_handles="${remaining_handles# }"
      if [ -n "$bg_handles" ]; then
        sleep "${BG_POLL_INTERVAL:-15}"
        elapsed=$(( elapsed + ${BG_POLL_INTERVAL:-15} ))
      fi
    done
    if [ -n "$bg_handles" ]; then
      log "WARN: bg reviewer timeout after ${elapsed}s -- collecting remaining"
      for entry in $bg_handles; do
        local rev handle rpt
        rev=$(printf '%s' "$entry" | cut -d: -f1)
        handle=$(printf '%s' "$entry" | cut -d: -f2)
        rpt=$(printf '%s' "$entry" | cut -d: -f3)
        bg_collect_reviewer "$handle" "$rpt"
      done
    fi
  fi
  if [ -n "$pids" ]; then
    log "Waiting for sync reviewers (agy/codex): $pids"
    for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  fi
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
  portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$REVIEW_MODEL" \
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

// loopScriptGooseReviewerModel emits the goose_reviewer_model bash function: a
// case statement echoing the pinned provider/model ref for each reviewer named
// in reviewModels, or empty for any unpinned reviewer (inherit). Cases are
// emitted in the stable fleet order so output is deterministic.
func loopScriptGooseReviewerModel(reviewModels map[string]string) string {
	var b strings.Builder
	b.WriteString("# goose_reviewer_model <reviewer> -> pinned provider/model ref (echoed).\n")
	b.WriteString("# Empty means inherit the loop's exported GOOSE_PROVIDER/GOOSE_MODEL.\n")
	b.WriteString("goose_reviewer_model() {\n")
	b.WriteString("  case \"$1\" in\n")
	for _, reviewer := range validGooseReviewerNames() {
		ref, ok := reviewModels[reviewer]
		if !ok {
			continue
		}
		fmt.Fprintf(&b, "    (%s) echo %s ;;\n", reviewer, util.ShellEscape(ref))
	}
	b.WriteString("    (*) echo \"\" ;;\n")
	b.WriteString("  esac\n")
	b.WriteString("}\n")
	return b.String()
}

// loopScriptGooseReviewFleet returns the goose review-fleet bash functions:
// detect_reviewers, init_review_sessions, spawn_reviewers, and feed_implementer.
// They drive the open-model reviewer subrecipes (review-security /
// review-correctness / review-quality) installed under .goose/recipes/, and
// satisfy the same contract as the claude review helpers so the shared cycle
// loop (loopScriptReviewLoopInit + loopScriptReviewLoopCycle) aggregates their
// verdicts unchanged. The fleet is read-only: it only emits 'goose run --recipe'
// and never claude/agy/codex flags.
//
// reviewModels pins individual reviewers to their own provider/model ref so the
// fleet is genuinely heterogeneous; spawn_reviewers exports a per-reviewer
// GOOSE_PROVIDER/GOOSE_MODEL before each 'goose run'. An unpinned reviewer
// inherits the loop's exported GOOSE_PROVIDER/GOOSE_MODEL.
func loopScriptGooseReviewFleet(reviewModels map[string]string) string { //nolint:funlen // bash template string
	return `
# --- Goose review fleet (open-model subrecipes) ---
GOOSE_RECIPE_DIR="${GOOSE_RECIPE_DIR:-.goose/recipes}"

# goose_reviewer_recipe <reviewer> -> subrecipe path (echoed). Empty if unknown.
goose_reviewer_recipe() {
  case "$1" in
    (security)    echo "$GOOSE_RECIPE_DIR/review-security.yaml" ;;
    (correctness) echo "$GOOSE_RECIPE_DIR/review-correctness.yaml" ;;
    (quality)     echo "$GOOSE_RECIPE_DIR/review-quality.yaml" ;;
    (*)           echo "" ;;
  esac
}
` + loopScriptGooseReviewerModel(reviewModels) + `

# detect_reviewers - resolve configured specialties to installed subrecipes.
# Sets AVAILABLE_REVIEWERS; returns 1 (skip review) if goose is missing or no
# configured reviewer maps to an installed recipe.
detect_reviewers() {
  AVAILABLE_REVIEWERS=""
  if ! command -v goose >/dev/null 2>&1; then
    log "WARN: goose CLI not found, skipping review phase"
    return 1
  fi
  for reviewer in $REVIEW_REVIEWERS; do
    local recipe
    recipe=$(goose_reviewer_recipe "$reviewer")
    if [ -z "$recipe" ]; then
      log "WARN: $reviewer is not a known goose fleet reviewer, skipping"
    elif [ ! -f "$recipe" ]; then
      log "WARN: subrecipe $recipe missing (run: ca setup --harness goose), skipping $reviewer"
    else
      AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS $reviewer"
    fi
  done
  AVAILABLE_REVIEWERS="${AVAILABLE_REVIEWERS# }"
  log "Configured reviewers: $REVIEW_REVIEWERS"
  if [ -z "$AVAILABLE_REVIEWERS" ]; then
    log "WARN: No goose reviewer subrecipes available, skipping review phase"
    return 1
  fi
  log "Available reviewers: $AVAILABLE_REVIEWERS"
  return 0
}

# init_review_sessions - goose subrecipes are stateless (--no-session); just
# ensure the cycle dir exists so the cycle loop's report paths are writable.
init_review_sessions() {
  mkdir -p "$1"
}

# spawn_reviewers <cycle> <cycle_dir> - run each reviewer subrecipe in parallel,
# scoped to REVIEW_DIFF_RANGE, writing stdout to <cycle_dir>/<reviewer>.md. The
# subrecipes are read-only reviews; the loop never commits on their behalf.
spawn_reviewers() {
  local cycle="$1" cycle_dir="$2"
  local pids=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    local recipe ref
    recipe=$(goose_reviewer_recipe "$reviewer")
    # Per-reviewer model pin (provider/model). Empty means inherit the loop's
    # exported GOOSE_PROVIDER/GOOSE_MODEL, so the fleet is heterogeneous only
    # where pinned and otherwise matches the prior single-model behavior.
    ref=$(goose_reviewer_model "$reviewer")
    (
       if [ -n "$ref" ]; then
         export GOOSE_PROVIDER="${ref%%/*}" GOOSE_MODEL="${ref#*/}"
       fi
       portable_timeout "$REVIEW_TIMEOUT" goose run --no-session \
         --recipe "$recipe" \
         --params epic="$EPIC_ID" diff_range="$REVIEW_DIFF_RANGE" \
         > "$report" 2>&1 || true
    ) &
    pids="$pids $!"
    log "Spawned $reviewer subrecipe $recipe (cycle $cycle) -> $report"
  done
  if [ -n "$pids" ]; then
    for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  fi
  log "All reviewers finished (cycle $cycle)"
}

# feed_implementer <cycle_dir> - assemble the reviewer findings into a fix prompt
# and run the goose implementer to apply fixes. Goose does not auto-commit, so
# the prompt asks it to commit explicitly. Outputs FIXES_APPLIED when done.
feed_implementer() {
  local cycle_dir="$1"
  local implementer_report="$cycle_dir/implementer.md"
  local prompt_file="$cycle_dir/implementer-prompt.md"
  cat > "$prompt_file" <<'IMPL_PROMPT_HEADER'
You received feedback from independent open-model reviewers. Analyze and
implement all fixes for the changes under review.

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

Fix ALL P0 and P1 findings. Address P2 where reasonable. Run the tests to verify.
Goose does not auto-commit, so commit your fixes explicitly:

    git add -A && git commit -m "fix: address review findings"

Output FIXES_APPLIED when done.
IMPL_PROMPT_FOOTER

  log "Running goose implementer session (prompt: $prompt_file)..."
  local impl_start
  impl_start=$(date +%s)
  portable_timeout "$REVIEW_TIMEOUT" goose run --no-session -i "$prompt_file" \
    > "$implementer_report" 2>&1 || true
  local impl_duration=$(( $(date +%s) - impl_start ))
  log "Implementer session complete (${impl_duration}s)"
}
`
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
      elif grep -qi "rate limit\|Rate limit\|API.*[Ee]rror\|API_KEY\|authentication" "$report"; then
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
