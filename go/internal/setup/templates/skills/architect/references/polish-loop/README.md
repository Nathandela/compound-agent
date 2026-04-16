# Polish Loop Reference

> Loaded on demand. Read when referenced by SKILL.md.

The polish loop (`ca polish`) generates a standalone bash script that iterates N cycles of: multi-model audit fleet -> polish architect -> inner infinity loop. It runs AFTER the main infinity loop completes, addressing quality gaps across the full priority spectrum (P0 critical through P2 nice-to-have).

## Configuration Parameters

| Parameter | CLI Flag | Default | Description |
|-----------|----------|---------|-------------|
| Cycles | `--cycles <n>` | 3 | Number of audit/fix cycles |
| Model | `--model <model>` | claude-opus-4-7[1m] | Claude model for sessions |
| Spec file | `--spec-file <path>` | (required) | Spec file for audit context |
| Meta-epic | `--meta-epic <id>` | (required) | Parent meta-epic ID |
| Reviewers | `--reviewers <names>` | claude-sonnet,claude-opus,gemini,codex | Audit fleet |
| Output | `-o, --output <path>` | ./.compound-agent/polish-loop.sh | Script output path |
| Force | `--force` | false | Overwrite existing script |

## How It Works

Each polish cycle runs four steps:

1. **Audit fleet**: Spawns all configured reviewers (Claude, Gemini, Codex) to evaluate the full codebase against the Build Great Things pre-ship checklist. Each reviewer produces a P0/P1/P2 findings report.

2. **Synthesize report**: Combines all reviewer reports into a single `docs/specs/polish-report-cycle-N.md`.

3. **Polish architect**: Reads the synthesized report, explores the codebase, and creates ambitious improvement epics for ALL findings (P0, P1, AND P2) plus its own discoveries. Aims for 3-6 well-structured epics. Polish epics are created independently — they must NOT depend on the meta-epic (which never closes), or the inner loop will deadlock.

4. **Inner loop**: Generates and runs a new infinity loop (`ca loop`) to implement the polish epics.

## Full-Spectrum Priority

The polish loop explicitly addresses all priority levels:
- **P0 (Must Fix)**: Critical quality blockers
- **P1 (Should Fix)**: Significant quality gaps
- **P2 (Nice to Fix)**: Polish opportunities

This is intentional. The polish phase exists precisely to address the "nice-to-have" items that get deprioritized during initial implementation.

## Pipeline Usage

Run the infinity loop first, then the polish loop:

```bash
# Generate both scripts
ca loop --epics "E1,E2,E3" --reviewers "claude-sonnet,gemini" --force
ca polish --spec-file "docs/specs/my-spec.md" --meta-epic "my-meta-epic" \
  --reviewers "claude-sonnet,claude-opus,gemini" --cycles 3 --force

# Run in sequence
bash .compound-agent/infinity-loop.sh && bash .compound-agent/polish-loop.sh
```

Or create a pipeline script:

```bash
#!/usr/bin/env bash
set -euo pipefail
bash .compound-agent/infinity-loop.sh
bash .compound-agent/polish-loop.sh
git push 2>/dev/null || echo "git push failed"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLISH_DRY_RUN` | unset | Set to `1` to preview without executing |
| `REVIEW_TIMEOUT` | 600 | Timeout in seconds for each reviewer invocation |
| `SESSION_STALE_TIMEOUT` | 1800 | Kill inner loop session if no output for this many seconds |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npx not found` | Node.js/npm not installed | Install Node.js 18+ |
| `claude CLI not found` | Claude Code not installed | Install Claude Code |
| `bd CLI not found` | Beads not installed | Install beads |
| No epics created | Polish architect found nothing to fix | Check audit reports in `.compound-agent/agent_logs/polish-cycle-N/` |
| Inner loop exits with code 2 | All polish epics blocked (likely dep on meta-epic) | Run `bd blocked` and remove stale deps |
| Inner loop crashes | Generated inner loop has issues | Check `.compound-agent/agent_logs/polish-cycle-N/inner-loop.stderr` |
| Reviewer produces empty output | CLI crash or timeout | Check `.compound-agent/agent_logs/polish-cycle-N/<reviewer>.stderr` |
