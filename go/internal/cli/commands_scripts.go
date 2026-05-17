package cli

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/memory"
	"github.com/nathandelacretaz/compound-agent/internal/setup"
	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// ========================== loop ==========================

// loopCmdOptions captures all flag values for the loop command.
type loopCmdOptions struct {
	output, model, epics, reviewers, reviewModel string
	backend                                      string
	maxRetries, reviewEvery, maxReviewCycles     int
	compactPct                                   int
	force, reviewBlocking                        bool
}

func loopCmd() *cobra.Command {
	var o loopCmdOptions

	cmd := &cobra.Command{
		Use:   "loop",
		Short: "Generate infinity loop script for epic processing",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runLoop(cmd, &o)
		},
	}

	cmd.Flags().StringVarP(&o.output, "output", "o", ".compound-agent/infinity-loop.sh", "Output script path")
	cmd.Flags().IntVar(&o.maxRetries, "max-retries", 1, "Max retries per epic on failure")
	cmd.Flags().StringVar(&o.model, "model", "claude-opus-4-7[1m]", "Claude model to use")
	cmd.Flags().BoolVarP(&o.force, "force", "f", false, "Overwrite existing script")
	cmd.Flags().StringVar(&o.epics, "epics", "", "Comma-separated epic IDs to process")
	cmd.Flags().StringVar(&o.reviewers, "reviewers", "", "Comma-separated reviewers (claude-sonnet,claude-opus,gemini,codex)")
	cmd.Flags().IntVar(&o.reviewEvery, "review-every", 0, "Review every N completed epics (0=end-only)")
	cmd.Flags().IntVar(&o.maxReviewCycles, "max-review-cycles", 3, "Max review/fix iterations")
	cmd.Flags().BoolVar(&o.reviewBlocking, "review-blocking", false, "Fail loop if review not approved after max cycles")
	cmd.Flags().StringVar(&o.reviewModel, "review-model", "claude-opus-4-7[1m]", "Model for implementer fix sessions")
	cmd.Flags().IntVar(&o.compactPct, "compact-pct", 0, "Context auto-compaction threshold % (0=use Claude Code default, suggested: 50)")
	cmd.Flags().StringVar(&o.backend, "backend", "bg", "Claude execution backend: bg (default) or p (legacy claude -p)")
	return cmd
}

func runLoop(cmd *cobra.Command, o *loopCmdOptions) error {
	if o.compactPct < 0 || o.compactPct > 100 {
		return fmt.Errorf("--compact-pct must be 0-100, got %d", o.compactPct)
	}
	if o.backend != "bg" && o.backend != "p" {
		return fmt.Errorf("--backend must be 'bg' or 'p', got %q", o.backend)
	}
	output := o.output
	if output == "" {
		output = ".compound-agent/infinity-loop.sh"
	}
	if !o.force {
		if _, err := os.Stat(output); err == nil {
			return fmt.Errorf("file %s already exists (use --force to overwrite)", output)
		}
	}

	backendExplicit := cmd.Flags().Changed("backend")
	opts := loopGenerateOptions{
		maxRetries:      o.maxRetries,
		model:           o.model,
		epics:           o.epics,
		compactPct:      o.compactPct,
		backend:         o.backend,
		backendExplicit: backendExplicit,
	}

	if o.reviewers != "" {
		reviewerList := strings.Split(o.reviewers, ",")
		if err := validateReviewers(reviewerList); err != nil {
			return err
		}
		opts.review = &loopReviewOptions{
			reviewers: reviewerList, maxReviewCycles: o.maxReviewCycles,
			reviewBlocking: o.reviewBlocking, reviewModel: o.reviewModel, reviewEvery: o.reviewEvery,
		}
	}

	script := generateLoopScript(opts)

	if err := os.MkdirAll(filepath.Dir(output), 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	if err := os.WriteFile(output, []byte(script), 0755); err != nil {
		return fmt.Errorf("write script: %w", err)
	}
	cmd.Printf("[ok] Generated infinity loop script: %s\n", output)
	cmd.Println("Run it with: bash " + output)
	return nil
}

// loopGenerateOptions holds all options for generating the loop script.
type loopGenerateOptions struct {
	maxRetries      int
	compactPct      int
	model           string
	epics           string
	backend         string // "bg" or "p"
	backendExplicit bool   // true if user passed --backend explicitly
	review          *loopReviewOptions
}

func generateLoopScript(opts loopGenerateOptions) string {
	escapedModel := util.ShellEscape(opts.model)
	// Replace commas with spaces so bash `for` loop iterates correctly.
	escapedEpicIDs := util.ShellEscape(strings.ReplaceAll(opts.epics, ",", " "))
	bt := "`" // backtick for use in templates

	config := loopScriptConfig(opts.maxRetries, escapedModel, escapedEpicIDs, opts.compactPct)
	crashHandler := loopScriptCrashHandler()
	memorySafety := loopScriptMemorySafety()
	parseJSON := loopScriptParseJSON()
	epicSelector := loopScriptEpicSelector()
	promptBuilder := loopScriptPromptBuilder(bt)

	var reviewSection string
	if opts.review != nil {
		reviewSection = loopScriptReviewConfig(*opts.review) +
			loopScriptReviewerDetection() +
			loopScriptSessionIDManagement() +
			loopScriptReviewPrompt() +
			loopScriptSpawnReviewers() +
			loopScriptImplementerPhase() +
			loopScriptReviewLoop()
	}

	helpers := loopScriptHelpers()
	seam := loopScriptSeam(opts.backend, opts.backendExplicit)
	preLoop := loopScriptPreLoop()
	whileHeader := loopScriptWhileHeader()
	epicProcessing := loopScriptEpicProcessing()

	// Build review trigger fragments (empty strings if no reviewers).
	var triggerInit, triggerPeriodic, triggerFinal string
	if opts.review != nil {
		triggerInit, triggerPeriodic, triggerFinal = loopScriptReviewTriggers(opts.review.reviewEvery)
	}

	// Inject triggers at the correct positions:
	// - triggerInit: BEFORE the while loop (after pre-loop vars)
	// - triggerPeriodic: INSIDE the success branch (via epicResult parameter)
	// - triggerFinal: AFTER the done (before summary/push)
	epicResult := loopScriptEpicResult(triggerPeriodic)
	postLoop := loopScriptPostLoop(triggerFinal)

	mainLoop := helpers + seam + preLoop + triggerInit + whileHeader +
		epicProcessing + epicResult + postLoop

	return config + crashHandler + memorySafety + parseJSON +
		epicSelector + promptBuilder + reviewSection + mainLoop
}

// loopScriptConfig returns the header, config vars, helpers, and mkdir section.
func loopScriptConfig(maxRetries int, escapedModel, escapedEpicIDs string, compactPct int) string {
	timestamp := time.Now().Format(time.RFC3339)

	var b strings.Builder
	fmt.Fprintf(&b, "#!/usr/bin/env bash\n")
	fmt.Fprintf(&b, "# Infinity Loop - Generated by: ca loop\n")
	fmt.Fprintf(&b, "# Date: %s\n", timestamp)
	fmt.Fprintf(&b, "# Autonomously processes beads epics via Claude Code sessions.\n")
	fmt.Fprintf(&b, "#\n# Usage:\n#   .compound-agent/infinity-loop.sh\n")
	fmt.Fprintf(&b, "#   LOOP_DRY_RUN=1 .compound-agent/infinity-loop.sh  # Preview without executing\n\n")
	fmt.Fprintf(&b, "set -euo pipefail\n\n")

	// Config variables
	fmt.Fprintf(&b, "# Config\n")
	fmt.Fprintf(&b, "MAX_RETRIES=%d\n", maxRetries)
	fmt.Fprintf(&b, "MODEL=%s\n", escapedModel)
	fmt.Fprintf(&b, "EPIC_IDS=%s\n", escapedEpicIDs)
	fmt.Fprintf(&b, "LOG_DIR=\".compound-agent/agent_logs\"\n")
	fmt.Fprintf(&b, "MIN_FREE_MEMORY_PCT=${MIN_FREE_MEMORY_PCT:-20}  # Stop loop if free memory drops below this %%\n")
	fmt.Fprintf(&b, "WATCHDOG_THRESHOLD=${WATCHDOG_THRESHOLD:-15}     # Kill session if free memory drops below this %%\n")
	fmt.Fprintf(&b, "WATCHDOG_INTERVAL=${WATCHDOG_INTERVAL:-30}       # Seconds between watchdog checks\n")
	fmt.Fprintf(&b, "SESSION_STALE_TIMEOUT=${SESSION_STALE_TIMEOUT:-1800}  # Kill session if no output for this many seconds\n")
	if compactPct > 0 {
		fmt.Fprintf(&b, "export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=%d  # Trigger context compaction at %d%% capacity\n", compactPct, compactPct)
	}
	fmt.Fprintf(&b, "\n")

	// Helpers
	fmt.Fprintf(&b, "# Helpers\n")
	fmt.Fprintf(&b, "timestamp() { date '+%%Y-%%m-%%d_%%H-%%M-%%S'; }\n")
	fmt.Fprintf(&b, "# log() writes to stderr so it never corrupts command-substitution captures\n")
	fmt.Fprintf(&b, "log() { echo \"[$(timestamp)] $*\" >&2; }\n")
	fmt.Fprintf(&b, "die() { log \"FATAL: $*\"; exit 1; }\n\n")

	// CLI prerequisites
	fmt.Fprintf(&b, "command -v claude >/dev/null || die \"claude CLI required\"\n")
	fmt.Fprintf(&b, "command -v bd >/dev/null || die \"bd (beads) CLI required\"\n\n")

	// JSON parser detection
	fmt.Fprintf(&b, "# Detect JSON parser: prefer jq, fall back to python3\n")
	fmt.Fprintf(&b, "HAS_JQ=false\n")
	fmt.Fprintf(&b, "command -v jq >/dev/null 2>&1 && HAS_JQ=true\n")
	fmt.Fprintf(&b, "if [ \"$HAS_JQ\" = false ]; then\n")
	fmt.Fprintf(&b, "  command -v python3 >/dev/null 2>&1 || die \"jq or python3 required for JSON parsing\"\n")
	fmt.Fprintf(&b, "fi\n\n")

	fmt.Fprintf(&b, "mkdir -p \"$LOG_DIR\"\n\n")
	return b.String()
}

// loopScriptCrashHandler returns the EXIT trap that logs crash details to the status file.
func loopScriptCrashHandler() string {
	return `# Crash handler: log WHY we died and update status file
_loop_cleanup() {
  local exit_code=$?
  stop_memory_watchdog 2>/dev/null || true
  stop_stale_watchdog 2>/dev/null || true
  if [ $exit_code -ne 0 ]; then
    log "CRASH: Script exited with code $exit_code at line ${BASH_LINENO[0]:-unknown}"
    echo "{\"status\":\"crashed\",\"exit_code\":$exit_code,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"line\":\"${BASH_LINENO[0]:-unknown}\"}" > "${LOG_DIR:-.}/.loop-status.json" 2>/dev/null || true
  fi
}
trap _loop_cleanup EXIT

`
}

// loopScriptMemorySafety returns the 4-layer memory defense: orphan cleanup,
// memory gate, memory watchdog, stale output watchdog, and the bg kill ladder.
func loopScriptMemorySafety() string { //nolint:funlen // bash template string
	return `# --- Memory Safety (4-Layer Defense) ---

# cleanup_orphans() - Kill leftover test/build processes from THIS repo between sessions
# (p backend: PID-based pgrep, scoped to repo cwd — R-PLEGACY byte-identical)
# (bg backend: also enumerates ~/.claude/jobs/ for stray bg sessions from this loop)
# Scoped to current working directory to avoid killing unrelated processes
cleanup_orphans() {
  local killed=0
  local repo_dir
  repo_dir=$(pwd)
  for pid in $(pgrep -f "vitest|node.*\.test\.|go\.test|pytest|cargo\.test" 2>/dev/null || true); do
    local proc_cwd=""
    if [ "$(uname)" = "Darwin" ]; then
      proc_cwd=$(lsof -p "$pid" -Fn 2>/dev/null | grep '^ncwd' | sed 's/^n//' || true)
    else
      proc_cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || true)
    fi
    # Only kill if the process cwd is exactly this repo or a subdirectory
    case "$proc_cwd" in
      "$repo_dir"|"$repo_dir"/*) kill "$pid" 2>/dev/null && killed=$((killed + 1)) ;;
    esac
  done
  if [ "$killed" -gt 0 ]; then
    log "Cleaned up $killed orphan test processes"
    sleep 2  # Let OS reclaim memory
  fi

  # bg backend: enumerate ~/.claude/jobs/ for stray sessions from prior crashed loop
  # attempts. Conservative policy (R-HARVEST-FAIL):
  #   - Only act on sessions that have a snapshot in .ca-worktree-snapshots/ (this repo).
  #   - Only stop clearly-stale sessions (state.json mtime older than 2x SESSION_STALE_TIMEOUT).
  #   - Only claude rm if the session has NO un-harvested worktree (no new worktree vs snapshot).
  #   - Otherwise: log HUMAN_REQUIRED and leave the session for manual recovery.
  #   - Never touch sessions owned by other repos (scoped by snapshot presence).
  if [ "$CA_BACKEND" = "bg" ]; then
    local jobs_dir="$HOME/.claude/jobs"
    local snapshot_dir
    snapshot_dir="$(git rev-parse --show-toplevel 2>/dev/null || echo '')/.ca-worktree-snapshots"
    if [ -d "$jobs_dir" ] && [ -d "$snapshot_dir" ]; then
      local now_ts
      now_ts=$(date +%s 2>/dev/null || echo 0)
      local stale_threshold=$(( ${SESSION_STALE_TIMEOUT:-1800} * 2 ))
      for state_file in "$jobs_dir"/*/state.json; do
        [ -f "$state_file" ] || continue
        local orphan_id
        orphan_id=$(basename "$(dirname "$state_file")")
        # Only handle sessions that have a snapshot in this repo (ownership check).
        local snap_file="$snapshot_dir/$orphan_id.txt"
        [ -f "$snap_file" ] || continue
        # Skip the currently active session (AGENT_HANDLE is set during dispatch).
        [ "$orphan_id" = "${AGENT_HANDLE:-}" ] && continue
        # Check terminal state: skip sessions already done/stopped/failed/etc.
        local orphan_state=""
        if [ "$HAS_JQ" = true ]; then
          orphan_state=$(jq -r '.state // empty' "$state_file" 2>/dev/null || true)
        else
          orphan_state=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('state','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
        fi
        case "$orphan_state" in
          done|completed|failed|stopped|error|cancel) continue ;;
        esac
        # Check staleness: state.json mtime must be older than stale_threshold.
        local mtime
        mtime=$(stat -c '%Y' "$state_file" 2>/dev/null || stat -f '%m' "$state_file" 2>/dev/null || echo 0)
        local age=$(( now_ts - mtime ))
        if [ "$age" -lt "$stale_threshold" ]; then
          continue  # Session is recent; skip
        fi
        log "WARN: cleanup_orphans: stale bg orphan $orphan_id (age ${age}s) — checking harvest safety"
        # Harvest-safety check: detect un-harvested worktree by diffing snapshot vs current.
        local pre_wts=""
        pre_wts=$(cat "$snap_file" 2>/dev/null || true)
        local cur_wts=""
        cur_wts=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
        local has_new_wt=false
        while IFS= read -r wt_path; do
          [ -z "$wt_path" ] && continue
          if ! printf '%s\n' "$pre_wts" | grep -qF "$wt_path"; then
            has_new_wt=true
            break
          fi
        done <<SNAPEOF
$cur_wts
SNAPEOF
        if [ "$has_new_wt" = true ]; then
          # Un-harvested worktree present: cannot safely rm. Log HUMAN_REQUIRED.
          local msg="HUMAN_REQUIRED: cleanup_orphans: orphan bg session $orphan_id has un-harvested worktree — inspect manually and merge, then: claude rm $orphan_id"
          log "$msg"
          if [ -n "${HARVEST_LOG:-}" ]; then
            printf '%s\n' "$msg" >> "$HARVEST_LOG" 2>/dev/null || true
          fi
        else
          # No un-harvested worktree: safe to stop and rm.
          log "cleanup_orphans: stopping stale orphan $orphan_id (no un-harvested worktree)"
          claude stop "$orphan_id" 2>/dev/null || true
          claude rm "$orphan_id" 2>/dev/null || true
          rm -f "$snap_file" 2>/dev/null || true
        fi
      done
    fi
  fi
}

# get_memory_pct() - Return current free memory percentage on stdout (empty on failure)
get_memory_pct() {
  if [ "$(uname)" = "Darwin" ]; then
    memory_pressure 2>/dev/null | awk -F: '/free percentage/ {gsub(/%| /,"",$2); print $2}'
  else
    local mem_total mem_available
    mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    mem_available=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
    if [ "$mem_total" -gt 0 ]; then
      echo $(( mem_available * 100 / mem_total ))
    fi
  fi
}

# check_memory() - Abort if system free memory is too low
check_memory() {
  local free_pct
  free_pct=$(get_memory_pct)
  if [ -z "$free_pct" ]; then
    return 0  # Can't measure, assume OK
  fi
  if [ "$free_pct" -lt "$MIN_FREE_MEMORY_PCT" ]; then
    log "WARN: System memory ${free_pct}% free (minimum: ${MIN_FREE_MEMORY_PCT}%)"
    return 1
  fi
  log "Memory OK: ${free_pct}% free"
  return 0
}

# start_memory_watchdog() - Background monitor that kills target PID on memory pressure
# Args: $1=PID to kill, $2=log file for memory stats
# Sets: WATCHDOG_PID (global)
WATCHDOG_PID=""

start_memory_watchdog() {
  local target_pid="$1"
  local mem_log="$2"
  (
    while kill -0 "$target_pid" 2>/dev/null; do
      local pct
      pct=$(get_memory_pct)
      if [ -n "$pct" ]; then
        echo "[$(date '+%Y-%m-%d_%H-%M-%S')] memory_free=${pct}%" >> "$mem_log"
        if [ "$pct" -lt "$WATCHDOG_THRESHOLD" ]; then
          echo "[$(date '+%Y-%m-%d_%H-%M-%S')] WATCHDOG: memory ${pct}% < ${WATCHDOG_THRESHOLD}%, killing PID $target_pid" >> "$mem_log"
          kill -TERM -- -"$target_pid" 2>/dev/null || kill "$target_pid" 2>/dev/null || true
          exit 0
        fi
      fi
      sleep "$WATCHDOG_INTERVAL"
    done
  ) &
  WATCHDOG_PID=$!
}

stop_memory_watchdog() {
  if [ -n "$WATCHDOG_PID" ]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
    wait "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
  fi
}

# start_stale_watchdog() - Background monitor that kills target PID on output inactivity
# Args: $1=PID to kill, $2=trace file to monitor, $3=log file for events
# Sets: STALE_WATCHDOG_PID (global)
STALE_WATCHDOG_PID=""

start_stale_watchdog() {
  local target_pid="$1"
  local trace_file="$2"
  local log_file="$3"
  (
    local last_size=0
    local stale_secs=0
    while kill -0 "$target_pid" 2>/dev/null; do
      sleep "$WATCHDOG_INTERVAL"
      local cur_size=0
      [ -f "$trace_file" ] && cur_size=$(wc -c < "$trace_file" 2>/dev/null || echo 0)
      if [ "$cur_size" -eq "$last_size" ] && [ "$last_size" -gt 0 ]; then
        stale_secs=$((stale_secs + WATCHDOG_INTERVAL))
        if [ "$stale_secs" -ge "$SESSION_STALE_TIMEOUT" ]; then
          echo "[$(date '+%Y-%m-%d_%H-%M-%S')] STALE_WATCHDOG: no output for ${stale_secs}s, killing PID $target_pid" >> "$log_file"
          kill -TERM -- -"$target_pid" 2>/dev/null || kill "$target_pid" 2>/dev/null || true
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

stop_stale_watchdog() {
  if [ -n "$STALE_WATCHDOG_PID" ]; then
    kill "$STALE_WATCHDOG_PID" 2>/dev/null || true
    wait "$STALE_WATCHDOG_PID" 2>/dev/null || true
    STALE_WATCHDOG_PID=""
  fi
}

# bg_kill_ladder <handle> <reason> <mem_log>
# Three-stage escalation for a wedged bg session (R-WATCHDOG, G4):
#   Stage 1: claude stop <handle>  (~1s, halts work — spike G4 verified)
#            Wait BG_POLL_INTERVAL then re-poll; if terminal, done.
#   Stage 2: claude rm <handle>   — ONLY if no un-harvested worktree (R-HARVEST-FAIL).
#            If worktree present: log HUMAN_REQUIRED, skip rm, proceed to stage 3.
#   Stage 3: scoped process sweep — pkill processes whose argv contains the session handle.
#            Scoped only to processes from this session; never a broad pkill.
# Writes STALE_WATCHDOG:/WATCHDOG: markers to mem_log so existing detection still works.
bg_kill_ladder() {
  local handle="$1" reason="$2" mem_log="$3"
  local ts
  ts=$(date '+%Y-%m-%d_%H-%M-%S')

  # Stage 1: stop the session.
  if [ "$reason" = "stale" ]; then
    echo "[$ts] STALE_WATCHDOG: bg session $handle stale — stage1: claude stop" >> "$mem_log"
  else
    echo "[$ts] WATCHDOG: bg session $handle $reason — stage1: claude stop" >> "$mem_log"
  fi
  log "bg_kill_ladder[$handle]: stage1 — agent_stop (delegates to claude stop)"
  agent_stop "$handle"
  sleep "${BG_POLL_INTERVAL:-15}"

  # Re-poll: if already terminal, no further action needed.
  local post_state=""
  local state_file="$HOME/.claude/jobs/$handle/state.json"
  if [ -f "$state_file" ]; then
    if [ "${HAS_JQ:-false}" = true ]; then
      post_state=$(jq -r '.state // empty' "$state_file" 2>/dev/null || true)
    else
      post_state=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('state','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
    fi
  fi
  case "$post_state" in
    done|completed|failed|stopped|error|cancel)
      log "bg_kill_ladder[$handle]: session reached terminal state after stop — done"
      return 0
      ;;
  esac

  # Stage 2: harvest-safety check then claude rm.
  log "bg_kill_ladder[$handle]: stage2 — harvest-safety check before claude rm"
  local repo_root snapshot_dir snap_file
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  snapshot_dir="${repo_root:+$repo_root/.ca-worktree-snapshots}"
  snap_file="${snapshot_dir:+$snapshot_dir/$handle.txt}"

  local pre_wts="" cur_wts="" has_new_wt=false
  if [ -n "$snap_file" ] && [ -f "$snap_file" ]; then
    pre_wts=$(cat "$snap_file" 2>/dev/null || true)
    cur_wts=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
    while IFS= read -r wt_path; do
      [ -z "$wt_path" ] && continue
      if ! printf '%s\n' "$pre_wts" | grep -qF "$wt_path"; then
        has_new_wt=true
        break
      fi
    done <<LADDEEOF
$cur_wts
LADDEEOF
  fi

  if [ "$has_new_wt" = true ]; then
    # Un-harvested worktree: cannot rm. Log HUMAN_REQUIRED; proceed to scoped sweep only.
    local hr_msg="HUMAN_REQUIRED: bg_kill_ladder: session $handle has un-harvested worktree — cannot claude rm; inspect manually then: claude rm $handle"
    log "$hr_msg"
    if [ -n "${HARVEST_LOG:-}" ]; then
      printf '%s\n' "$hr_msg" >> "${HARVEST_LOG}" 2>/dev/null || true
    fi
  else
    log "bg_kill_ladder[$handle]: stage2 — claude rm (no un-harvested worktree)"
    claude rm "$handle" 2>/dev/null || true
    rm -f "$snap_file" 2>/dev/null || true
    return 0
  fi

  # Stage 3: scoped process sweep — kill only processes whose argv contains the handle.
  # This is a last resort for residual subprocesses; never a broad pkill.
  log "bg_kill_ladder[$handle]: stage3 — scoped process sweep for handle $handle"
  pkill -f "$handle" 2>/dev/null || true
}

`
}

// loopScriptParseJSON returns the parse_json function with jq/python3 fallback.
func loopScriptParseJSON() string {
	return `# --- JSON Parsing ---
# parse_json() - extract a value from JSON stdin
# Uses jq (primary) with python3 fallback
# Auto-unwraps single-element arrays (bd show --json returns [...])
# Usage: echo '[{"status":"open"}]' | parse_json '.status'
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
f = sys.argv[1].strip('.')
parts = [p for p in f.split('.') if p]
v = data
try:
    for p in parts:
        v = v[p]
except (KeyError, IndexError, TypeError):
    v = None
print('' if v is None else v)
" "$filter"
  fi
}

`
}

// loopScriptEpicSelector returns the check_deps_closed and get_next_epic bash functions.
func loopScriptEpicSelector() string { //nolint:funlen // bash template string
	return `# --- Epic Selector ---

# check_deps_closed() - Verify all depends_on for an epic are closed
# Returns 0 if all deps closed (or no deps), 1 if any dep is open
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
      local candidates
      candidates=$(bd list --type=epic --ready --json --limit=10 2>/dev/null | python3 -c "
import sys, json
processed = set(sys.argv[1].split())
items = json.load(sys.stdin)
for item in items:
    if item['id'] not in processed:
        print(item['id'])" "$PROCESSED" 2>/dev/null || echo "")
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

`
}

// loopScriptPromptBuilder returns the build_prompt bash function.
func loopScriptPromptBuilder(bt string) string { //nolint:funlen // bash template string
	var b strings.Builder
	fmt.Fprintf(&b, "# --- Prompt Builder ---\n")
	fmt.Fprintf(&b, "build_prompt() {\n")
	fmt.Fprintf(&b, "  local epic_id=\"$1\"\n")
	fmt.Fprintf(&b, "  cat <<'PROMPT_HEADER'\n")
	fmt.Fprintf(&b, "You are running in an autonomous infinity loop. Your task is to fully implement a beads epic.\n\n")
	fmt.Fprintf(&b, "## Step 1: Load context\n")
	fmt.Fprintf(&b, "Run these commands to prime your session:\n")
	fmt.Fprintf(&b, "PROMPT_HEADER\n")
	fmt.Fprintf(&b, "  cat <<PROMPT_BODY\n")
	fmt.Fprintf(&b, "\\%s\\%s\\%sbash\n", bt, bt, bt)
	fmt.Fprintf(&b, "npx ca load-session\n")
	fmt.Fprintf(&b, "bd show $epic_id\n")
	fmt.Fprintf(&b, "\\%s\\%s\\%s\n\n", bt, bt, bt)
	fmt.Fprintf(&b, "Read the epic details carefully. Understand scope, acceptance criteria, and sub-tasks.\n\n")
	fmt.Fprintf(&b, "## Step 2: Execute the workflow\n")
	fmt.Fprintf(&b, "Run the full compound workflow for this epic, starting from the plan phase\n")
	fmt.Fprintf(&b, "(spec-dev is already done -- the epic exists):\n\n")
	fmt.Fprintf(&b, "/compound:cook-it from plan -- Epic: $epic_id\n\n")
	fmt.Fprintf(&b, "Work through all phases: plan, work, review, compound.\n\n")
	fmt.Fprintf(&b, "## Step 3: On completion\n")
	fmt.Fprintf(&b, "When all work is done and tests pass:\n")
	fmt.Fprintf(&b, "1. Close the epic: \\%sbd close $epic_id\\%s\n", bt, bt)
	fmt.Fprintf(&b, "2. Commit and push all changes\n")
	fmt.Fprintf(&b, "3. Output this exact marker on its own line:\n\n")
	fmt.Fprintf(&b, "EPIC_COMPLETE\n\n")
	fmt.Fprintf(&b, "## Step 4: On failure\n")
	fmt.Fprintf(&b, "If you cannot complete the epic after reasonable effort:\n")
	fmt.Fprintf(&b, "1. Add a note: \\%sbd update $epic_id --notes \"Loop failed: <reason>\"\\%s\n", bt, bt)
	fmt.Fprintf(&b, "2. Output this exact marker on its own line:\n\n")
	fmt.Fprintf(&b, "EPIC_FAILED\n\n")
	fmt.Fprintf(&b, "## Step 5: On human required\n")
	fmt.Fprintf(&b, "If you hit a blocker that REQUIRES human action (account creation, API keys,\n")
	fmt.Fprintf(&b, "external service setup, design decisions you cannot make, etc.):\n")
	fmt.Fprintf(&b, "1. Add a note: \\%sbd update $epic_id --notes \"Human required: <reason>\"\\%s\n", bt, bt)
	fmt.Fprintf(&b, "2. Output this exact marker followed by a short reason on the SAME line:\n\n")
	fmt.Fprintf(&b, "HUMAN_REQUIRED: <reason>\n\n")
	fmt.Fprintf(&b, "Example: HUMAN_REQUIRED: Need AWS credentials configured in .env\n\n")
	fmt.Fprintf(&b, "## Memory Safety Rules\n")
	fmt.Fprintf(&b, "- For Go work, use \\%sgo test ./...\\%s in the go/ directory.\n", bt, bt)
	fmt.Fprintf(&b, "- NEVER run embedding tests unless the epic modifies embedding code.\n")
	fmt.Fprintf(&b, "- Between test runs, wait for all child processes to exit before starting another.\n\n")
	fmt.Fprintf(&b, "## Rules\n")
	fmt.Fprintf(&b, "- Do NOT ask questions -- there is no human. Make reasonable decisions.\n")
	fmt.Fprintf(&b, "- Do NOT stop early -- complete the full workflow.\n")
	fmt.Fprintf(&b, "- If tests fail, fix them. Retry up to 3 times before declaring failure.\n")
	fmt.Fprintf(&b, "- Use HUMAN_REQUIRED only for true blockers that no amount of retrying can solve.\n")
	fmt.Fprintf(&b, "- Commit incrementally as you make progress.\n")
	fmt.Fprintf(&b, "PROMPT_BODY\n")
	fmt.Fprintf(&b, "}\n\n")
	return b.String()
}

func loopScriptHelpers() string { //nolint:funlen // bash template string
	return `# --- Text Extractor ---
# extract_text() - Extract assistant text from stream-json events on stdin
# Claude Code stream-json: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
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

# --- Marker Detection ---
# detect_marker() - Check for completion markers in log and trace
# Primary: macro log (anchored patterns). Fallback: trace JSONL (unanchored).
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

# --- Observability ---
STATUS_FILE="$LOG_DIR/.loop-status.json"
EXEC_LOG="$LOG_DIR/loop-execution.jsonl"

write_status() {
  local status="$1"
  local epic_id="${2:-}"
  local attempt="${3:-0}"
  if [ "$status" = "idle" ]; then
    echo "{\"status\":\"idle\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$STATUS_FILE"
  else
    echo "{\"epic_id\":\"$epic_id\",\"attempt\":$attempt,\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"status\":\"$status\"}" > "$STATUS_FILE"
  fi
}

log_result() {
  local epic_id="$1" result="$2" attempts="$3" duration="$4"
  echo "{\"epic_id\":\"$epic_id\",\"result\":\"$result\",\"attempts\":$attempts,\"duration_s\":$duration,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$EXEC_LOG"
}

`
}

// loopScriptSeam returns the backend seam functions (agent_dispatch, agent_poll,
// agent_collect, agent_stop, agent_cleanup, agent_invoke) and the CA_BACKEND
// selector. Only the "p" backend is implemented here; "bg" is added in T2.
//
// Seam contract (p backend):
//
//	agent_dispatch <logfile> <tracefile> <model> <prompt>
//	  Runs claude -p in a background subshell; sets AGENT_HANDLE to the subshell PID.
//	  Pipeline: claude ... -p "$prompt" 2>stderr | tee tracefile | extract_text > logfile
//
//	agent_poll <handle>          -- "running" if PID alive, "done" otherwise
//	agent_collect <handle> <logfile> <tracefile> -- delegates to detect_marker
//	agent_stop <handle>          -- kill -TERM process group, then PID
//	agent_cleanup <handle>       -- noop for p backend
//	agent_invoke <model> <flags...> -- -- <prompt-args...> > <outfile>
//	  Synchronous claude invocation (text output, used by reviewer/implementer/architect).
//	  <flags...> are passed verbatim; prompt is read from stdin or provided via -p.
// loopScriptCABackendLine returns the CA_BACKEND shell assignment for the generated script.
// Precedence: explicit --backend flag > CA_BACKEND env > default (bg).
func loopScriptCABackendLine(backend string, explicit bool) string {
	if explicit {
		// Explicit flag: hardcode the value; env override does not apply.
		return "CA_BACKEND=" + backend
	}
	// No explicit flag: env overrides; default is now bg (R-DEFAULT).
	return "CA_BACKEND=${CA_BACKEND:-bg}"
}

// loopScriptBootstrapPreflight returns the bash bootstrap_preflight function and its
// call site. Only included when the bg backend is active (R-BOOTSTRAP, S6).
//
// Design: run a minimal probe with --dangerously-skip-permissions. Positive-signal
// detection: parse an 8-hex session id from a "backgrounded · <id>" line (ANSI-stripped).
// If a session id is found, disclaimer is accepted — tear down the probe session
// (stop + harvest-safety rm) and return 0. If no id is parsed (refusal or dispatch
// failure), fail LOUD with remediation and exit 1. This is robust to CLI wording
// changes because the DECISION is driven by "did we get a session id", not by the
// brittle English refusal string.
func loopScriptBootstrapPreflight() string {
	return `
# --- Bootstrap Preflight (R-BOOTSTRAP) ---
# Detects whether the bypass-permissions disclaimer has been accepted on this machine.
# Positive-signal: parse 8-hex session id from "backgrounded · <id>" line.
# Accepted  => tear down the probe session cleanly (stop + harvest-safety rm), return 0.
# No id     => disclaimer not accepted (or dispatch failed) => fail LOUD, exit 1.
# set -e safe: all external commands guarded with || true; local is fine in bash functions.
bootstrap_preflight() {
  # Step 1: pre-probe worktree snapshot (same pattern as agent_dispatch / T3).
  local pre_snapshot
  pre_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)

  # Step 2: run the probe.
  local probe_out
  probe_out=$(claude --bg --dangerously-skip-permissions \
    --model claude-haiku-4-5 "ping" 2>&1 || true)

  # Step 3: ANSI-strip and parse 8-hex session id (positive-signal detection).
  local probe_id
  probe_id=$(printf '%s' "$probe_out" | sed 's/\x1b\[[0-9;]*m//g' | \
    grep -oE 'backgrounded[[:space:]]*[·•][[:space:]]*([0-9a-f]{8})' | \
    grep -oE '[0-9a-f]{8}' | head -1 || true)

  if printf '%s' "$probe_id" | grep -qE '^[0-9a-f]{8}$' 2>/dev/null; then
    # Disclaimer ACCEPTED. Tear down the probe session without leaking it.
    # Harvest-safety: a "ping" probe makes no commits, but check defensively.
    local cur_snapshot
    cur_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
    local has_new_wt=false
    while IFS= read -r wt_path; do
      [ -z "$wt_path" ] && continue
      if ! printf '%s\n' "$pre_snapshot" | grep -qF "$wt_path" 2>/dev/null; then
        # Defensively check if the new worktree has commits.
        local wt_commits
        wt_commits=$(git -C "$wt_path" log --oneline -1 2>/dev/null || true)
        if [ -n "$wt_commits" ]; then
          has_new_wt=true
          break
        fi
      fi
    done <<PREFLIGHTEOF
$cur_snapshot
PREFLIGHTEOF

    claude stop "$probe_id" 2>/dev/null || true
    if [ "$has_new_wt" = true ]; then
      # Probe worktree has commits: cannot safely rm — log and leave for manual recovery.
      log "WARN: bootstrap_preflight: probe session $probe_id has an unexpected worktree with commits — HUMAN_REQUIRED: inspect then: claude rm $probe_id"
    else
      # No un-harvested worktree: safe to rm.
      claude rm "$probe_id" 2>/dev/null || true
    fi
    return 0
  fi

  # No session id parsed: disclaimer not accepted (or dispatch failed).
  log "FATAL: bootstrap_preflight: claude --bg did not return a bg session id."
  # Enrich message if the known refusal string is present (non-decisive; informational only).
  if printf '%s' "$probe_out" | grep -qF 'bypassPermissions requires accepting the disclaimer' 2>/dev/null; then
    log "  Cause: bypass-permissions disclaimer not yet accepted on this machine."
  else
    log "  Cause: probe output did not contain a valid session id (dispatch failure or disclaimer not accepted)."
    log "  Probe output was: $probe_out"
  fi
  log "  Remediation: run 'claude --dangerously-skip-permissions' once interactively on this machine to accept the"
  log "  bypass-permissions disclaimer, then re-run."
  exit 1
}
bootstrap_preflight

`
}

func loopScriptSeam(backend string, explicit bool) string { //nolint:funlen // bash template string
	caBackendLine := loopScriptCABackendLine(backend, explicit)
	var preflight string
	if backend == "bg" {
		preflight = loopScriptBootstrapPreflight()
	}
	return `# --- Backend Seam (R-SEAM) ---
# CA_BACKEND selects the claude execution backend: "p" (legacy) or "bg" (default).
# "p"  = claude -p streaming subshell (legacy, R-PLEGACY)
# "bg" = claude --bg background session polled via state.json (R-BG)
` + caBackendLine + `
` + preflight + `
# BG_POLL_INTERVAL: seconds between state.json polls for the bg backend.
BG_POLL_INTERVAL=${BG_POLL_INTERVAL:-15}

# AGENT_HANDLE is set by agent_dispatch; used by agent_poll/stop/cleanup and watchdogs.
# p backend:  AGENT_HANDLE = background subshell PID
# bg backend: AGENT_HANDLE = 8-hex session id parsed from "backgrounded · <id>"
AGENT_HANDLE=""

# agent_dispatch <logfile> <tracefile> <model> <prompt>
# p backend:  runs claude -p in a background subshell, sets AGENT_HANDLE=PID.
#             Pipeline matches pre-T1 exactly: stream-json | tee tracefile | extract_text > logfile
# bg backend: dispatches claude --bg, parses 8-hex session id, sets AGENT_HANDLE=id.
#             NOTE: --bg manages its own session id; do NOT pass --session-id (spike G1).
agent_dispatch() {
  local logfile="$1" tracefile="$2" model="$3" prompt="$4"
  case "$CA_BACKEND" in
    p)
      (
        claude --dangerously-skip-permissions \
               --permission-mode auto \
               --model "$model" \
               --output-format stream-json \
               --verbose \
               -p "$prompt" \
               2>"$logfile.stderr" | tee "$tracefile" | extract_text > "$logfile"
      ) &
      AGENT_HANDLE=$!
      ;;
    bg)
      # Snapshot the current worktree set BEFORE dispatching claude --bg.
      # T3: harvest uses this to identify the new worktree created by the bg session
      # (diff before vs after to find exactly one new worktree-<name> entry).
      local pre_snapshot
      pre_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)

      # Dispatch claude --bg; parse the 8-hex session id from "backgrounded · <id>".
      # ANSI-strip the output, then extract the id with grep -oE.
      local raw_output
      raw_output=$(claude --bg \
        --dangerously-skip-permissions \
        --permission-mode auto \
        --model "$model" \
        "$prompt" 2>&1 || true)
      # Strip ANSI escape sequences, then extract the 8-hex session id.
      local bg_id
      bg_id=$(printf '%s' "$raw_output" | sed 's/\x1b\[[0-9;]*m//g' | \
        grep -oE 'backgrounded[[:space:]]*[·•][[:space:]]*([0-9a-f]{8})' | \
        grep -oE '[0-9a-f]{8}' | head -1 || true)
      if [ -z "$bg_id" ] || ! printf '%s' "$bg_id" | grep -qE '^[0-9a-f]{8}$'; then
        log "FATAL: bg dispatch failed: could not parse 8-hex session id from claude --bg output"
        log "  claude output was: $raw_output"
        exit 1
      fi
      AGENT_HANDLE="$bg_id"

      # Store the pre-dispatch worktree snapshot keyed to this session handle.
      # T3 harvest reads this to identify the session's worktree (R-HARVEST).
      local snapshot_dir
      snapshot_dir="$(git rev-parse --show-toplevel 2>/dev/null)/.ca-worktree-snapshots"
      mkdir -p "$snapshot_dir" 2>/dev/null || true
      printf '%s\n' "$pre_snapshot" > "$snapshot_dir/$AGENT_HANDLE.txt" 2>/dev/null || true

      log "bg session dispatched: handle=$AGENT_HANDLE"
      ;;
    *)
      log "FATAL: unknown CA_BACKEND=$CA_BACKEND"; exit 1 ;;
  esac
}

# agent_poll <handle> -> "running" | "done" | "failed"
# p backend:  check if the background subshell PID is still alive.
# bg backend: read $HOME/.claude/jobs/<handle>/state.json; terminal iff
#             .state ∈ {done,completed,failed,stopped,error,cancel} AND .inFlight.tasks==0.
#             ANY unknown/empty/partial .state (incl. file absent or mid-write JSON)
#             => "running" (NEVER false-terminal — spike: docs vocabulary was wrong,
#             state="done" not "completed"; guard partial reads).
agent_poll() {
  local handle="$1"
  case "$CA_BACKEND" in
    p) kill -0 "$handle" 2>/dev/null && echo "running" || echo "done" ;;
    bg)
      local state_file="$HOME/.claude/jobs/$handle/state.json"
      if [ ! -f "$state_file" ]; then
        echo "running"; return 0
      fi
      # Read .state and .inFlight.tasks defensively; treat parse errors as running.
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
      # Defensive terminal set (empirical: docs said "completed", actual is "done").
      # Unknown/empty state => running (NEVER false-terminal).
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
      ;;
    *) echo "done" ;;
  esac
}

# agent_collect <handle> <logfile> <tracefile>
# p backend:  delegates to detect_marker (same anchored patterns as pre-T1).
# bg backend: INVERTED marker contract — reads state.json .output (then .detail),
#             writes the text to $logfile so detect_marker's anchored patterns
#             (^EPIC_COMPLETE$, ^HUMAN_REQUIRED:, ^EPIC_FAILED$) work UNCHANGED.
#             Only if no anchored marker is found in .output/.detail, falls back
#             to extracting the final assistant text from the .linkScanPath transcript.
#             Also copies the transcript to $tracefile for ca watch/diagnostics.
agent_collect() {
  local handle="$1" logfile="$2" tracefile="$3"
  case "$CA_BACKEND" in
    p)
      : # p backend: logfile/tracefile already populated by the dispatch pipeline
      ;;
    bg)
      local state_file="$HOME/.claude/jobs/$handle/state.json"
      local marker_text=""
      local link_scan_path=""

      # Primary: read .output.result (then .output as string), then .detail.
      if [ -f "$state_file" ]; then
        if [ "$HAS_JQ" = true ]; then
          marker_text=$(jq -r '
            (.output.result // .output // "") |
            if type == "string" then . else "" end
          ' "$state_file" 2>/dev/null || true)
          if [ -z "$marker_text" ]; then
            marker_text=$(jq -r '.detail // ""' "$state_file" 2>/dev/null || true)
          fi
          link_scan_path=$(jq -r '.linkScanPath // ""' "$state_file" 2>/dev/null || true)
        else
          marker_text=$(python3 -c "
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
          link_scan_path=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('linkScanPath','') or '')
except Exception:
    pass
" "$state_file" 2>/dev/null || true)
        fi
      fi

      # Check if marker_text contains an anchored marker.
      local has_marker=false
      if printf '%s\n' "$marker_text" | grep -qE '^(EPIC_COMPLETE|EPIC_FAILED|HUMAN_REQUIRED:)' 2>/dev/null; then
        has_marker=true
      fi

      # Fallback: extract final assistant text from the .linkScanPath transcript JSONL.
      if [ "$has_marker" = false ] && [ -n "$link_scan_path" ] && [ -f "$link_scan_path" ]; then
        local transcript_text
        if [ "$HAS_JQ" = true ]; then
          transcript_text=$(jq -j '
            select(.type == "assistant") |
            .message.content[]? |
            select(.type == "text") |
            .text // empty
          ' "$link_scan_path" 2>/dev/null | tail -c 4096 || true)
        else
          transcript_text=$(python3 -c "
import sys, json
lines = []
for line in open(sys.argv[1]):
    try:
        obj = json.loads(line)
        if obj.get('type') == 'assistant':
            for b in obj.get('message',{}).get('content',[]):
                if b.get('type') == 'text':
                    lines.append(b.get('text',''))
    except Exception:
        pass
print(''.join(lines)[-4096:])
" "$link_scan_path" 2>/dev/null || true)
        fi
        if [ -n "$transcript_text" ]; then
          marker_text="$transcript_text"
        fi
        # Copy transcript to tracefile for ca watch / diagnostics.
        cp "$link_scan_path" "$tracefile" 2>/dev/null || true
      elif [ -n "$link_scan_path" ] && [ -f "$link_scan_path" ]; then
        # Transcript exists even when marker was found in .output; copy for diagnostics.
        cp "$link_scan_path" "$tracefile" 2>/dev/null || true
      fi

      # Write marker text to logfile so detect_marker anchored patterns work unchanged.
      printf '%s\n' "$marker_text" > "$logfile"
      ;;
  esac
}

# agent_stop <handle>
# p backend:  kill the process group (same semantics as pre-T1 kill -TERM -- -PGID).
# bg backend: claude stop <handle> (spike G4: ~1s, effective, halts work promptly).
agent_stop() {
  local handle="$1"
  case "$CA_BACKEND" in
    p) kill -TERM -- -"$handle" 2>/dev/null || kill "$handle" 2>/dev/null || true ;;
    bg) claude stop "$handle" 2>/dev/null || true ;;
  esac
}

# agent_cleanup <handle> [marker]
# p backend:  noop (no session or worktree to clean up).
# bg backend: worktree-harvest (R-HARVEST) + session teardown.
#   1. Discover the session worktree by diffing git worktree list against the
#      pre-dispatch snapshot written by agent_dispatch (R-HARVEST worktree association).
#   2. If marker is "complete": git merge --no-ff worktree-<name> into the working branch.
#      On success: agent_stop then claude rm (teardown). On conflict: abort + HUMAN_REQUIRED.
#   3. If marker is not "complete" (failed/absent): harvest-fail — keep worktree,
#      record HUMAN_REQUIRED, do NOT claude rm (R-HARVEST-FAIL).
#   4. Zero new worktrees: snapshot-anomaly or teardown-only — teardown session.
#   5. >1 new worktrees: ambiguous — harvest-fail, do NOT guess (R-HARVEST-FAIL).
#
# CALLER CONTRACT: agent_cleanup always returns 0 so that set -euo pipefail in the
# generated loop does not abort before case "$MARKER" runs. Failure paths communicate
# their outcome by reassigning the caller's MARKER variable (direct call, not subshell)
# to "human:<reason>" so the loop's case statement triggers human-required handling.
agent_cleanup() {
  local handle="$1" marker="${2:-}"
  case "$CA_BACKEND" in
    p)
      : # noop for p backend (R-PLEGACY)
      ;;
    bg)
      # --- Worktree discovery (T3: diff before/after snapshot) ---
      local repo_root snapshot_dir snapshot_file
      repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
      snapshot_dir="$repo_root/.ca-worktree-snapshots"
      snapshot_file="$snapshot_dir/$handle.txt"

      # Current worktree set.
      local cur_worktrees
      cur_worktrees=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)

      # Pre-dispatch snapshot (paths only, one per line).
      local pre_worktrees=""
      if [ -f "$snapshot_file" ]; then
        pre_worktrees=$(cat "$snapshot_file")
      fi

      # Diff: find paths present in cur but not in pre.
      local new_worktrees=""
      while IFS= read -r wt_path; do
        [ -z "$wt_path" ] && continue
        if ! printf '%s\n' "$pre_worktrees" | grep -qF "$wt_path"; then
          new_worktrees="${new_worktrees:+$new_worktrees
}$wt_path"
        fi
      done <<EOF
$cur_worktrees
EOF

      # Count new worktrees.
      local wt_count=0
      if [ -n "$new_worktrees" ]; then
        wt_count=$(printf '%s\n' "$new_worktrees" | grep -c '.' || true)
      fi

      local wt_path="" wt_branch=""

      if [ "$wt_count" -eq 0 ]; then
        # Zero new worktrees: claude --bg always auto-isolates, so this most likely
        # indicates a snapshot anomaly (missing/corrupt pre-dispatch snapshot) rather
        # than "agent made no commits". Teardown-only — no merge attempted.
        log "bg cleanup: no new worktree found for handle $handle (snapshot anomaly or teardown-only) — no merge needed"
        agent_stop "$handle"
        claude rm "$handle" 2>/dev/null || true
        return 0
      elif [ "$wt_count" -gt 1 ]; then
        log "ERROR: bg cleanup: $wt_count new worktrees found for handle $handle — ambiguous, refusing to harvest"
        log "  New worktrees: $new_worktrees"
        log "  Inspect manually, then merge and: claude rm $handle"
        _harvest_fail "$handle" "ambiguous worktrees ($wt_count new worktrees for handle $handle)"
        # Reassign caller's MARKER so the loop's case statement handles this as human-required.
        MARKER="human:harvest-ambiguous ($wt_count new worktrees for handle $handle)"
        return 0
      fi

      # Exactly one new worktree — derive branch name from path (worktree-<basename>).
      wt_path=$(printf '%s\n' "$new_worktrees" | head -1)
      local wt_name
      wt_name=$(basename "$wt_path")
      wt_branch="worktree-$wt_name"
      log "bg cleanup: discovered worktree $wt_path on branch $wt_branch"

      # --- Harvest decision: only merge on success marker ---
      if [ "$marker" != "complete" ]; then
        log "WARN: bg cleanup: marker='$marker' (not complete) — harvest-fail, retaining worktree"
        _harvest_fail "$handle" "marker=$marker (not complete)"
        # MARKER is already non-complete; leave it unchanged so the loop's case handles it.
        return 0
      fi

      # --- Merge: integrate worktree branch into working branch ---
      log "bg cleanup: merging $wt_branch into working branch (git merge --no-ff)"
      if git merge --no-ff "$wt_branch" -m "harvest(bg): merge $wt_branch from session $handle" 2>/dev/null; then
        log "bg cleanup: merge successful — tearing down session $handle"
        # Clean up snapshot file now that harvest succeeded.
        rm -f "$snapshot_file" 2>/dev/null || true
        # Order: stop then rm (R-HARVEST: teardown only after verified harvest).
        agent_stop "$handle"
        claude rm "$handle" 2>/dev/null || true
      else
        log "ERROR: bg cleanup: merge conflict on $wt_branch — aborting merge, retaining worktree"
        git merge --abort 2>/dev/null || true
        _harvest_fail "$handle" "merge conflict on $wt_branch"
        # Reassign caller's MARKER so the loop's case statement handles this as human-required.
        MARKER="human:harvest-conflict on $wt_branch"
        return 0
      fi
      ;;
  esac
  return 0
}

# _harvest_fail <handle> <reason>
# Records HUMAN_REQUIRED to the loop log and the HARVEST_LOG env var (if set).
# Does NOT call claude rm — the worktree is retained for manual inspection (R-HARVEST-FAIL).
_harvest_fail() {
  local handle="$1" reason="$2"
  local msg="HUMAN_REQUIRED: harvest failed for session $handle: $reason"
  log "$msg"
  if [ -n "${HARVEST_LOG:-}" ]; then
    printf '%s\n' "$msg" >> "$HARVEST_LOG" 2>/dev/null || true
  fi
}

# agent_invoke <model> [extra-flags...] -- [prompt-args...]
# Synchronous claude invocation for reviewers, implementer, and polish architect.
# Executes claude --dangerously-skip-permissions --permission-mode auto --output-format text
# with the given model and extra flags, passing remaining args to claude directly.
# Caller provides redirection (> outfile 2>stderr) and optional & for backgrounding.
# p backend: passes all args through to claude unchanged.
agent_invoke() {
  local model="$1"; shift
  case "$CA_BACKEND" in
    p)
      claude --dangerously-skip-permissions \
             --permission-mode auto \
             --output-format text \
             --model "$model" \
             "$@"
      ;;
    *) log "FATAL: unknown CA_BACKEND=$CA_BACKEND"; exit 1 ;;
  esac
}

`
}

// loopScriptPreLoop returns the variable initialization before the while loop.
func loopScriptPreLoop() string {
	return `# --- Main Loop ---
COMPLETED=0
FAILED_COUNT=0
SKIPPED=0
PROCESSED=""
LOOP_START=$(date +%s)

log "=========================================="
log "Infinity loop starting"
log "=========================================="
log "Config: max_retries=$MAX_RETRIES model=$MODEL"
[ -n "$EPIC_IDS" ] && log "Targeting epics: $EPIC_IDS" || log "Targeting: all ready epics"

`
}

// loopScriptWhileHeader returns the while-loop opening and per-epic setup.
func loopScriptWhileHeader() string {
	return `while true; do
  # Memory safety: clean up orphans and check memory before starting next epic
  cleanup_orphans
  if ! check_memory; then
    log "FATAL: Memory pressure too high, stopping loop to prevent system freeze"
    log "  Hint: set MIN_FREE_MEMORY_PCT (current: ${MIN_FREE_MEMORY_PCT}%) or kill background processes"
    FAILED_COUNT=$((FAILED_COUNT + 1))
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

`
}

func loopScriptEpicProcessing() string {
	return loopScriptAttemptSetup() + loopScriptAttemptCases()
}

func loopScriptAttemptSetup() string { //nolint:funlen // bash template string
	return `  while [ $ATTEMPT -le $MAX_RETRIES ]; do
    ATTEMPT=$((ATTEMPT + 1))
    TS=$(timestamp)
    LOGFILE="$LOG_DIR/loop_$EPIC_ID-$TS.log"
    TRACEFILE="$LOG_DIR/trace_$EPIC_ID-$TS.jsonl"

    write_status "running" "$EPIC_ID" "$ATTEMPT"

    # Update .latest symlink for ca watch (before claude invocation so watch can discover it)
    ln -sf "$(basename "$TRACEFILE")" "$LOG_DIR/.latest"

    log "Attempt $ATTEMPT/$((MAX_RETRIES + 1)) for $EPIC_ID (log: $LOGFILE)"

    # Clean stale phase state from previous epic or architect session
    ca phase-check clean 2>/dev/null || true

    if [ -n "${LOOP_DRY_RUN:-}" ]; then
      log "[DRY RUN] Would run claude session for $EPIC_ID"
      SUCCESS=true
      break
    fi

    PROMPT=$(build_prompt "$EPIC_ID")

    # Dispatch through backend seam; AGENT_HANDLE is set by agent_dispatch.
    # p backend:  AGENT_HANDLE = background subshell PID (wait + watchdogs apply)
    # bg backend: AGENT_HANDLE = 8-hex session id (poll loop applies; watchdogs are no-ops)
    MEM_LOG="$LOG_DIR/memory_${EPIC_ID}-${TS}.log"
    agent_dispatch "$LOGFILE" "$TRACEFILE" "$MODEL" "$PROMPT"

    if [ "$CA_BACKEND" = "p" ]; then
      # p backend: block until the streaming subshell exits, using watchdogs for safety.
      start_memory_watchdog "$AGENT_HANDLE" "$MEM_LOG"
      start_stale_watchdog "$AGENT_HANDLE" "$TRACEFILE" "$MEM_LOG"
      wait "$AGENT_HANDLE" 2>/dev/null || true
      stop_stale_watchdog
      stop_memory_watchdog

      # Detect if watchdog killed the session
      if [ -f "$MEM_LOG" ] && grep -q "STALE_WATCHDOG:" "$MEM_LOG" 2>/dev/null; then
        log "WARN: Session killed by stale output watchdog (see $MEM_LOG)"
        cleanup_orphans
      elif [ -f "$MEM_LOG" ] && grep -q "WATCHDOG:" "$MEM_LOG" 2>/dev/null; then
        log "WARN: Session killed by memory watchdog (see $MEM_LOG)"
        cleanup_orphans
      fi

      # Append stderr to macro log
      [ -f "$LOGFILE.stderr" ] && cat "$LOGFILE.stderr" >> "$LOGFILE" && rm -f "$LOGFILE.stderr"

      # Health check: warn if macro log extraction failed
      if [ -s "$TRACEFILE" ] && [ ! -s "$LOGFILE" ]; then
        log "WARN: Macro log is empty but trace has content (extract_text may have failed)"
      fi

    else
      # bg backend: poll state.json until terminal, with stale-liveness detection.
      # Stale liveness uses state.json mtime/inFlight heartbeat (G3: transcript is end-only).
      # ca watch: TRACEFILE (.latest symlink target) receives synthetic poll-status events
      # each iteration so ca watch shows live progress during bg sessions (R-FRAMEWORK).
      bg_last_update="" bg_stale_secs=0 bg_state_file="$HOME/.claude/jobs/$AGENT_HANDLE/state.json"
      bg_killed=false
      while true; do
        poll_result=""
        poll_result=$(agent_poll "$AGENT_HANDLE")
        if [ "$poll_result" != "running" ]; then
          break
        fi

        # Write a synthetic poll-status event to TRACEFILE for ca watch live view.
        # Format: stream-json content_block_delta so readAndFormat renders it as text.
        # agent_collect will overwrite TRACEFILE with the real transcript at end-of-session.
        printf '{"type":"content_block_delta","timestamp":"%s","delta":{"type":"text_delta","text":"[bg poll] session %s state=running (stale_secs=%d)\\n"}}\n' \
          "$(date '+%Y-%m-%dT%H:%M:%SZ')" "$AGENT_HANDLE" "$bg_stale_secs" >> "$TRACEFILE" 2>/dev/null || true

        # Stale-liveness: track state.json modification time (G3: transcript absent mid-run).
        bg_cur_mtime=""
        if [ -f "$bg_state_file" ]; then
          bg_cur_mtime=$(stat -c '%Y' "$bg_state_file" 2>/dev/null || stat -f '%m' "$bg_state_file" 2>/dev/null || true)
        fi
        if [ -n "$bg_cur_mtime" ] && [ "$bg_cur_mtime" = "$bg_last_update" ]; then
          bg_stale_secs=$((bg_stale_secs + BG_POLL_INTERVAL))
          if [ "$bg_stale_secs" -ge "$SESSION_STALE_TIMEOUT" ]; then
            echo "[$(date '+%Y-%m-%d_%H-%M-%S')] STALE_WATCHDOG: bg session $AGENT_HANDLE stale for ${bg_stale_secs}s — escalating kill ladder" >> "$MEM_LOG"
            log "WARN: bg session $AGENT_HANDLE stale for ${bg_stale_secs}s — escalating via bg_kill_ladder"
            bg_kill_ladder "$AGENT_HANDLE" "stale" "$MEM_LOG"
            bg_killed=true
            break
          fi
        else
          bg_stale_secs=0
          bg_last_update="$bg_cur_mtime"
        fi

        # Memory watchdog: check memory pressure and stop bg session if needed.
        bg_mem_pct=""
        bg_mem_pct=$(get_memory_pct)
        if [ -n "$bg_mem_pct" ] && [ "$bg_mem_pct" -lt "$WATCHDOG_THRESHOLD" ] 2>/dev/null; then
          echo "[$(date '+%Y-%m-%d_%H-%M-%S')] WATCHDOG: bg session $AGENT_HANDLE memory ${bg_mem_pct}% < ${WATCHDOG_THRESHOLD}% — escalating kill ladder" >> "$MEM_LOG"
          log "WARN: memory ${bg_mem_pct}% < ${WATCHDOG_THRESHOLD}%, escalating via bg_kill_ladder"
          bg_kill_ladder "$AGENT_HANDLE" "memory ${bg_mem_pct}%" "$MEM_LOG"
          bg_killed=true
          break
        fi

        sleep "$BG_POLL_INTERVAL"
      done

      if [ "$bg_killed" = true ]; then
        log "WARN: bg session $AGENT_HANDLE was killed by watchdog (see $MEM_LOG)"
        cleanup_orphans
      fi

      # Collect: populate LOGFILE (and TRACEFILE) from state.json/.output/.detail/transcript
      # so the existing detect_marker anchored patterns work unchanged (R-MARKER).
      agent_collect "$AGENT_HANDLE" "$LOGFILE" "$TRACEFILE"
    fi

    MARKER=$(detect_marker "$LOGFILE" "$TRACEFILE")

    # bg backend: harvest worktree and tear down session now that the marker is known.
    # The cleanup is marker-aware: success -> merge + teardown; failure -> keep worktree.
    # p backend: agent_cleanup is a noop.
    agent_cleanup "$AGENT_HANDLE" "$MARKER"
`
}

func loopScriptAttemptCases() string {
	return `    case "$MARKER" in
      (complete)
        log "Epic $EPIC_ID completed successfully"
        SUCCESS=true
        break
        ;;
      (human:*)
        REASON="${MARKER#human:}"
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
    esac

    if [ $ATTEMPT -le $MAX_RETRIES ]; then
      log "Retrying $EPIC_ID..."
      cleanup_orphans
      sleep 5
    fi
  done

`
}

// loopScriptEpicResult returns the per-epic result handling inside the while loop.
// The periodicTrigger is injected into the success branch.
func loopScriptEpicResult(periodicTrigger string) string { //nolint:funlen // bash template string
	return `  EPIC_DURATION=$(( $(date +%s) - EPIC_START ))

  if [ "$SUCCESS" = true ]; then
    if [ -z "${LOOP_DRY_RUN:-}" ]; then
    # Verify working tree is clean after epic completion
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      log "WARN: Working tree dirty after epic completion, auto-committing"
      git add -A && git commit -m "chore: auto-commit uncommitted changes from $EPIC_ID" 2>/dev/null || true
    fi
    COMPLETED=$((COMPLETED + 1))
    log_result "$EPIC_ID" "complete" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID done. Completed so far: $COMPLETED"
` + periodicTrigger + `
    fi
  elif [ "$SUCCESS" = skip ]; then
    SKIPPED=$((SKIPPED + 1))
    log_result "$EPIC_ID" "skipped" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID skipped (human required). Continuing."
  else
    FAILED_COUNT=$((FAILED_COUNT + 1))
    log_result "$EPIC_ID" "failed" "$ATTEMPT" "$EPIC_DURATION"
    log "Epic $EPIC_ID failed after $((MAX_RETRIES + 1)) attempts. Stopping loop."
    PROCESSED="$PROCESSED $EPIC_ID"
    break
  fi

  PROCESSED="$PROCESSED $EPIC_ID"
done

`
}

// loopScriptPostLoop returns the post-loop section: final review trigger, summary, git push.
func loopScriptPostLoop(finalTrigger string) string {
	exit := `# Zero-work detection: exit 2 if no epics completed and none failed
if [ "$COMPLETED" -eq 0 ] && [ "$FAILED_COUNT" -eq 0 ]; then
  log "WARN: Zero epics completed -- all may be blocked or skipped"
  exit 2
fi
[ $FAILED_COUNT -eq 0 ] && exit 0 || exit 1
`

	return finalTrigger + `
TOTAL_DURATION=$(( $(date +%s) - LOOP_START ))

if [ -z "${LOOP_DRY_RUN:-}" ]; then
echo "{\"type\":\"summary\",\"completed\":$COMPLETED,\"failed\":$FAILED_COUNT,\"skipped\":$SKIPPED,\"total_duration_s\":$TOTAL_DURATION}" >> "$EXEC_LOG"
write_status "idle"

# Push to remote if available
if git remote get-url origin >/dev/null 2>&1; then
  log "Pushing to remote..."
  git push 2>&1 || log "WARN: git push failed (check SSH/auth)"
fi
fi

log "=========================================="
log "Loop finished"
log "  Completed: $COMPLETED"
log "  Failed:    $FAILED_COUNT"
log "  Skipped:   $SKIPPED"
log "  Duration:  ${TOTAL_DURATION}s ($(( TOTAL_DURATION / 60 ))m)"
log "  Processed: $PROCESSED"
log "=========================================="
` + exit
}

// ========================== watch ==========================

func watchCmd() *cobra.Command {
	var (
		epicID string
		follow bool
		logDir string
	)

	cmd := &cobra.Command{
		Use:   "watch",
		Short: "Tail and pretty-print live trace from infinity loop sessions",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runWatch(cmd, epicID, follow, logDir)
		},
	}

	cmd.Flags().StringVar(&epicID, "epic", "", "Watch a specific epic trace")
	cmd.Flags().BoolVar(&follow, "follow", false, "Follow the file (not yet implemented, reads once)")
	cmd.Flags().StringVar(&logDir, "log-dir", "", "Log directory (default: .compound-agent/agent_logs/)")
	// Support --no-follow
	cmd.Flags().Lookup("follow").NoOptDefVal = "true"
	return cmd
}

// runWatch implements the RunE body for the watch command.
func runWatch(cmd *cobra.Command, epicID string, follow bool, logDir string) error {
	if logDir == "" {
		repoRoot := util.GetRepoRoot()
		logDir = filepath.Join(repoRoot, ".compound-agent", "agent_logs")
	}

	traceFile := resolveTraceFile(cmd, epicID, logDir)
	if traceFile == "" {
		return nil
	}

	cmd.Printf("[info] Watching: %s\n", traceFile)

	if follow {
		return tailFollow(cmd, traceFile)
	}
	return readAndFormat(cmd, traceFile)
}

// resolveTraceFile finds the appropriate trace file based on flags.
// Returns empty string and prints a message if no trace is found.
func resolveTraceFile(cmd *cobra.Command, epicID string, logDir string) string {
	if epicID != "" {
		traceFile := findTraceForEpic(logDir, epicID)
		if traceFile == "" {
			cmd.Printf("[error] No trace file found for epic: %s\n", epicID)
		}
		return traceFile
	}
	traceFile := findLatestTrace(logDir, "trace_")
	if traceFile == "" {
		cmd.Println("[info] No active trace found. Run `ca loop` first.")
	}
	return traceFile
}

func findLatestTrace(logDir, prefix string) string {
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		return ""
	}

	// Check .latest symlink first
	latestPath := filepath.Join(logDir, ".latest")
	if target, err := os.Readlink(latestPath); err == nil {
		resolved := filepath.Join(logDir, target)
		if _, err := os.Stat(resolved); err == nil && strings.HasPrefix(target, prefix) {
			return resolved
		}
	}

	// Fallback: find most recent file
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return ""
	}

	var matches []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ".jsonl") {
			matches = append(matches, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(matches)))
	if len(matches) > 0 {
		return filepath.Join(logDir, matches[0])
	}
	return ""
}

func findTraceForEpic(logDir, epicID string) string {
	// Reject path separators to prevent directory traversal
	if strings.ContainsAny(epicID, "/\\") {
		return ""
	}
	prefix := fmt.Sprintf("trace_%s-", epicID)
	return findLatestTrace(logDir, prefix)
}

// streamEvent represents a parsed stream-json event.
type streamEvent struct {
	Type         string `json:"type"`
	Timestamp    string `json:"timestamp,omitempty"`
	ContentBlock *struct {
		Type string `json:"type"`
		Name string `json:"name,omitempty"`
	} `json:"content_block,omitempty"`
	Delta *struct {
		Type string `json:"type"`
		Text string `json:"text,omitempty"`
	} `json:"delta,omitempty"`
	Message *struct {
		Usage *struct {
			InputTokens  int `json:"input_tokens,omitempty"`
			OutputTokens int `json:"output_tokens,omitempty"`
		} `json:"usage,omitempty"`
	} `json:"message,omitempty"`
	Usage *struct {
		OutputTokens int `json:"output_tokens,omitempty"`
	} `json:"usage,omitempty"`
	Result string `json:"result,omitempty"`
}

func formatStreamEvent(event streamEvent) string {
	ts := formatEventTime(event.Timestamp)

	switch event.Type {
	case "content_block_start":
		return formatContentBlockStart(ts, event)
	case "content_block_delta":
		return formatContentBlockDelta(ts, event)
	case "message_delta":
		return formatMessageDelta(ts, event)
	case "message_start":
		return formatMessageStart(ts, event)
	case "result":
		return formatResultEvent(ts, event)
	}
	return ""
}

// formatContentBlockStart formats a content_block_start event.
func formatContentBlockStart(ts string, event streamEvent) string {
	if event.ContentBlock == nil {
		return ""
	}
	if event.ContentBlock.Type == "tool_use" {
		return fmt.Sprintf("%s TOOL    %s", ts, event.ContentBlock.Name)
	}
	if event.ContentBlock.Type == "thinking" {
		return fmt.Sprintf("%s THINK   thinking...", ts)
	}
	return ""
}

// formatContentBlockDelta formats a content_block_delta event.
func formatContentBlockDelta(ts string, event streamEvent) string {
	if event.Delta == nil || event.Delta.Type != "text_delta" {
		return ""
	}
	text := strings.ReplaceAll(event.Delta.Text, "\n", " ")
	if len(text) > 60 {
		text = text[:57] + "..."
	}
	return fmt.Sprintf("%s TEXT    %s", ts, text)
}

// formatMessageDelta formats a message_delta event.
func formatMessageDelta(ts string, event streamEvent) string {
	if event.Usage != nil && event.Usage.OutputTokens > 0 {
		return fmt.Sprintf("%s TOKENS  %d out (final)", ts, event.Usage.OutputTokens)
	}
	return ""
}

// formatMessageStart formats a message_start event.
func formatMessageStart(ts string, event streamEvent) string {
	if event.Message != nil && event.Message.Usage != nil {
		return fmt.Sprintf("%s TOKENS  %d in / %d out", ts,
			event.Message.Usage.InputTokens, event.Message.Usage.OutputTokens)
	}
	return ""
}

// formatResultEvent formats a result event, extracting any known markers.
func formatResultEvent(ts string, event streamEvent) string {
	if event.Result == "" {
		return ""
	}
	markers := []string{
		"EPIC_COMPLETE", "EPIC_FAILED", "HUMAN_REQUIRED", "FAILED",
	}
	for _, m := range markers {
		if !strings.Contains(event.Result, m) {
			continue
		}
		line := extractMarkerLine(event.Result, m)
		if len(line) > 120 {
			line = line[:117] + "..."
		}
		return fmt.Sprintf("%s MARKER  %s", ts, line)
	}
	return ""
}

// extractMarkerLine finds the line containing the marker in the result text.
func extractMarkerLine(result, marker string) string {
	for _, l := range strings.Split(result, "\n") {
		if strings.Contains(l, marker) {
			return l
		}
	}
	return result
}

func formatEventTime(timestamp string) string {
	if timestamp == "" {
		return time.Now().Format("15:04:05")
	}
	t, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return time.Now().Format("15:04:05")
	}
	return t.Format("15:04:05")
}

func readAndFormat(cmd *cobra.Command, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open trace: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event streamEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		formatted := formatStreamEvent(event)
		if formatted != "" {
			cmd.Println(formatted)
		}
	}
	return scanner.Err()
}

func tailFollow(cmd *cobra.Command, path string) error {
	// For simplicity, just read and format (follow mode would need goroutines + fsnotify)
	// In practice, the bash script's `tail -f` is more reliable
	return readAndFormat(cmd, path)
}

// ========================== audit ==========================

type auditFinding struct {
	File     string `json:"file,omitempty"`
	Issue    string `json:"issue"`
	Severity string `json:"severity"` // "error", "warning", "info"
	Source   string `json:"source"`   // "rule", "pattern", "lesson"
}

type auditReport struct {
	Findings []auditFinding `json:"findings"`
	Summary  struct {
		Errors   int `json:"errors"`
		Warnings int `json:"warnings"`
		Infos    int `json:"infos"`
	} `json:"summary"`
}

func auditCmd() *cobra.Command {
	var (
		repoRoot string
		jsonOut  bool
	)

	cmd := &cobra.Command{
		Use:   "audit",
		Short: "Run audit checks against the codebase",
		RunE: func(cmd *cobra.Command, args []string) error {
			if repoRoot == "" {
				repoRoot = util.GetRepoRoot()
			}

			report := runAuditChecks(repoRoot)

			if jsonOut {
				data, err := json.MarshalIndent(report, "", "  ")
				if err != nil {
					return fmt.Errorf("marshal audit report: %w", err)
				}
				cmd.Println(string(data))
				return nil
			}

			for _, f := range report.Findings {
				label := strings.ToUpper(f.Severity)
				filePart := ""
				if f.File != "" {
					filePart = " " + f.File
				}
				cmd.Printf("%s [%s]%s -- %s\n", label, f.Source, filePart, f.Issue)
			}

			cmd.Println()
			cmd.Printf("Audit: %d finding(s), %d error(s), %d warning(s), %d info(s)\n",
				len(report.Findings), report.Summary.Errors, report.Summary.Warnings, report.Summary.Infos)
			return nil
		},
	}

	cmd.Flags().StringVar(&repoRoot, "repo-root", "", "Repository root")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output as JSON")
	return cmd
}

func runAuditChecks(repoRoot string) auditReport {
	var findings []auditFinding

	findings = append(findings, checkClaudeDir(repoRoot)...)
	findings = append(findings, checkLessonsIndex(repoRoot)...)
	findings = append(findings, checkHooksConfigured(repoRoot)...)
	findings = append(findings, checkGitignore(repoRoot)...)
	findings = append(findings, checkLessonHealth(repoRoot)...)

	return buildAuditReport(findings)
}

// checkClaudeDir checks whether the .claude/ directory exists.
func checkClaudeDir(repoRoot string) []auditFinding {
	if _, err := os.Stat(filepath.Join(repoRoot, ".claude")); os.IsNotExist(err) {
		return []auditFinding{{
			Issue:    ".claude/ directory missing — run ca init",
			Severity: "error",
			Source:   "rule",
		}}
	}
	return nil
}

// checkLessonsIndex checks whether the lessons index file exists.
func checkLessonsIndex(repoRoot string) []auditFinding {
	indexPath := filepath.Join(repoRoot, ".claude", "lessons", "index.jsonl")
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		return []auditFinding{{
			Issue:    "Lessons index missing — run ca init",
			Severity: "error",
			Source:   "rule",
		}}
	}
	return nil
}

// checkHooksConfigured checks whether Claude Code hooks are fully configured.
func checkHooksConfigured(repoRoot string) []auditFinding {
	settingsPath := filepath.Join(repoRoot, ".claude", "settings.json")
	settings, err := setup.ReadClaudeSettings(settingsPath)
	if err != nil || !setup.HasAllHooks(settings) {
		return []auditFinding{{
			Issue:    "Claude Code hooks not fully configured — run ca setup claude",
			Severity: "warning",
			Source:   "rule",
		}}
	}
	return nil
}

// checkGitignore checks whether .claude/.gitignore exists.
func checkGitignore(repoRoot string) []auditFinding {
	gitignorePath := filepath.Join(repoRoot, ".claude", ".gitignore")
	if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
		return []auditFinding{{
			Issue:    ".claude/.gitignore missing — run ca init",
			Severity: "warning",
			Source:   "rule",
		}}
	}
	return nil
}

// checkLessonHealth checks lesson age and count for potential issues.
func checkLessonHealth(repoRoot string) []auditFinding {
	result, err := memory.ReadItems(repoRoot)
	if err != nil {
		return nil
	}

	var findings []auditFinding
	oldCount := countOldLessons(result.Items)
	if oldCount > 0 {
		findings = append(findings, auditFinding{
			Issue:    fmt.Sprintf("%d lesson(s) are over 90 days old — review for validity", oldCount),
			Severity: "info",
			Source:   "lesson",
		})
	}
	if len(result.Items) > 50 {
		findings = append(findings, auditFinding{
			Issue:    fmt.Sprintf("%d lessons in index — consider running ca compact", len(result.Items)),
			Severity: "info",
			Source:   "lesson",
		})
	}
	return findings
}

// buildAuditReport constructs an auditReport from a slice of findings.
func buildAuditReport(findings []auditFinding) auditReport {
	report := auditReport{Findings: findings}
	if report.Findings == nil {
		report.Findings = []auditFinding{}
	}
	for _, f := range findings {
		switch f.Severity {
		case "error":
			report.Summary.Errors++
		case "warning":
			report.Summary.Warnings++
		case "info":
			report.Summary.Infos++
		}
	}
	return report
}

func registerScriptCommands(rootCmd *cobra.Command) {
	rootCmd.AddCommand(loopCmd())
	rootCmd.AddCommand(polishCmd())
	rootCmd.AddCommand(watchCmd())
	rootCmd.AddCommand(auditCmd())
}
