# Infinity Loop Reference Guide

## Overview

The infinity loop (\`ca loop\`) generates a standalone bash script that autonomously processes beads epics via Claude Code sessions. The architect skill's Phase 5 configures and launches this loop on the materialized epics.

Each epic runs through a full \`/compound:cook-it from plan\` cycle. The loop handles retries, dependency ordering, memory safety, and optional multi-model review.

---

## Configuration Parameters

| Parameter | CLI Flag | Default | Description |
|-----------|----------|---------|-------------|
| Epic IDs | \`--epics <ids...>\` | auto-discover | Specific epics to process |
| Model | \`--model <model>\` | claude-opus-4-6[1m] | Claude model for sessions |
| Max retries | \`--max-retries <n>\` | 1 | Retries per epic on failure |
| Output | \`-o, --output <path>\` | ./infinity-loop.sh | Script output path |
| Force | \`--force\` | false | Overwrite existing script |
| Reviewers | \`--reviewers <names...>\` | none | Review fleet: claude-sonnet, claude-opus, gemini, codex |
| Review cadence | \`--review-every <n>\` | 0 (end-only) | Review every N completed epics |
| Review cycles | \`--max-review-cycles <n>\` | 3 | Max review/fix iterations |
| Review blocking | \`--review-blocking\` | false | Fail loop if review not approved |
| Review model | \`--review-model <model>\` | claude-opus-4-6[1m] | Model for fix sessions |
| Improve | \`--improve\` | false | Run improvement phase after epics |
| Improve iters | \`--improve-max-iters <n>\` | 5 | Max iterations per topic |
| Improve budget | \`--improve-time-budget <s>\` | 0 (unlimited) | Total improvement time budget |

---

## Pre-flight Checklist

Before launching, verify:
- [ ] All epic beads exist and are status=open (\`bd show <id> --json\` for each)
- [ ] Dependencies wired correctly (\`bd show <id> --json\` shows depends_on)
- [ ] \`claude\` CLI available and authenticated
- [ ] \`bd\` CLI available
- [ ] \`screen\` available (\`command -v screen\`)
- [ ] Sufficient disk space for agent_logs/

---

## Launch Commands

### Generate script
\`\`\`bash
npx ca loop --epics E1 E2 E3 \\
  --reviewers claude-sonnet claude-opus gemini codex \\
  --max-retries 1 \\
  --max-review-cycles 3 \\
  --force
\`\`\`

### Dry-run (preview without executing Claude sessions)
\`\`\`bash
LOOP_DRY_RUN=1 ./infinity-loop.sh
\`\`\`

### Launch in background
\`\`\`bash
screen -dmS compound-loop ./infinity-loop.sh
\`\`\`

### Verify launch
\`\`\`bash
screen -ls | grep compound-loop
\`\`\`

---

## Monitoring Guide

### Real-time watch
\`\`\`bash
npx ca watch                    # Live trace from active session
npx ca watch --epic <id>        # Watch specific epic
npx ca watch --improve          # Watch improvement phase
npx ca watch --no-follow        # Print current trace and exit
\`\`\`

### Status files

| File | Content |
|------|---------|
| \`agent_logs/.loop-status.json\` | Current loop state (epic, attempt, status) |
| \`agent_logs/loop-execution.jsonl\` | Completed epic results with timing |
| \`agent_logs/loop_*.log\` | Per-session extracted text log |
| \`agent_logs/trace_*.jsonl\` | Per-session raw stream-json trace |

### Screen session
\`\`\`bash
screen -r compound-loop         # Attach to running loop
# Ctrl-A D                      # Detach without stopping
screen -S compound-loop -X quit # Kill the loop
\`\`\`

### Health checks
\`\`\`bash
# Is the loop still running?
screen -ls | grep compound-loop

# Current status
cat agent_logs/.loop-status.json

# How many epics completed?
wc -l agent_logs/loop-execution.jsonl

# Any failures?
grep '"result":"failed"' agent_logs/loop-execution.jsonl
\`\`\`

---

## 30-Minute Probe Protocol

Passive monitoring checks to run periodically:

1. **Progress check**: Is \`.loop-status.json\` advancing? Same epic_id for >30 minutes suggests a stuck session.
2. **Failure scan**: \`grep failed agent_logs/loop-execution.jsonl\` -- any new failures since last check?
3. **Git activity**: \`git log --oneline -5\` -- are commits being produced? Healthy loop commits per epic.
4. **Disk usage**: \`du -sh agent_logs/\` -- trace files can grow large.
5. **Process health**: \`screen -ls\` -- is the screen session still alive?

**Warning signs**:
- No progress for >30 minutes (stuck)
- Multiple consecutive failures on the same epic
- Disk usage growing rapidly without new commits
- Screen session disappeared (crash -- check \`.loop-status.json\` for crash details)

---

## Examples

### Minimal (auto-discover epics, no review)
\`\`\`bash
npx ca loop --force
LOOP_DRY_RUN=1 ./infinity-loop.sh
screen -dmS compound-loop ./infinity-loop.sh
\`\`\`

### Full review fleet with improvement phase
\`\`\`bash
npx ca loop --epics E1 E2 E3 \\
  --reviewers claude-sonnet claude-opus gemini codex \\
  --max-review-cycles 3 \\
  --review-blocking \\
  --improve \\
  --improve-max-iters 5 \\
  --force
\`\`\`

### Conservative (review every 2 epics, blocking)
\`\`\`bash
npx ca loop --epics E1 E2 E3 E4 \\
  --reviewers claude-sonnet gemini \\
  --review-every 2 \\
  --review-blocking \\
  --max-retries 2 \\
  --force
\`\`\`
