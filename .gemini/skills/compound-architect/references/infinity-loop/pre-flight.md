# Pre-flight and Launch

> Loaded on demand. Read when referenced by SKILL.md.

## Pre-flight Checklist

Before launching, verify:

- [ ] All epic beads exist and are status=open (`bd show <id> --json` for each)
- [ ] Dependencies wired correctly (`bd show <id> --json` shows depends_on)
- [ ] `claude` CLI available and authenticated
- [ ] `bd` CLI available
- [ ] `screen` available (`command -v screen`)
- [ ] Sufficient disk space for .compound-agent/agent_logs/

## Generate the Script

```bash
ca loop --epics "E1,E2,E3" \
  --reviewers "claude-sonnet,claude-opus,gemini,codex" \
  --max-retries 1 \
  --max-review-cycles 3 \
  --force
```

See `README.md` for full parameter table.

## Dry-run Protocol

Preview the loop without executing Claude sessions or writing to the execution log:

```bash
LOOP_DRY_RUN=1 ./.compound-agent/infinity-loop.sh
```

Dry-run does NOT:
- Write entries to `.compound-agent/agent_logs/loop-execution.jsonl`
- Trigger git operations (commit, push)
- Spawn Claude sessions

It DOES print the epic ordering, dependency checks, and reviewer detection so you can verify the configuration.

## Launch in Background

**Preferred -- screen** (use a unique session name to avoid collisions):
```bash
LOOP_SESSION="compound-loop-$(basename "$PWD")"
screen -dmS "$LOOP_SESSION" ./.compound-agent/infinity-loop.sh
mkdir -p .beads && echo "$LOOP_SESSION" > .beads/loop-session-name
screen -ls | grep "$LOOP_SESSION"   # Verify launch
```

**Fallback -- nohup** (when screen is unavailable):
```bash
nohup ./.compound-agent/infinity-loop.sh > loop-output.log 2>&1 &
echo $!   # Save PID for later
```

## Monitoring Commands

| Command | Purpose |
|---------|---------|
| `ca watch` | Live trace from active session |
| `ca watch --epic <id>` | Watch specific epic |
| `ca watch --no-follow` | Print current trace and exit |
| `cat .compound-agent/agent_logs/.loop-status.json` | Current loop state |
| `wc -l .compound-agent/agent_logs/loop-execution.jsonl` | Count completed epics |
| `grep '"result":"failed"' .compound-agent/agent_logs/loop-execution.jsonl` | Find failures |
| `screen -r "$(cat .beads/loop-session-name)"` | Attach to running loop (Ctrl-A D to detach) |
| `screen -S "$(cat .beads/loop-session-name)" -X quit` | Kill the loop |

## 30-Minute Probe Protocol

Passive monitoring checks to run periodically:

1. **Progress check**: Is `.loop-status.json` advancing? Same epic_id for >30 minutes suggests a stuck session.
2. **Failure scan**: `grep failed .compound-agent/agent_logs/loop-execution.jsonl` -- any new failures since last check?
3. **Git activity**: `git log --oneline -5` -- are commits being produced? Healthy loop commits per epic.
4. **Disk usage**: `du -sh .compound-agent/agent_logs/` -- trace files can grow large.
5. **Process health**: `screen -ls` -- is the screen session still alive?

**Warning signs**:
- No progress for >30 minutes (stuck)
- Multiple consecutive failures on the same epic
- Disk usage growing rapidly without new commits
- Screen session disappeared (crash -- check `.loop-status.json` for crash details)
