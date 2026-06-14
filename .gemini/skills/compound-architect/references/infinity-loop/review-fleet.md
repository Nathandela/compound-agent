# Multi-Model Review Phase

> Loaded on demand. Read when referenced by SKILL.md.

## Table of Contents

1. [Overview](#overview)
2. [Fleet Detection](#fleet-detection)
3. [Reviewer Spawning](#reviewer-spawning)
4. [Session Resume for Multi-Cycle Reviews](#session-resume-for-multi-cycle-reviews)
5. [Result Parsing](#result-parsing)
6. [Implementer Feedback Loop](#implementer-feedback-loop)
7. [Cycle Budget and Blocking Mode](#cycle-budget-and-blocking-mode)
8. [Timeout Tuning](#timeout-tuning)

---

## Overview

When reviewers are configured (`--reviewers`), the loop runs a review cycle after every N completed epics (`--review-every`) or at the end. Reviewers are spawned in parallel (backgrounded with `&`, then `wait`ed) for speed. Memory gates run before the review phase starts.

## Fleet Detection

The `detect_reviewers()` function health-checks each configured reviewer CLI:

```bash
detect_reviewers() {
  AVAILABLE_REVIEWERS=""
  for reviewer in $CONFIGURED_REVIEWERS; do
    local cli_name
    case "$reviewer" in
      claude-sonnet|claude-opus) cli_name="claude" ;;
      gemini)                    cli_name="gemini" ;;
      codex)                     cli_name="codex" ;;
      *)                         log "Unknown reviewer: $reviewer"; continue ;;
    esac

    if ! command -v "$cli_name" >/dev/null 2>&1; then
      log "WARN: $reviewer configured but unavailable ($cli_name not found)"
      continue
    fi

    # Per-reviewer health check with timeout
    if ! portable_timeout 10 "$cli_name" --version >/dev/null 2>&1; then
      log "WARN: $reviewer health check failed (timeout or error)"
      continue
    fi

    AVAILABLE_REVIEWERS="$AVAILABLE_REVIEWERS $reviewer"
  done

  AVAILABLE_REVIEWERS=$(echo "$AVAILABLE_REVIEWERS" | xargs)  # trim
  if [ -z "$AVAILABLE_REVIEWERS" ]; then
    log "No reviewers available, skipping review phase"
    return 1
  fi

  log "Configured reviewers: $CONFIGURED_REVIEWERS"
  log "Available reviewers: $AVAILABLE_REVIEWERS"
  return 0
}
```

## Reviewer Spawning

Each reviewer type requires different CLI flags:

### Claude (sonnet/opus)

```bash
# Cycle 1: fresh session with generated session ID
portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" \
  --dangerously-skip-permissions \
  --output-format text --session-id "$sid" \
  -p "$(cat "$prompt_file")" > "$report" 2>&1 || true

# Cycle 2+: resume existing session
portable_timeout "$REVIEW_TIMEOUT" claude --model "$model_name" \
  --dangerously-skip-permissions \
  --output-format text --resume "$sid" \
  -p "$follow_up" > "$report" 2>&1 || true
```

**`--dangerously-skip-permissions` is required.** Without it, Claude pauses waiting for permission confirmations with no human to respond, producing empty or 1-byte output files. See `troubleshooting.md`.

**`--output-format text`** is used (not `stream-json`) because review output is parsed for markers (`REVIEW_APPROVED`, `CHANGES_REQUESTED`), not streamed.

### Gemini

```bash
portable_timeout "$REVIEW_TIMEOUT" gemini \
  --yolo \
  -p "$review_prompt" \
  > "$review_report" 2>"$review_stderr"
```

The `--yolo` flag enables autonomous execution (Gemini's equivalent of skip-permissions).

### Codex

**Important**: Codex has no `-p` prompt flag (that's `--profile`). The prompt is a positional argument, or `-` to read from stdin. Use `-o` for clean output — stdout contains UI chrome (model info, token counts) that breaks marker parsing.

```bash
# Cycle 1: stdin prompt, clean output via -o
portable_timeout "$REVIEW_TIMEOUT" codex exec --full-auto \
  -o "$report" -- - < "$prompt_file" 2>/dev/null || true

# Cycle 2+: resume last session with follow-up prompt
portable_timeout "$REVIEW_TIMEOUT" codex exec resume --last --full-auto \
  -o "$report" "$follow_up" 2>/dev/null || true
```

The `--full-auto` flag enables sandboxed automatic execution (workspace-write access). Stderr goes to `/dev/null` because Codex prints startup info there. The `-o` flag captures only the assistant's final message.

## Session Resume for Multi-Cycle Reviews

For Claude reviewers across multiple review cycles, session resume avoids re-reading the entire codebase:

- **Cycle 1**: Fresh session with `--session-id "$sid"` where `$sid` is a pre-generated UUID.
- **Cycle 2+**: Resume the same session with `--resume "$sid"`.

The loop pre-generates a UUID per reviewer and stores it in `$REVIEW_DIR/sessions.json`:

```bash
init_review_sessions() {
  local sessions_file="$REVIEW_DIR/sessions.json"
  [ -f "$sessions_file" ] || echo "{}" > "$sessions_file"
  for reviewer in $AVAILABLE_REVIEWERS; do
    case "$reviewer" in
      claude-sonnet|claude-opus)
        local sid
        sid=$(uuidgen | tr '[:upper:]' '[:lower:]')
        # Store in sessions.json via jq or python3
        ;;
    esac
  done
}
```

Session resume is used for all reviewers:
- **Claude**: `--session-id "$sid"` (cycle 1) → `--resume "$sid"` (cycle 2+)
- **Gemini**: `--resume latest` (cycle 2+)
- **Codex**: `codex exec resume --last` (cycle 2+)

## Result Parsing

After each reviewer completes, the loop classifies the output:

```bash
for reviewer in $AVAILABLE_REVIEWERS; do
  local report="$cycle_dir/$reviewer.md"
  if [ ! -s "$report" ]; then
    log "$reviewer: NO OUTPUT (crashed or timed out)"
  elif tr -d '\r' < "$report" | grep -q "^REVIEW_APPROVED$"; then
    log "$reviewer: APPROVED"
  elif grep -qi "rate limit\|API.*[Ee]rror\|API_KEY" "$report"; then
    log "$reviewer: ERROR (API/auth issue, not a code review rejection)"
  else
    log "$reviewer: CHANGES_REQUESTED"
    all_approved=false
  fi
done
```

Key distinction: API errors (rate limits, auth failures) are NOT treated as rejections. Only substantive review feedback counts as `CHANGES_REQUESTED`.

## Implementer Feedback Loop

When any reviewer requests changes, the loop spawns an implementer session to fix P0/P1 issues before the next review cycle:

1. Collect all `CHANGES_REQUESTED` reports into a single findings file
2. Spawn a Claude session with the findings as context
3. The implementer commits fixes
4. Next review cycle runs against the updated code

```bash
feed_implementer() {
  local cycle_dir="$1"
  local prompt_file="$cycle_dir/implementer-prompt.md"

  # Aggregate review findings into a single prompt
  for reviewer in $AVAILABLE_REVIEWERS; do
    local report="$cycle_dir/$reviewer.md"
    if [ -s "$report" ]; then
      printf '<%s-review>\n' "$reviewer" >> "$prompt_file"
      cat "$report" >> "$prompt_file"
      printf '</%s-review>\n\n' "$reviewer" >> "$prompt_file"
    fi
  done

  # Spawn implementer with review model (uses --output-format text)
  portable_timeout "$REVIEW_TIMEOUT" claude --model "$REVIEW_MODEL" \
    --dangerously-skip-permissions \
    --output-format text \
    -p "$(cat "$prompt_file")" > "$cycle_dir/implementer.md" 2>&1 || true
}
```

## Cycle Budget and Blocking Mode

The review phase loops up to `MAX_REVIEW_CYCLES` (default: 3):

- If all reviewers approve before the budget is exhausted, review passes.
- If budget is exhausted with outstanding changes:
  - `--review-blocking`: The loop exits with an error.
  - Default (non-blocking): The loop logs a warning and continues.

```bash
[ "$all_approved" = true ] && return 0
[ "$cycle" -lt "$MAX_REVIEW_CYCLES" ] && feed_implementer "$cycle_dir"
# ... after budget exhausted:
[ "$REVIEW_BLOCKING" = true ] && die "Review blocking enabled, exiting"
```

## Timeout Tuning

The `REVIEW_TIMEOUT` environment variable controls the per-reviewer timeout (in seconds). Default is determined by the `--review-timeout` flag or a built-in default.

For large codebases where reviewers need more time:
```bash
REVIEW_TIMEOUT=1800 .compound-agent/infinity-loop.sh   # 30 minutes per reviewer
```

The timeout uses `portable_timeout` for cross-platform support (GNU `timeout`, macOS `gtimeout`, or shell fallback). See `pre-flight.md` for launch configuration.

## QA Engineer Integration (Optional)

When epics involve UI changes, new pages, or frontend components, the review phase can optionally invoke the QA Engineer skill for hands-on browser-based testing. This is **not part of the automated review fleet** -- it is a separate, on-demand step that the implementer or review orchestrator can trigger between review cycles.

**When to invoke**: After the implementer has applied fixes from a review cycle and before the next review cycle begins. Particularly valuable when:
- Reviewers flagged visual or interaction concerns they cannot verify from code alone
- The epic involves new UI pages, forms, or user-facing flows
- Accessibility requirements are part of the epic's EARS specification

**How to invoke**: The implementer session (or a dedicated QA session) reads `.claude/skills/compound/qa-engineer/SKILL.md` and runs the QA protocol against the running application. QA findings are formatted as P0-P3 and included in the next review cycle's context.

**Not a reviewer**: The QA Engineer does not participate in the reviewer fleet's approval/rejection flow. Its findings are additional evidence that reviewers can reference, not a separate approval gate.
