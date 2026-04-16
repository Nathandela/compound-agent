# External Review Loop for Infinity Loop

> Spec ID: 0005
> Status: Approved
> Author: Nathan
> Created: 2026-03-08

## Goal

Add a multi-model review phase to the infinity loop that spawns independent AI reviewers (Claude Sonnet, Claude Opus, Gemini, Codex), collects their reports, feeds them to an implementer session for fixes, and iterates until reviewers approve -- with session resumption so reviewers retain context across cycles.

## Context

The infinity loop (`ca loop`) generates bash scripts that autonomously process beads epics via Claude Code sessions. Currently there is no quality gate between epic completions -- work goes unsupervised. The user already performs manual multi-model review sessions and wants to automate this into the loop.

Key discovery: All 3 CLIs support session resumption:
- Claude: `--session-id <uuid>` to set, `--resume <uuid>` to continue
- Gemini: `--resume latest` or `--resume <index>`
- Codex: `exec resume --last`

## Requirements

- [ ] After every N completed epics (configurable), pause and run a review phase
- [ ] Spawn 4 independent reviewers in parallel (Claude Sonnet, Claude Opus, Gemini, Codex)
- [ ] Each reviewer receives the git diff and bead context, produces a severity-tagged report
- [ ] Collect all reports and feed to a fresh Claude Opus implementer session with full project context
- [ ] Resume reviewer sessions (with retained context) to verify fixes
- [ ] Iterate until all reviewers approve or max cycles reached
- [ ] Run a final review pass when all epics are complete
- [ ] Gracefully skip unavailable CLIs (not all reviewers need to be installed)
- [ ] All review-related code is optional -- only emitted when reviewers are configured

## Acceptance Criteria

- [ ] Given `--review-every 2`, when 2 epics complete, then review phase triggers automatically
- [ ] Given `--reviewers claude-sonnet gemini`, when review runs, then only those 2 reviewers are spawned
- [ ] Given a reviewer outputs REVIEW_APPROVED, when all reviewers approve, then review phase ends early
- [ ] Given REVIEW_CHANGES_REQUESTED, when implementer fixes code, then reviewers are resumed (not fresh) to verify
- [ ] Given `--max-review-cycles 3`, when 3 cycles complete without approval, then review phase ends (advisory) or fails (--review-blocking)
- [ ] Given Gemini CLI is not installed, when review runs, then Gemini is skipped and remaining reviewers proceed
- [ ] Given no `--reviewers` flag, when loop runs, then no review phase is emitted in the script
- [ ] Generated bash script passes `bash -n` syntax validation with review phase included

## New CLI Options

```
--review-every <n>        Review every N completed epics (0 = end-only, default: 0)
--reviewers <names...>    Which reviewers to use (default: claude-sonnet claude-opus gemini codex)
--max-review-cycles <n>   Max review/fix iterations (default: 3)
--review-blocking         Fail loop if review not approved after max cycles
--review-model <model>    Model for implementer fix sessions (default: claude-opus-4-7[1m])
```

## Generated Bash Script Flow

```
Loop starts
  For each epic:
    [existing epic processing]
    On success:
      If --review-every N > 0 and N epics completed since last review:
        run_review_phase("periodic")

  After all epics:
    If any epics completed:
      run_review_phase("final")

run_review_phase(trigger):
  1. Compute git diff range (incremental for periodic, full for final)
  2. detect_reviewers() -- check which CLIs are installed, skip missing
  3. init_review_sessions() -- generate UUIDs for session tracking
  4. For cycle = 1 to MAX_REVIEW_CYCLES:
     a. spawn_reviewers(cycle) -- 4 parallel background processes
        - Cycle 1: fresh sessions (Claude --session-id, Gemini fresh, Codex fresh)
        - Cycle 2+: resume sessions (Claude --resume, Gemini --resume, Codex exec resume)
     b. Wait for all reviewers
     c. Check reports -- if all say REVIEW_APPROVED -> done
     d. feed_implementer() -- fresh Claude session with all 4 reports + full project context
     e. Loop back to (a) for next cycle
  5. If max cycles reached: warn (advisory) or exit 1 (--review-blocking)
```

## Session Resumption Strategy

| CLI | Cycle 1 | Cycle 2+ | ID Management |
|-----|---------|----------|---------------|
| Claude | `--session-id <uuid> -p "..."` | `--resume <uuid> -p "..."` | Pre-generated UUID via `uuidgen` |
| Gemini | `-p "..." -y` | `--resume latest -p "..."` | Auto (uses latest session) |
| Codex | `exec "..."` | `exec resume --last` | Auto (uses last session) |

## Review Reports Directory

```
agent_logs/reviews/
  cycle-1/
    claude-sonnet.md
    claude-opus.md
    gemini.md
    codex.md
    implementer.md
  cycle-2/
    ...
  sessions.json          # UUID -> session ID mapping
```

## Prompt Templates

### Reviewer Prompt
```
You are reviewing code changes made by an autonomous agent loop.

## Completed Beads
<list of bead IDs and titles>

## Git Diff
<diff>

Review for: correctness, security, edge cases, code quality.
Provide a numbered list of findings with severity (P0/P1/P2/P3).
Be concise, actionable, no praise.

If everything looks good: output REVIEW_APPROVED
If changes needed: output REVIEW_CHANGES_REQUESTED then your findings.
```

### Implementer Prompt
```
You received feedback from independent code reviewers. Analyze and implement all fixes.

<claude-sonnet-review>{report}</claude-sonnet-review>
<claude-opus-review>{report}</claude-opus-review>
<gemini-review>{report}</gemini-review>
<codex-review>{report}</codex-review>

Fix ALL P0 and P1 findings. Address P2 where reasonable. Commit fixes.
Run tests to verify. Output FIXES_APPLIED when done.
```

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| All reviewer CLIs missing | Skip review phase entirely, log warning |
| One reviewer crashes/times out | Continue with remaining reports, note missing reviewer |
| Implementer session crashes | Log as incomplete cycle, continue to next cycle |
| Max cycles reached, not approved | Advisory: warn and continue. Blocking: exit 1 |
| Empty git diff | Skip review phase (nothing to review) |
| Concurrent loops with Gemini/Codex | Sessions may collide (documented v1 limitation) |

## Constraints

- **Architecture**: Bash template functions in `loop-review-templates.ts`, following existing pattern
- **File size**: New file must stay under 300 lines (project lint rule)
- **Compatibility**: Must compose cleanly with existing `generateLoopScript()` pipeline
- **Performance**: Reviewers run in parallel via background processes (`&` + `wait`)

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/loop-review-templates.ts` | **NEW** -- 7 bash template functions (~250 lines) |
| `src/commands/loop.ts` | Extend `LoopScriptOptions`, add CLI options, compose review templates |
| `src/commands/loop-templates.ts` | Modify `buildMainLoop()` to accept review params, inject periodic/final triggers |
| `src/config/config.ts` | Add `VALID_LOOP_REVIEWERS` constant |
| `src/commands/loop-review-templates.test.ts` | **NEW** -- tests for all review template functions |
| `src/commands/loop.test.ts` | Add tests for new CLI options |

### Reusable Existing Code

- `buildStreamExtractor()` in `loop-templates.ts:112-144` -- reuse for parsing Claude reviewer output
- `parse_json()` in `loop.ts:81-102` (in generated script header) -- reuse for session JSON parsing
- `buildMarkerDetection()` pattern -- follow for review marker detection
- `readConfig()`/`writeConfig()` in `config.ts` -- reuse for persistent review defaults

## Implementation Sequence (TDD)

### Step 1: Tests for `loop-review-templates.ts`
Create `src/commands/loop-review-templates.test.ts`:
- Each `build*()` output passes `bash -n` syntax check
- `buildReviewConfig()` contains correct variable assignments
- `buildReviewerDetection()` checks for `claude`, `gemini`, `codex` commands
- `buildSpawnReviewers()` uses `--session-id` on cycle 1, `--resume` on cycle 2+
- `buildReviewLoop()` respects `MAX_REVIEW_CYCLES` variable
- Full composed review script passes `bash -n`
- Review markers: `REVIEW_APPROVED` and `REVIEW_CHANGES_REQUESTED` appear in prompts

### Step 2: Implement `loop-review-templates.ts`
7 exported functions:
1. `buildReviewConfig(options)` -- Bash variables
2. `buildReviewerDetection()` -- `detect_reviewers()` checking `command -v`
3. `buildSessionIdManagement()` -- `init_review_sessions()` using `uuidgen`
4. `buildReviewPrompt()` -- `build_review_prompt()` with incremental git diff + bead context
5. `buildSpawnReviewers()` -- `spawn_reviewers()` launching parallel background processes
6. `buildImplementerPhase()` -- `feed_implementer()` with full project context (`ca load-session`)
7. `buildReviewLoop()` -- `run_review_phase()` orchestrating cycles

### Step 3: Extend `loop.ts`
- Add review fields to `LoopScriptOptions` and `LoopOptions`
- Add validation for reviewer names
- Conditionally compose review templates in `generateLoopScript()`
- Add CLI options to `registerLoopCommands()`

### Step 4: Modify `buildMainLoop()` in `loop-templates.ts`
- Add `hasReview` and `reviewEvery` parameters
- Inject `COMPLETED_SINCE_REVIEW` counter
- Add periodic review trigger after epic success
- Add final review call after main loop `done`

### Step 5: Extend `config.ts`
- Add `VALID_LOOP_REVIEWERS`: `['claude-sonnet', 'claude-opus', 'gemini', 'codex']`

## Out of Scope

- Precise session ID management for Gemini/Codex (v1 uses "latest")
- Concurrent loop support (documented limitation)
- Custom reviewer prompts (hardcoded templates for v1)
- Reviewer weighting (all reviewers treated equally)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bash complexity (250+ lines of new templates) | Medium | Medium | Each function self-contained, all validated by `bash -n` tests |
| Gemini/Codex session collision in concurrent runs | Low | Low | Documented limitation, single-loop usage expected |
| Reviewer CLI auth expiry during long loops | Medium | Low | Graceful skip on failure, remaining reviewers continue |
| Large diffs overwhelming reviewers | Medium | Medium | Incremental diffs for periodic, configurable review frequency |

## Decisions (Confirmed)

1. **Review scope**: Incremental diff (since last review) for periodic reviews. Final review covers full diff since loop start.
2. **Resumption**: Accept "latest" limitation for Gemini/Codex in v1. Document as known constraint.
3. **Implementer context**: Full context -- runs `ca load-session` and loads CLAUDE.md, same as main loop sessions.

## Test Strategy

- **Unit tests**: Each `build*()` function tested for bash syntax and content assertions
- **Integration tests**: Full script generation with review options, dry-run execution
- **Property tests**: Not needed (bash template generation is deterministic)
- **Manual testing**: Generate script, inspect review functions, dry-run with `LOOP_DRY_RUN=1`

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing (`pnpm test:fast`)
- [ ] Lint clean (`pnpm lint`)
- [ ] Generated script passes `bash -n`
- [ ] Code reviewed
- [ ] No regressions in existing tests
- [ ] `/implementation-reviewer` approved
