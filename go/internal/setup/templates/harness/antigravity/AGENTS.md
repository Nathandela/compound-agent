<!-- compound-agent:antigravity:start -->
## Compound Agent Protocol (Antigravity)

This project uses compound-agent for session memory and structured epic execution
via CLI commands. Antigravity reads this `AGENTS.md` file at session start.

> Deprecation note: the standalone gemini CLI is deprecated and sunsets 2026-06-18.
> Antigravity is its successor. The `--implementer gemini` loop engine still runs
> on the current gemini CLI; antigravity is groundwork only and is not yet a
> functional loop engine.

### CLI Commands (ALWAYS USE THESE)

| Command | Purpose |
|---------|---------|
| `ca search "query"` | Search lessons before architectural decisions or complex planning |
| `ca knowledge "query"` | Semantic search over project docs (keyword phrases, not questions) |
| `ca learn "insight"` | Capture a lesson AFTER a correction or discovery |
| `ca phase-check <init/start/gate> ...` | Track and gate the cook-it phases |
| `ca verify-gates <epic>` | Verify the epic's required evidence before completion |
| `ca list` | List all stored lessons |

### Mandatory Recall

Call `ca search "query"` and `ca knowledge "query"` BEFORE each phase, before every
architectural decision, before re-implementing a known pattern, and after a
correction. Display the results before proceeding. Past mistakes repeat when search
is skipped.

### Capture Protocol

Run `ca learn "insight"` AFTER a user corrects you, after a test fail -> fix -> pass
cycle, or when you discover project-specific knowledge. Never edit
`.claude/lessons/index.jsonl` directly.

### Phase Gates

Drive epics through the cook-it phases in order: plan -> work -> review -> compound.
Do not skip a phase. Initialize once with `ca phase-check init <epic>`; start each
phase with `ca phase-check start <phase>` and gate the transition before moving on:

- After plan:   `ca phase-check gate post-plan`
- After work:   `ca phase-check gate gate-3`
- After review: `ca phase-check gate gate-4`
- Before done:  `ca verify-gates <epic>` (must pass) + the quality gates (test, lint,
  build), then `ca phase-check gate final`.

If a gate fails, DO NOT proceed. Fix the issue first.

### Verification Contract

The `## Verification Contract` written during plan is the epic-local source of truth
for what "done" means: product profile, touched surfaces, principal risks, and
required evidence. Do not invent "done" late in the cycle. If the contract is
missing, go back to plan.

### Epic Completion Protocol

When driving an epic, print exactly one marker on its own line when it terminates:

- `EPIC_COMPLETE` - the epic is implemented, tests pass, and work is committed.
- `HUMAN_REQUIRED: <reason>` - a human decision is needed to proceed.
- `EPIC_FAILED` - the epic could not be completed after retries.

### Commit and Push Reminder

Antigravity does not auto-commit. Before printing `EPIC_COMPLETE` you MUST run:

```bash
git add -A && git commit -m "<message>" && git push
```

Run `bd close <epic>` for the epic in the main tree (not inside a worktree).

(A future enhancement could enforce the gate with an antigravity decision:deny hook;
no hard hook is wired today.)
<!-- compound-agent:antigravity:end -->
