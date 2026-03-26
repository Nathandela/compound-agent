# Program Authoring Guide

> Loaded on demand. Read when referenced by SKILL.md.

## Program Structure

Each improvement program is a markdown file in `improve/` with two required sections:

```markdown
# <Topic Name>

## Goal
What should be improved and why. Be specific about the scope.
Instruct the agent to output a marker (see below) on its own line.

## Validation
How to verify the improvement succeeded. Must be mechanically checkable.
```

Optional sections:
- `## Constraints` — boundaries the agent must respect (e.g., "do not change public API")
- `## Scope` — file patterns or directories to focus on
- `## Examples` — before/after examples of the desired change

## Markers

The Claude session MUST output exactly one of these markers on its own line:

| Marker | Meaning | Loop behavior |
|--------|---------|---------------|
| `IMPROVED` | Changes made, validation passes | Commit and continue |
| `NO_IMPROVEMENT` | No further improvements found | Revert, exit after 2 consecutive |
| `FAILED` | Attempted but validation failed | Revert and exit immediately |

Programs should instruct the agent to output these markers. Include the expectation in your Goal section.

## Authoring Principles

1. **One concern per program** — "error handling" not "error handling + logging + tests"
2. **Mechanical validation** — "all tests pass" not "code looks cleaner"
3. **Bounded scope** — specify directories or file patterns when possible
4. **Diminishing returns aware** — programs should naturally exhaust after a few iterations
5. **Non-destructive** — never instruct deletion of features or public APIs

## Anti-patterns

- Programs that can never reach `NO_IMPROVEMENT` (infinite work)
- Validation that requires human judgment ("improve readability")
- Overlapping programs that fight each other (e.g., "add comments" vs "remove comments")
- Programs without clear exit conditions
- Goals so broad the agent thrashes between approaches each iteration
