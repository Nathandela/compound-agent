package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/nathandelacretaz/compound-agent/internal/util"
	"github.com/spf13/cobra"
)

// polishCmdOptions captures all flag values for the polish command.
type polishCmdOptions struct {
	output, model, specFile, metaEpic, reviewers string
	backend                                      string
	cycles, compactPct                           int
	force                                        bool
}

func polishCmd() *cobra.Command {
	var o polishCmdOptions

	cmd := &cobra.Command{
		Use:   "polish",
		Short: "Generate polish loop script (audit fleet + polish architect + inner loop)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runPolish(cmd, &o)
		},
	}

	cmd.Flags().StringVarP(&o.output, "output", "o", ".compound-agent/polish-loop.sh", "Output script path")
	cmd.Flags().IntVar(&o.cycles, "cycles", 3, "Number of polish cycles")
	cmd.Flags().StringVar(&o.model, "model", "claude-opus-4-7[1m]", "Claude model to use")
	cmd.Flags().StringVar(&o.specFile, "spec-file", "", "Path to spec file for audit context (required)")
	cmd.Flags().StringVar(&o.metaEpic, "meta-epic", "", "Parent meta-epic ID (required)")
	cmd.Flags().StringVar(&o.reviewers, "reviewers", "claude-sonnet,claude-opus,gemini,codex", "Comma-separated reviewers")
	cmd.Flags().BoolVarP(&o.force, "force", "f", false, "Overwrite existing script")
	cmd.Flags().IntVar(&o.compactPct, "compact-pct", 0, "Context auto-compaction threshold % (0=use Claude Code default, suggested: 50)")
	cmd.Flags().StringVar(&o.backend, "backend", "bg", "Claude execution backend: bg (default) or p (legacy claude -p)")
	return cmd
}

func runPolish(cmd *cobra.Command, o *polishCmdOptions) error {
	if o.compactPct < 0 || o.compactPct > 100 {
		return fmt.Errorf("--compact-pct must be 0-100, got %d", o.compactPct)
	}
	if o.backend != "bg" && o.backend != "p" {
		return fmt.Errorf("--backend must be 'bg' or 'p', got %q", o.backend)
	}
	if o.specFile == "" {
		return fmt.Errorf("--spec-file is required")
	}
	if o.metaEpic == "" {
		return fmt.Errorf("--meta-epic is required")
	}
	if !o.force {
		if _, err := os.Stat(o.output); err == nil {
			return fmt.Errorf("file %s already exists (use --force to overwrite)", o.output)
		}
	}

	reviewerList := strings.Split(o.reviewers, ",")
	if err := validateReviewers(reviewerList); err != nil {
		return err
	}

	backendExplicit := cmd.Flags().Changed("backend")
	script := generatePolishScript(polishGenerateOptions{
		cycles:          o.cycles,
		compactPct:      o.compactPct,
		model:           o.model,
		specFile:        o.specFile,
		metaEpic:        o.metaEpic,
		reviewers:       reviewerList,
		backend:         o.backend,
		backendExplicit: backendExplicit,
	})

	if err := os.MkdirAll(filepath.Dir(o.output), 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	if err := os.WriteFile(o.output, []byte(script), 0755); err != nil {
		return fmt.Errorf("write script: %w", err)
	}

	cmd.Printf("[ok] Generated polish script: %s\n", o.output)
	cmd.Println("Run it with: bash " + o.output)
	return nil
}

// polishGenerateOptions holds all options for generating the polish script.
type polishGenerateOptions struct {
	cycles          int
	compactPct      int
	model           string
	specFile        string
	metaEpic        string
	reviewers       []string
	backend         string // "bg" or "p"
	backendExplicit bool   // true if user passed --backend explicitly
}

func generatePolishScript(opts polishGenerateOptions) string {
	return polishScriptConfig(opts) +
		polishScriptCrashHandler() +
		polishScriptTimeout() +
		polishScriptPrerequisites() +
		polishScriptSeam(opts.backend, opts.backendExplicit) +
		polishScriptReviewerDetection() +
		polishScriptAuditPrompt() +
		polishScriptRunAudit() +
		polishScriptSynthesizeReport() +
		polishScriptPolishArchitect() +
		polishScriptInnerLoop() +
		polishScriptMainLoop() +
		polishScriptPostLoop()
}

// polishScriptSeam returns the backend seam for the polish script.
// Includes agent_invoke (p backend), bg_dispatch_reviewer, bg_poll_reviewer,
// and bg_collect_reviewer (bg backend) for the audit fleet and architect.
// CA_BACKEND mirrors the loop script seam.
func polishScriptSeam(backend string, explicit bool) string { //nolint:funlen // bash template string
	caBackendLine := loopScriptCABackendLine(backend, explicit)
	var preflight string
	if backend == "bg" {
		preflight = loopScriptBootstrapPreflight()
	}
	return `# --- Backend Seam (R-SEAM) ---
# CA_BACKEND selects the claude execution backend: "p" (legacy) or "bg".
` + caBackendLine + `
` + preflight + `
# BG_POLL_INTERVAL: seconds between state.json polls for reviewer bg sessions.
BG_POLL_INTERVAL=${BG_POLL_INTERVAL:-15}

# agent_invoke <model> [extra-flags...] -- [prompt-args...]
# Synchronous claude invocation for reviewers and polish architect (p backend).
# p backend: passes all flags through to claude unchanged.
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
    bg)
      # bg backend: agent_invoke is not used for direct calls in the polish script;
      # audit/architect use bg_dispatch_reviewer_polish + bg_poll_reviewer + bg_collect_reviewer.
      # If called directly (e.g. from legacy call sites), fall through to p for safety.
      claude --dangerously-skip-permissions \
             --permission-mode auto \
             --output-format text \
             --model "$model" \
             "$@"
      ;;
    *) log "FATAL: unknown CA_BACKEND=$CA_BACKEND"; exit 1 ;;
  esac
}

# bg_dispatch_reviewer_polish <label> <model> <prompt_file> -> sets BG_POLISH_HANDLE_<label>
# Dispatches claude --bg for a single-shot polish reviewer or architect turn.
# Writes a pre-dispatch worktree snapshot (T3 infra) keyed to short_id so that
# bg_collect_reviewer can identify the session's worktree via set-diff and perform
# the commit-safety check (T3/T4 invariant: structural check before every claude rm).
bg_dispatch_reviewer_polish() {
  local label="$1" model="$2" prompt_file="$3"
  # Snapshot the current worktree set BEFORE dispatching (T3 infra: identify new worktree later).
  local pre_snapshot
  pre_snapshot=$(git worktree list --porcelain 2>/dev/null | grep '^worktree ' | awk '{print $2}' || true)
  local raw_output
  raw_output=$(claude --bg \
    --dangerously-skip-permissions \
    --permission-mode auto \
    --model "$model" \
    "$(cat "$prompt_file")" 2>&1 || true)
  local short_id
  short_id=$(printf '%s' "$raw_output" | sed 's/\x1b\[[0-9;]*m//g' | \
    grep -oE 'backgrounded[[:space:]]*[·•][[:space:]]*([0-9a-f]{8})' | \
    grep -oE '[0-9a-f]{8}' | head -1 || true)
  if [ -z "$short_id" ] || ! printf '%s' "$short_id" | grep -qE '^[0-9a-f]{8}$'; then
    log "WARN: bg polish dispatch failed for $label: could not parse short id"
    return 1
  fi
  # Write pre-dispatch snapshot keyed to short_id (T3 infra: bg_collect_reviewer uses this
  # to identify the reviewer's worktree via set-diff and run the commit-safety check).
  local snapshot_dir
  snapshot_dir="$(git rev-parse --show-toplevel 2>/dev/null || true)/.ca-worktree-snapshots"
  if [ -n "$snapshot_dir" ] && [ "$snapshot_dir" != "/.ca-worktree-snapshots" ]; then
    mkdir -p "$snapshot_dir" 2>/dev/null || true
    printf '%s\n' "$pre_snapshot" > "$snapshot_dir/$short_id.txt" 2>/dev/null || true
  fi
  local safe_label
  safe_label=$(printf '%s' "$label" | tr '-' '_' | tr '.' '_')
  eval "BG_POLISH_HANDLE_${safe_label}=$short_id"
  log "bg polish session dispatched: label=$label short_id=$short_id"
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
# Extracts output from state.json into report_file; tears down ephemeral bg session.
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
  # Use the pre-dispatch snapshot (written by bg_dispatch_reviewer_polish) to find the worktree.
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

// polishScriptConfig returns the header and config section.
func polishScriptConfig(opts polishGenerateOptions) string {
	timestamp := time.Now().Format(time.RFC3339)
	escapedModel := util.ShellEscape(opts.model)
	escapedMetaEpic := util.ShellEscape(opts.metaEpic)
	escapedSpecFile := util.ShellEscape(opts.specFile)
	escapedReviewers := util.ShellEscape(strings.Join(opts.reviewers, " "))

	compactLine := ""
	if opts.compactPct > 0 {
		compactLine = fmt.Sprintf("export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=%d  # Trigger context compaction at %d%% capacity\n", opts.compactPct, opts.compactPct)
	}

	return fmt.Sprintf(`#!/usr/bin/env bash
# Polish Loop - Generated by: ca polish
# Date: %s
# Iterates N cycles of: audit fleet -> polish architect -> inner infinity loop
#
# Usage:
#   .compound-agent/polish-loop.sh
#   POLISH_DRY_RUN=1 .compound-agent/polish-loop.sh  # Preview without executing

set -euo pipefail

# Config
CYCLES=%d
MODEL=%s
META_EPIC=%s
SPEC_FILE=%s
CONFIGURED_REVIEWERS=%s
LOG_DIR=".compound-agent/agent_logs"
REVIEW_TIMEOUT=${REVIEW_TIMEOUT:-600}
%s
mkdir -p "$LOG_DIR"

# --- Logging ---
log() {
  echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] [polish] $*" >&2
}

`, timestamp, opts.cycles, escapedModel, escapedMetaEpic,
		escapedSpecFile, escapedReviewers, compactLine)
}

// polishScriptCrashHandler returns the EXIT trap.
func polishScriptCrashHandler() string {
	return `# --- Crash Handler ---
_polish_cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "Polish loop crashed with exit code $exit_code at line ${BASH_LINENO[0]:-unknown}"
    echo "{\"status\":\"crashed\",\"exit_code\":$exit_code,\"cycle\":${cycle:-0},\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"line\":\"${BASH_LINENO[0]:-unknown}\"}" > "$LOG_DIR/.polish-status.json"
    exit $exit_code
  fi
}
trap _polish_cleanup EXIT

`
}

// polishScriptTimeout returns the portable_timeout function.
func polishScriptTimeout() string {
	return `# --- Portable Timeout ---
# GNU timeout -> gtimeout (macOS Homebrew) -> shell fallback
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

`
}

// polishScriptPrerequisites returns the prerequisite checks.
func polishScriptPrerequisites() string {
	return `# --- Prerequisites ---
command -v claude >/dev/null 2>&1 || { echo "ERROR: claude CLI not found"; exit 1; }
command -v bd >/dev/null 2>&1 || { echo "ERROR: bd CLI not found"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "ERROR: npx not found (needed for inner loop)"; exit 1; }
[ -f "$SPEC_FILE" ] || { log "ERROR: spec file not found: $SPEC_FILE"; exit 1; }

`
}

// polishScriptReviewerDetection returns the reviewer CLI detection function with health checks.
func polishScriptReviewerDetection() string {
	return `# --- Reviewer Detection ---
detect_polish_reviewers() {
  AVAILABLE_REVIEWERS=""
  for reviewer in $CONFIGURED_REVIEWERS; do
    local cli_name
    case "$reviewer" in
      (claude-sonnet|claude-opus) cli_name="claude" ;;
      (gemini)                    cli_name="gemini" ;;
      (codex)                     cli_name="codex" ;;
      (*) log "WARN: unknown reviewer $reviewer"; continue ;;
    esac
    if ! command -v "$cli_name" >/dev/null 2>&1; then
      log "WARN: $reviewer configured but $cli_name CLI not found -- skipping"
      continue
    fi
    if ! portable_timeout 10 "$cli_name" --version >/dev/null 2>&1; then
      log "WARN: $reviewer configured but $cli_name health check failed -- skipping"
      continue
    fi
    AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS $reviewer"
  done
  AVAILABLE_REVIEWERS="${AVAILABLE_REVIEWERS# }"
  if [ -z "$AVAILABLE_REVIEWERS" ]; then
    log "ERROR: no reviewer CLIs available"
    exit 1
  fi
  log "Available reviewers: $AVAILABLE_REVIEWERS"
}

`
}

// polishScriptAuditPrompt returns the build_audit_prompt function.
func polishScriptAuditPrompt() string { //nolint:funlen // bash template string
	return `# --- Audit Prompt (Full-Spectrum Quality Audit) ---
build_audit_prompt() {
  local cycle_num="$1"
  local spec_content
  spec_content=$(cat "$SPEC_FILE" 2>/dev/null || echo "(spec file not found)")

  cat <<'AUDIT_PROMPT_EOF'
You are a senior quality auditor performing a holistic review of the ENTIRE implementation.
Audit EVERYTHING -- code, architecture, security, testing, error handling, AND user-facing
quality. This is not just a UI checklist. Every dimension matters.

## Your Task
1. Read the codebase thoroughly (source code, tests, config, docs)
2. Evaluate against ALL sections of the quality checklist below
3. Produce a structured report with P0/P1/P2 findings
4. Tag any finding that requires browser/runtime verification with [NEEDS_QA]

## Full-Spectrum Quality Checklist

### 1. Code Quality and Architecture
- [ ] Clean module boundaries -- no circular dependencies, clear responsibilities
- [ ] Consistent naming conventions across the codebase
- [ ] No dead code, unused imports, or commented-out blocks
- [ ] Functions are focused and short (< 50 lines, single responsibility)
- [ ] No code duplication -- shared logic is properly extracted
- [ ] Error handling is consistent and thorough (no swallowed errors)
- [ ] Logging is meaningful (not too verbose, not silent on failures)
- [ ] Configuration is externalized (no hardcoded URLs, keys, or magic numbers)
- [ ] Data flows are clear and traceable

### 2. Security
- [ ] No secrets or credentials in source code
- [ ] Input validation at all system boundaries (forms, APIs, URL params)
- [ ] SQL/NoSQL injection protection (parameterized queries, ORMs)
- [ ] XSS protection (output encoding, CSP headers)
- [ ] Authentication and authorization checks on all protected routes
- [ ] CORS configured correctly (not wildcard in production)
- [ ] Dependencies are up to date (no known CVEs)
- [ ] Sensitive data not logged or exposed in error messages

### 3. Testing
- [ ] Test coverage is meaningful (not just line count -- tests verify behavior)
- [ ] Edge cases are tested (empty input, boundary values, error paths)
- [ ] No flaky tests (tests pass consistently)
- [ ] Integration tests exist for critical paths
- [ ] Tests are independent (no shared mutable state between tests)
- [ ] Test data is realistic (not trivial "foo"/"bar" stubs)
- [ ] Error scenarios are tested (network failures, invalid data, timeouts)

### 4. Error Handling and Resilience
- [ ] User-facing errors are clear and actionable (not stack traces)
- [ ] Network failures are handled gracefully (retry, fallback)
- [ ] Loading states prevent jank and race conditions (if UI)
- [ ] Partial failures don't crash the whole application
- [ ] Timeouts are configured for external calls
- [ ] Validation errors are specific (not just "invalid input")

### 5. Performance
- [ ] No N+1 queries or excessive API calls
- [ ] No memory leaks (event listeners cleaned up, subscriptions unsubscribed)
- [ ] Assets are optimized -- images, fonts, bundles (if web UI)
- [ ] Lazy loading for below-fold content (if web UI)
- [ ] Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1 (if web UI)
- [ ] Font loading strategy -- font-display, preload, size-adjust fallbacks (if web UI)
- [ ] Bundle size is reasonable -- tree-shaking, code splitting (if web UI)

### 6. UI States and Interaction (if applicable)
- [ ] 5 states per data view: loading, empty, error, offline, partial data
- [ ] hover/active/focus/disabled states on interactive elements
- [ ] Press feedback within 100ms
- [ ] Validation feedback is inline and immediate
- [ ] Page transitions are smooth and purposeful

### 7. Visual Craft (if applicable)
- [ ] 3+ levels of typography hierarchy (size, weight, color)
- [ ] Geometric spacing scale (4/8/16/24/32/48/64) -- no arbitrary values
- [ ] Semantic color tokens (not raw hex)
- [ ] Consistent icon style and sizing
- [ ] No borders where spacing, background, or shadow would work

### 8. Responsiveness (if applicable)
- [ ] Mobile is first-class (different IA, content priority, interaction patterns)
- [ ] 44x44px minimum touch targets
- [ ] Fluid typography (clamp or viewport units)
- [ ] No horizontal scroll on any breakpoint

### 9. Accessibility (if applicable)
- [ ] Semantic HTML (not div soup)
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Keyboard navigation works (visible focus indicators)
- [ ] ARIA only where semantic HTML is insufficient
- [ ] prefers-reduced-motion respected

### 10. Common AI Laziness Anti-Patterns
- [ ] NOT shallow implementations -- deep interfaces, not pass-through wrappers
- [ ] NOT generic/placeholder code -- curated, specific, deliberate
- [ ] NOT skipping error paths -- error handling is a first-class feature
- [ ] NOT missing edge cases -- boundary conditions are designed, not discovered
- [ ] NOT flat interactions -- every user action needs feedback
- [ ] NOT arbitrary spacing or magic numbers
- [ ] NOT ignoring mobile/responsive
- [ ] NOT test-after or tests that just assert "it exists"

## Visual Verification (Self-Serve)

Before reviewing code, check whether the project has a runnable UI. You should visually
verify what users actually see, not just read the source.

### Auto-Detection (check in order, stop at first match)
1. package.json with "dev" or "start" script --> npm/pnpm/yarn run dev
   Default ports: vite.config.* (5173), next.config.* (3000), nuxt.config.* (3000), angular.json (4200), svelte.config.* (5173)
2. manage.py --> Django (port 8000)
3. app.py or main.py with Flask/FastAPI imports --> port 5000 or 8000
4. Go main.go with http.ListenAndServe --> port 8080
5. Static index.html without framework --> python3 -m http.server 8000
6. None of the above --> skip visual verification entirely (no UI to screenshot)

### If UI Detected
1. Start the dev server in the background. Wait for HTTP 200 on the root path (poll every 1s, timeout 30s). If the server fails to start within the timeout, skip visual verification and tag visual findings with [NEEDS_QA].
2. Use Playwright (headless Chromium) to take full-page screenshots at 4 viewports:
   - 375px (mobile), 768px (tablet), 1024px (small desktop), 1440px (desktop)
3. Navigate to key routes (up to 10 -- check router config, nav links, or page files) and screenshot each.
4. Critique the screenshots as part of your audit:
   - Layout alignment and spacing consistency across viewports
   - Typography hierarchy and readability (contrast, size, truncation)
   - Responsive behavior (does mobile get a real layout, not shrunken desktop?)
   - Visual states visible on the page (empty states, loading indicators, error handling)
   - Design system consistency (are colors, spacing, and components coherent?)
5. Save screenshots to the cycle directory with descriptive names (e.g., homepage-375.png, mixer-1440.png).
6. Include visual findings in your P0/P1/P2 report with screenshot references as evidence.
7. Stop the dev server when done.

### If Playwright Is Unavailable
If you cannot install or run Playwright, record a P3/INFO finding ("Playwright not available
for visual verification") and skip this section. Tag any visual concern with [NEEDS_QA] so
the polish architect routes it to the QA Engineer for hands-on testing.

### If No UI Detected
Skip this section entirely. Not every project has a visual interface -- APIs, CLIs, and
libraries do not need visual verification. Focus on code quality, testing, and architecture.

## Browser Verification (QA Engineer)

For any finding that requires runtime verification to confirm (visual bugs, interaction
issues, responsive problems, accessibility failures, performance bottlenecks visible at
runtime), tag it with [NEEDS_QA]. The polish architect will route these to the QA Engineer
skill (` + "`" + `.claude/skills/compound/qa-engineer/SKILL.md` + "`" + `) which performs hands-on browser
automation testing: screenshots, exploratory testing, boundary inputs, accessibility checks,
network inspection, and viewport stress testing against the running application.

Examples of [NEEDS_QA] findings:
- "Mobile layout breaks at 375px [NEEDS_QA]"
- "Form validation not visible on submit [NEEDS_QA]"
- "No loading skeleton while data fetches [NEEDS_QA]"
- "Contrast ratio may fail WCAG AA on the dashboard header [NEEDS_QA]"

## Output Format
Structure your report as:

### P0 -- Must Fix (blocks quality)
- Finding description with file/line references (add [NEEDS_QA] if runtime verification needed)

### P1 -- Should Fix (significant quality gap)
- Finding description with file/line references (add [NEEDS_QA] if runtime verification needed)

### P2 -- Nice to Fix (polish opportunity)
- Finding description with file/line references (add [NEEDS_QA] if runtime verification needed)

### Summary
- Overall assessment across all dimensions (1-2 sentences)
- Top 3 highest-impact improvements
- Count of [NEEDS_QA] findings that require browser verification

AUDIT_PROMPT_EOF

  echo ""
  echo "## Spec Context"
  echo "$spec_content"
  echo ""
  echo "## Cycle"
  echo "This is polish cycle $cycle_num of $CYCLES."
}

`
}

// polishScriptRunAudit returns the run_polish_audit function with PID tracking and timeouts.
// Under bg backend: claude reviewers are dispatched as bg sessions (bg_dispatch_reviewer_polish),
// collected via bg_poll_reviewer + bg_collect_reviewer. Gemini/codex remain sync PIDs.
// Mixed-fleet barrier waits both (R-FLEET).
func polishScriptRunAudit() string { //nolint:funlen // bash template string
	return `# --- Spawn Reviewers ---
run_polish_audit() {
  local cycle_num="$1"
  local cycle_dir="$LOG_DIR/polish-cycle-$cycle_num"
  mkdir -p "$cycle_dir"

  log "Cycle $cycle_num: building audit prompt"
  local prompt_file="$cycle_dir/audit-prompt.md"
  build_audit_prompt "$cycle_num" > "$prompt_file"

  log "Cycle $cycle_num: spawning reviewers"
  local pids=""
  local bg_handles=""
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer-report.md"
    local model_name=""

    case "$reviewer" in
      (claude-opus)   model_name="claude-opus-4-7[1m]" ;;
      (claude-sonnet) model_name="claude-sonnet-4-6" ;;
    esac

    if [ "${POLISH_DRY_RUN:-}" = "1" ]; then
      log "DRY RUN: would spawn $reviewer"
      echo "(dry run -- no actual review)" > "$report"
      continue
    fi

    case "$reviewer" in
      (claude-opus|claude-sonnet)
        if [ "$CA_BACKEND" = "bg" ]; then
          # bg backend: dispatch async, collect via poll (R-FLEET mixed barrier).
          local safe_label
          safe_label=$(printf '%s' "$reviewer" | tr '-' '_')
          if bg_dispatch_reviewer_polish "$reviewer" "$model_name" "$prompt_file"; then
            local handle
            eval "handle=\${BG_POLISH_HANDLE_${safe_label}:-}"
            if [ -n "$handle" ]; then
              bg_handles="$bg_handles $reviewer:$handle:$report"
            fi
          else
            log "WARN: bg dispatch failed for $reviewer -- skipping"
          fi
        else
          # p backend: synchronous via agent_invoke (R-PLEGACY).
          (portable_timeout "$REVIEW_TIMEOUT" agent_invoke "$model_name" \
            -p - < "$prompt_file" > "$report" 2>"$cycle_dir/$reviewer.stderr" || true) &
          pids="$pids $!"
          log "Spawned $reviewer (PID $!)"
        fi
        ;;
      (gemini)
        (portable_timeout "$REVIEW_TIMEOUT" gemini --yolo \
          < "$prompt_file" \
          > "$report" 2>"$cycle_dir/$reviewer.stderr" || true) &
        pids="$pids $!"
        log "Spawned $reviewer (PID $!)"
        ;;
      (codex)
        (portable_timeout "$REVIEW_TIMEOUT" codex exec --full-auto \
          -o "$report" -- - < "$prompt_file" 2>"$cycle_dir/$reviewer.stderr" || true) &
        pids="$pids $!"
        log "Spawned $reviewer (PID $!)"
        ;;
    esac
  done

  # Mixed-fleet barrier: poll bg Claude handles + wait sync gemini/codex pids (R-FLEET).
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
    log "Waiting for sync reviewers to complete: $pids"
    for pid in $pids; do wait "$pid" 2>/dev/null || true; done
  fi
  log "All reviewers completed for cycle $cycle_num"
}

`
}

// polishScriptSynthesizeReport returns the synthesize_report function.
func polishScriptSynthesizeReport() string {
	return `# --- Synthesize Report ---
synthesize_report() {
  local cycle_num="$1"
  local cycle_dir="$LOG_DIR/polish-cycle-$cycle_num"
  local report_file="docs/specs/polish-report-cycle-${cycle_num}.md"

  mkdir -p "$(dirname "$report_file")"

  log "Synthesizing polish report for cycle $cycle_num"

  {
    echo "# Polish Report -- Cycle $cycle_num"
    echo ""
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    for reviewer in $AVAILABLE_REVIEWERS; do
      local report="$cycle_dir/$reviewer-report.md"
      if [ -s "$report" ]; then
        echo "## $reviewer"
        echo ""
        cat "$report"
        echo ""
      else
        echo "## $reviewer"
        echo ""
        echo "(no output -- reviewer may have crashed or timed out)"
        echo ""
      fi
    done
  } > "$report_file"

  log "Polish report written to $report_file"
  POLISH_REPORT="$report_file"
}

`
}

// polishScriptPolishArchitect returns the run_polish_architect function.
func polishScriptPolishArchitect() string { //nolint:funlen // bash template string
	return `# --- Polish Architect ---
run_polish_architect() {
  local cycle_num="$1"
  local report_file="$2"
  local cycle_dir="$LOG_DIR/polish-cycle-$cycle_num"
  local architect_log="$cycle_dir/polish-architect.log"

  log "Cycle $cycle_num: spawning polish architect"

  if [ "${POLISH_DRY_RUN:-}" = "1" ]; then
    log "DRY RUN: would spawn polish architect"
    return 0
  fi

  if [ -z "$report_file" ] || [ ! -s "$report_file" ]; then
    log "ERROR: polish report is empty or missing, skipping architect"
    return 1
  fi

  local prompt_file="$cycle_dir/polish-architect-prompt.md"
  {
    cat <<'ARCHITECT_HEADER_EOF'
You are a polish architect. Your job is NOT just to mechanically convert reviewer findings
into tickets. You are here to push the product toward exceptional quality and craft.

## Step 1: Load Context
Prime your session so you understand the product, its vision, and what has been built:

` + "```bash" + `
npx ca load-session
` + "```" + `

Then read the spec file listed under "## Spec File" at the bottom of this prompt to understand the product vision and goals.

Explore the codebase. Understand the current state -- what's built, what's working, what's rough.

## Step 2: Study the Audit Report
Read the polish report below. Reviewer findings are your STARTING POINT, not your ceiling.

## Step 3: Think Ambitiously
Go beyond the findings. Ask yourself:
- What would make a user fall in love with this product?
- Where does the current implementation feel "good enough" but not great?
- What micro-interactions, transitions, or details would elevate the experience?
- Are there rough edges the reviewers missed because they were checking a list?
- Does the product feel cohesive, or like a collection of features?
- Would you be proud to ship this? What would you fix first if not?

The polish loop exists to close the gap between "it works" and "it's exceptional."
Address ALL priority levels -- P0 critical issues, P1 quality gaps, AND P2 polish
opportunities. P2 items are not optional in a polish cycle -- they are the whole point.
Add your own P2/P3 discoveries beyond what reviewers found.

## Step 4: Route QA Findings
Look for [NEEDS_QA] tags in the audit report. If any exist, create a dedicated QA
verification epic FIRST (with ` + "`" + `--priority=1` + "`" + ` so it runs before fix epics). Include:
- The list of [NEEDS_QA] findings to verify
- Instruction to invoke the QA Engineer skill (` + "`" + `.claude/skills/compound/qa-engineer/SKILL.md` + "`" + `)
- The QA Engineer will start the dev server, perform browser automation (screenshots,
  exploratory testing, boundary inputs, accessibility, viewport stress), and produce
  a structured QA report with P0-P3 findings
The QA epic counts toward the overall epic budget below.

## Step 5: Create Improvement Epics
Group your improvements into well-structured epics (aim for 3-6 total, including the QA
epic from Step 4 if created). Each epic should:
- Have a clear, ambitious goal (not just "fix findings from reviewer X")
- Include specific acceptance criteria
- Cover a coherent bounded context (e.g., "security hardening", "error handling", "interaction polish", "performance")
- Mix reviewer findings WITH your own discoveries
- If the epic touches UI, include ` + "`" + `browser_evidence` + "`" + ` in the Verification Contract so the review phase invokes QA Engineer

For each epic:
` + "```bash" + `
bd create --title="Polish: <ambitious goal>" \
  --description="<what and why, acceptance criteria, specific files/areas>" \
  --type=epic --priority=2
` + "```" + `

Wire dependencies between your epics if needed (e.g., QA epic before fix epics):
` + "`bd dep add <dependent> <dependency>`" + `

CRITICAL: Do NOT use ` + "`--parent=$META_EPIC`" + ` or ` + "`bd dep add <epic> $META_EPIC`" + `.
Polish epics must be independently actionable. Dependencies to the meta-epic will deadlock the loop
because the meta-epic never closes.

## Step 6: Output Epic IDs
After creating all epics, output each ID on its own line:
POLISH_EPIC: <epic-id>

ARCHITECT_HEADER_EOF
    echo "## Polish Report"
    cat "$report_file"
    echo ""
    echo "## Context"
    echo "These epics are part of the $META_EPIC polish initiative (for traceability only)."
    echo ""
    echo "## Spec File"
    echo "Read this file for product vision: $SPEC_FILE"
  } > "$prompt_file"

  # The polish architect runs bd create --type=epic / bd dep add and makes
  # NO code edits. bd is keyed to the main repo path and is UNREACHABLE from the
  # git worktree that claude --bg auto-isolates into (spike G2). The architect
  # MUST therefore run on the SYNCHRONOUS agent_invoke path regardless of
  # CA_BACKEND, so its bd writes land in the main tree's Dolt. (agent_invoke
  # falls through to a synchronous claude call even under CA_BACKEND=bg.)
  agent_invoke "$MODEL" \
    --verbose \
    -p - < "$prompt_file" > "$architect_log" 2>"$cycle_dir/polish-architect.stderr" || true

  # Extract created epic IDs
  POLISH_EPICS=""
  while IFS= read -r line; do
    local epic_id
    epic_id=$(echo "$line" | sed 's/^POLISH_EPIC: //')
    if [ -n "$epic_id" ]; then
      POLISH_EPICS="$POLISH_EPICS $epic_id"
    fi
  done < <(grep "^POLISH_EPIC: " "$architect_log" 2>/dev/null || true)
  POLISH_EPICS="${POLISH_EPICS# }"

  if [ -z "$POLISH_EPICS" ]; then
    log "Cycle $cycle_num: polish architect created no epics"
  else
    log "Cycle $cycle_num: polish architect created epics: $POLISH_EPICS"
  fi
}

`
}

// polishScriptInnerLoop returns the run_inner_loop function.
func polishScriptInnerLoop() string { //nolint:funlen // bash template string
	return `# --- Inner Loop ---
run_inner_loop() {
  local cycle_num="$1"
  local cycle_dir="$LOG_DIR/polish-cycle-$cycle_num"

  if [ -z "$POLISH_EPICS" ]; then
    log "Cycle $cycle_num: no epics to process -- skipping inner loop"
    return 0
  fi

  log "Cycle $cycle_num: generating inner infinity loop for epics: $POLISH_EPICS"

  local inner_script="$cycle_dir/inner-loop.sh"
  local epic_csv
  epic_csv=$(echo "$POLISH_EPICS" | tr ' ' ',')

  if [ "${POLISH_DRY_RUN:-}" = "1" ]; then
    log "DRY RUN: would run ca loop --epics $epic_csv"
    return 0
  fi

  # Use the local binary if available (npx may resolve a stale version)
  local ca_cmd="npx ca"
  if command -v ca >/dev/null 2>&1; then
    ca_cmd="ca"
  fi

  compact_flag=""
  if [ -n "${CLAUDE_AUTOCOMPACT_PCT_OVERRIDE:-}" ]; then
    compact_flag="--compact-pct $CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
  fi
  # shellcheck disable=SC2086
  $ca_cmd loop --epics "$epic_csv" --model "$MODEL" --force --backend "$CA_BACKEND" $compact_flag -o "$inner_script" 2>"$cycle_dir/ca-loop-gen.stderr" || {
    log "ERROR: failed to generate inner loop script"
    return 1
  }

  log "Cycle $cycle_num: running inner infinity loop (CA_BACKEND=${CA_BACKEND:-bg})"
  local inner_rc=0
  # Propagate CA_BACKEND to the inner loop so it uses the same backend (R-FRAMEWORK, T6).
  CA_BACKEND="${CA_BACKEND:-bg}" bash "$inner_script" >"$cycle_dir/inner-loop.stdout" 2>"$cycle_dir/inner-loop.stderr" || inner_rc=$?

  if [ "$inner_rc" -eq 2 ]; then
    log "ERROR: Inner loop completed zero epics in cycle $cycle_num (epics may be blocked)"
    return 1
  elif [ "$inner_rc" -ne 0 ]; then
    log "WARN: inner loop exited with status $inner_rc"
  fi

  log "Cycle $cycle_num: inner loop completed"
}

`
}

// polishScriptMainLoop returns the main orchestration loop.
func polishScriptMainLoop() string {
	return `# --- Main Loop ---
detect_polish_reviewers

log "Starting polish loop: $CYCLES cycles"
echo "{\"status\":\"running\",\"cycles\":$CYCLES,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOG_DIR/.polish-status.json"

POLISH_EPICS=""
POLISH_REPORT=""

for ((cycle=1; cycle<=CYCLES; cycle++)); do
  log "=== Cycle $cycle/$CYCLES ==="
  POLISH_EPICS=""
  POLISH_REPORT=""
  echo "{\"status\":\"running\",\"cycle\":$cycle,\"cycles\":$CYCLES,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOG_DIR/.polish-status.json"

  # Step 1: Audit
  run_polish_audit "$cycle"

  # Step 2: Synthesize
  synthesize_report "$cycle"

  # Step 3: Polish Architect
  if [ -n "$POLISH_REPORT" ]; then
    run_polish_architect "$cycle" "$POLISH_REPORT" || log "WARN: polish architect failed for cycle $cycle"
  else
    log "WARN: no polish report produced, skipping architect for cycle $cycle"
  fi

  # Step 4: Inner Loop
  run_inner_loop "$cycle" || {
    log "WARN: inner loop failed for cycle $cycle"
  }

  log "=== Cycle $cycle/$CYCLES complete ==="
done

`
}

// polishScriptPostLoop returns the post-loop cleanup and push section.
func polishScriptPostLoop() string {
	return `# --- Post Loop ---
log "Polish loop completed: $CYCLES cycles"

# Write status and commit/push results
if [ "${POLISH_DRY_RUN:-}" = "1" ]; then
  echo "{\"status\":\"dry-run-completed\",\"cycles\":$CYCLES,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOG_DIR/.polish-status.json"
  log "DRY RUN: would commit and push polish loop artifacts"
else
  echo "{\"status\":\"completed\",\"cycles\":$CYCLES,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOG_DIR/.polish-status.json"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    log "Committing polish loop artifacts"
    git add docs/specs/polish-report-cycle-*.md .compound-agent/agent_logs/.polish-status.json 2>/dev/null || true
    git commit -m "chore: polish loop cycle completion" 2>/dev/null || true
  fi
  if git remote get-url origin >/dev/null 2>&1; then
    log "Pushing results"
    git push 2>/dev/null || log "WARN: git push failed (non-fatal)"
  fi
fi

log "Done"
`
}
