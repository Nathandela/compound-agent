# Dependency-Aware Epic Ordering

> Loaded on demand. Read when referenced by SKILL.md.

## Table of Contents

1. [Dependency Checking](#dependency-checking)
2. [Epic Selection Modes](#epic-selection-modes)
3. [The PROCESSED Set](#the-processed-set)
4. [Stdout/Return-Value Pattern](#stdoutreturn-value-pattern)

---

## Dependency Checking

Before processing an epic, the loop checks that all `depends_on` entries are status=closed. Epics with open dependencies are skipped until their blockers are resolved:

```bash
check_deps_closed() {
  local epic_id="$1"
  local deps_json
  deps_json=$(bd show "$epic_id" --json 2>/dev/null || echo "")
  [ -z "$deps_json" ] && return 0

  local blocking_dep
  if [ "$HAS_JQ" = true ]; then
    blocking_dep=$(echo "$deps_json" | jq -r '
      if type == "array" then .[0] else . end |
      (.depends_on // .dependencies // []) |
      map(select(.status != "closed")) |
      .[0].id // empty
    ' 2>/dev/null || echo "")
  fi
  # ... python3 fallback follows the same logic

  if [ -n "$blocking_dep" ]; then
    log "Skip $epic_id: blocked by dependency $blocking_dep (not closed)"
    return 1
  fi
  return 0
}
```

The function returns 0 (proceed) or 1 (skip). When a dependency is not closed, the loop logs which dependency is blocking and moves on to the next epic.

## Epic Selection Modes

The `get_next_epic()` function supports two modes:

**Explicit IDs** (`--epics "E1,E2,E3"`): Iterates over the provided `EPIC_IDS` array in order, checking each for:
- Not already in the PROCESSED set
- Status is open (`bd show <id> --json | parse_json .status` == "open")
- All dependencies closed (`check_deps_closed`)

**Auto-discover** (no `--epics` flag): Queries beads for available work:
```bash
bd list --type=epic --ready --limit=10
```
Then applies the same PROCESSED/status/deps filters.

In both modes, `get_next_epic()` echoes the selected epic ID on stdout and returns 0. If no eligible epic is found, it returns 1 and the main loop exits.

## The PROCESSED Set

The loop maintains a space-delimited string of already-processed epic IDs:

```bash
PROCESSED=""
# ... after each epic completes or fails:
PROCESSED="$PROCESSED $EPIC_ID"
```

`get_next_epic()` checks `PROCESSED` to avoid re-processing epics. This applies regardless of outcome -- completed, failed, or skipped epics are all added.

## Stdout/Return-Value Pattern

> **WARNING**: This is the most common source of subtle bugs in the generated script.

Functions that return values via `echo` on stdout (like `get_next_epic`, `get_memory_pct`, `parse_json`) must NEVER call `log()` or any other function that writes to stdout inside their body. The loop captures their stdout with command substitution:

```bash
EPIC_ID=$(get_next_epic)
```

If `get_next_epic` calls `log "checking epic..."` and `log` writes to stdout, the log message pollutes the return value -- `EPIC_ID` becomes `"checking epic...\nE1"` instead of `"E1"`.

**The fix**: `log()` writes to stderr:

```bash
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}
```

This ensures `log` output goes to stderr (visible in terminal, captured in `.stderr` file) while stdout remains clean for return values.

**Verify this invariant**: Any function captured via `$(...)` must only echo its return value on stdout. All diagnostic output goes to stderr via `>&2`.
