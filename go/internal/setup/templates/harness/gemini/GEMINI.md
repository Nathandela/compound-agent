# Compound Agent Integration

This project uses compound-agent for session memory via CLI commands. Gemini CLI
reads this `GEMINI.md` file at session start.

## CLI Commands (ALWAYS USE THESE)

| Command | Purpose |
|---------|---------|
| `ca search "query"` | Search lessons before architectural decisions or complex planning |
| `ca knowledge "query"` | Semantic search over project docs (keyword phrases, not questions) |
| `ca learn "insight"` | Capture a lesson AFTER a correction or discovery |
| `ca list` | List all stored lessons |

## Mandatory Recall

Call `ca search "query"` and `ca knowledge "query"` BEFORE each phase, before every
architectural decision, before re-implementing a known pattern, and after a
correction. Past mistakes repeat when search is skipped.

## Phase Gates

Drive epics through the cook-it phases in order: plan -> work -> review -> compound.
Do not skip a phase. Initialize once with `ca phase-check init <epic>`; start each
phase with `ca phase-check start <phase>` and gate the transition before moving on:

- After plan:   `ca phase-check gate post-plan`
- After work:   `ca phase-check gate gate-3`
- After review: `ca phase-check gate gate-4`
- Before done:  `ca verify-gates <epic>` (must pass) + the quality gates (test, lint,
  build), then `ca phase-check gate final`.

If a gate fails, DO NOT proceed. Fix the issue first.

## Verification Contract

The `## Verification Contract` written during plan is the epic-local source of truth
for what "done" means: product profile, touched surfaces, principal risks, and
required evidence. Do not invent "done" late in the cycle. If the contract is
missing, go back to plan.

## Capture Protocol

Run `ca learn "insight"` AFTER a user corrects you, after a test fail -> fix -> pass
cycle, or when you discover project-specific knowledge. Never edit
`.claude/lessons/index.jsonl` directly.

## Epic Completion Protocol

When driving an epic, print exactly one marker on its own line when it terminates:
`EPIC_COMPLETE`, `HUMAN_REQUIRED: <reason>`, or `EPIC_FAILED`. Gemini does not
auto-commit; commit and push explicitly before printing `EPIC_COMPLETE`:

```bash
git add -A && git commit -m "<message>" && git push
```

(A future enhancement could enforce the gate with an antigravity decision:deny hook;
no hard hook is wired today.)
