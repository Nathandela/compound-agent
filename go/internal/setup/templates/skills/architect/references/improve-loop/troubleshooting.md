# Improve Loop Troubleshooting

> Loaded on demand. Read when referenced by SKILL.md.

## All topics exit on first iteration

**Symptom**: Every topic reports `NO_IMPROVEMENT` immediately.

**Causes**:
- Programs are too narrow for the codebase (already clean in that area)
- Goal section is vague enough that the agent can't find actionable work
- Scope section restricts to directories that don't exist or are empty

**Fix**: Review the program files. Broaden the scope or make the goal more concrete. See `example-programs.md` for well-structured templates, then compare against your programs.

## Markers not detected

**Symptom**: Loop treats every iteration as `FAILED` or `UNKNOWN` even when Claude made changes.

**Causes**:
- Marker was embedded inline (e.g., "I have IMPROVED the code") instead of on its own line. The detection uses `grep -q "^IMPROVED$"` — the marker must be the only text on its line.
- `jq` is not installed. The script uses `jq` to extract text from Claude's stream-json output. Without it, the extracted text is empty and no marker is found. Install jq: `brew install jq` (macOS) or `apt install jq` (Linux).

**Fix**: Ensure your Goal section explicitly instructs: "Output IMPROVED, NO_IMPROVEMENT, or FAILED on its own line." Verify `jq` is available: `command -v jq`.

## Changes committed that shouldn't be

**Symptom**: Unrelated files (logs, temp files) appear in improve commits.

**Cause**: The standalone `ca improve` script uses `git add -A` when committing an `IMPROVED` result, which stages everything in the working tree.

**Workaround**: Ensure your `.gitignore` covers `agent_logs/`, temp files, and build artifacts before launching the improve loop.

## Different rollback behavior between standalone and loop

The `ca improve` CLI command generates a standalone improvement script (`improvement-loop.sh`), separate from the `ca loop --improve` integrated version. They use different rollback strategies:

| Version | Rollback method | Behavior |
|---------|----------------|----------|
| `ca improve` (standalone) | `git stash push` | Preserves changes in stash; non-destructive |
| `ca loop --improve` | `git reset --hard` + `git clean -fd` | Discards changes completely; destructive |

This is a known inconsistency. If you need to inspect failed iterations, use the standalone version — its stash entries survive for later review.

## Time budget exceeded mid-topic

**Symptom**: A topic stops partway through with remaining iterations unused.

**Cause**: The global `--improve-time-budget` is checked at the start of each iteration. If the budget is exhausted, the loop exits even if the current topic has iterations remaining.

**Fix**: This is expected behavior. Increase the time budget or reduce the number of programs. The loop processes topics in alphabetical order — put higher-priority topics in files that sort earlier (e.g., `01-error-handling.md`).
