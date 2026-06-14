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

Call `ca search` and `ca knowledge` BEFORE architectural decisions, before
re-implementing a known pattern, and after a user correction.

## Capture Protocol

Run `ca learn` AFTER a user corrects you, after a test fail -> fix -> pass cycle,
or when you discover project-specific knowledge. Never edit
`.claude/lessons/index.jsonl` directly.

## Epic Completion Protocol

When driving an epic, print exactly one marker on its own line when it terminates:
`EPIC_COMPLETE`, `HUMAN_REQUIRED: <reason>`, or `EPIC_FAILED`. Commit and push
explicitly before printing `EPIC_COMPLETE`.
