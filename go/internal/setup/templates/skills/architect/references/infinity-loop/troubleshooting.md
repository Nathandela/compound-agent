# Troubleshooting

> Loaded on demand. Read when referenced by SKILL.md.

## Table of Contents

1. [Uncommitted changes after loop exit](#uncommitted-changes-after-loop-exit)
2. [Reviews skipped for some epics](#reviews-skipped-for-some-epics)
3. [Reviewer fleet underutilized](#reviewer-fleet-underutilized)
4. [extract_text produces empty logs](#extract_text-produces-empty-logs)
5. [Memory watchdog kills sessions](#memory-watchdog-kills-sessions)
6. [No git push at loop end](#no-git-push-at-loop-end)
7. [Epic IDs corrupted or loop processes wrong epic](#epic-ids-corrupted-or-loop-processes-wrong-epic)
8. [Reviewers produce 1-byte or empty output](#reviewers-produce-1-byte-or-empty-output)
9. [Dry-run creates ghost entries in execution log](#dry-run-creates-ghost-entries-in-execution-log)
10. [Consumer migration after upgrade](#consumer-migration-after-upgrade)

---

Field-tested failure modes observed in production loop runs.

Each entry follows: **Symptom** -- **Root cause** -- **Fix** -- **Diagnosis commands**.

---

### Uncommitted changes after loop exit

**Symptom**: `git status` shows modified/untracked files after loop finishes. Work appears done but isn't committed.

**Root cause**: The agent session completed its work and output `EPIC_COMPLETE`, but the commit/push step inside the session failed silently (e.g., hook rejection, merge conflict).

**Fix**: The loop now auto-checks `git diff --quiet` after each epic completion and runs `git add -A && git commit` if dirty. If you still see uncommitted changes:
```bash
git status --short
git add -A && git commit -m "chore: post-loop cleanup"
git push
```

**Diagnosis**:
```bash
grep "Working tree dirty" agent_logs/loop_*.log
grep "auto-commit" agent_logs/loop_*.log
```

---

### Reviews skipped for some epics

**Symptom**: With `--review-every 1`, some epics get reviewed but others don't. Logs show "No commits in range ... skipping review phase."

**Root cause**: The review phase checks `git log --oneline "$REVIEW_DIFF_RANGE"` and skips if zero commits exist in the range. This happens when the reviewed code was already committed before the diff range started (e.g., the implementer committed during a prior review fix cycle, advancing HEAD past the range).

**Fix**: Usually benign -- the code was already reviewed in a previous cycle. Check review logs to verify.

**Diagnosis**:
```bash
grep "No commits in range" agent_logs/loop_*.log
ls agent_logs/reviews/
```

---

### Reviewer fleet underutilized

**Symptom**: Configured 4 reviewers but logs show only Claude models were used.

**Root cause**: Gemini/Codex CLIs not installed or not authenticated. `detect_reviewers()` logs per-reviewer warnings.

**Fix**: Install and authenticate missing CLIs, or remove them from `--reviewers` to avoid noise.

**Diagnosis**:
```bash
grep "configured but unavailable" agent_logs/loop_*.log
grep "Configured reviewers:" agent_logs/loop_*.log
grep "Available reviewers:" agent_logs/loop_*.log
```

---

### extract_text produces empty logs

**Symptom**: `agent_logs/loop_*.log` files are empty but `agent_logs/trace_*.jsonl` files have content. Warning: "Macro log is empty but trace has content."

**Root cause**: The `extract_text` jq parser failed (jq not installed, or Claude's stream-json format changed). The loop falls back to trace-file marker detection (unanchored grep), which is less reliable.

**Fix**: Ensure jq or python3 is available. See `logging.md` for the full `extract_text` implementation.

**Diagnosis**:
```bash
command -v jq && echo "jq OK" || echo "jq MISSING"
command -v python3 && echo "python3 OK" || echo "python3 MISSING"
head -1 agent_logs/trace_*.jsonl | jq .   # Test jq parsing
```

---

### Memory watchdog kills sessions

**Symptom**: Logs show "WATCHDOG: memory X% < 15%, killing PID". Session marked as failed.

**Root cause**: The Claude session (or spawned test processes) consumed too much memory. The watchdog killed the session to prevent system freeze.

**Fix**: Tune thresholds or kill memory-hungry processes before running. See `memory-safety.md` for the full 3-layer defense.

**Diagnosis**:
```bash
cat agent_logs/memory_*.log | tail -20
grep "WATCHDOG" agent_logs/memory_*.log
```

```bash
# More lenient thresholds
WATCHDOG_THRESHOLD=10 WATCHDOG_INTERVAL=60 ./infinity-loop.sh
# Kill memory-hungry background processes
pkill -f vitest; pkill -f "node.*test"
```

---

### No git push at loop end

**Symptom**: Loop completed but changes aren't on remote.

**Root cause**: In older versions of the generated script, `git push` was not included. The loop now pushes at exit, but SSH/auth failures are non-fatal (logged as warnings).

**Fix**: Push manually.

**Diagnosis**:
```bash
grep "git push" agent_logs/loop_*.log
git push
ssh -T git@github.com   # Test SSH auth
```

---

### Epic IDs corrupted or loop processes wrong epic

**Symptom**: The loop processes an unexpected epic, or `get_next_epic` returns a garbled string containing log messages mixed with an epic ID.

**Root cause**: Functions that return values via `echo` on stdout had `log()` calls inside them. Since `log()` also wrote to stdout, the log output polluted the return value. Now fixed: `log()` writes to stderr (`>&2`).

**Fix**: Already fixed in current `ca loop` output. If running an older generated script, regenerate it with `ca loop --force`.

**Diagnosis**:
```bash
# Verify log() writes to stderr, not stdout
grep 'log()' infinity-loop.sh
# Should see: echo "..." >&2
# Should NOT see: echo "..." (without redirect)
```

See `epic-ordering.md` for the full explanation of the stdout/return-value pattern.

---

### Reviewers produce 1-byte or empty output

**Symptom**: Review report files in `agent_logs/reviews/` are empty or contain only a newline. Reviewer logged as "NO OUTPUT (crashed or timed out)."

**Root cause**: The Claude reviewer was spawned without `--dangerously-skip-permissions`. Without this flag, Claude pauses at the first tool use waiting for human permission confirmation. With no human, the session times out producing no substantive output.

**Fix**: Already fixed in current `ca loop` output. If running an older generated script, regenerate with `ca loop --force`.

**Diagnosis**:
```bash
# Check report file sizes
wc -c agent_logs/reviews/*/*.md
# Check if --dangerously-skip-permissions is in the script
grep "dangerously-skip-permissions" infinity-loop.sh
```

See `review-fleet.md` for correct per-reviewer invocation flags.

---

### Dry-run creates ghost entries in execution log

**Symptom**: After running `LOOP_DRY_RUN=1 ./infinity-loop.sh`, `agent_logs/loop-execution.jsonl` contains entries even though no real sessions ran.

**Root cause**: Older generated scripts lacked guards around execution log writes during dry-run mode. The dry-run path exercised the full loop logic including log writes.

**Fix**: Already fixed in current `ca loop` output. Dry-run now guards all writes to `loop-execution.jsonl` and all git operations. Regenerate with `ca loop --force` if affected.

**Diagnosis**:
```bash
# Check for dry-run entries (they'll have duration_s: 0)
grep '"duration_s":0' agent_logs/loop-execution.jsonl
# Clean up ghost entries
: > agent_logs/loop-execution.jsonl   # Truncate if all entries are ghosts
```

---

### Consumer migration after upgrade

After upgrading compound-agent (`npm update compound-agent` or `pnpm update compound-agent`), consumers must regenerate their loop script to pick up fixes.

```bash
ca loop --force   # Regenerate with latest fixes
```

The generated `infinity-loop.sh` is a snapshot at generation time. It does NOT auto-update when compound-agent is upgraded. Fixes to the loop template (stdout pollution, dry-run guards, reviewer flags) only take effect after regeneration.

**Check your version**:
```bash
ca --version
# Compare with the version that introduced the fix you need
```
