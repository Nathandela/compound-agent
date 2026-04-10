# Lesson-Calibrated Review (LCR) Reference Guide

## Purpose
Lesson-calibrated review ensures reviewers benefit from accumulated project wisdom. Rather than starting each review from zero, reviewers are pre-loaded with relevant lessons from past sessions, filtered by their domain and weighted by recency and severity.

## How It Works

### 1. Query Strategy
For each reviewer in the AgentTeam, the review lead runs a targeted `ca search` query:

```
ca search "<reviewer-domain> <review-context-keywords>"
```

**Examples**:
- Security reviewer on auth code: `ca search "security authentication token session"`
- Test coverage reviewer on storage module: `ca search "testing storage SQLite mock"`
- Architecture reviewer on new module: `ca search "architecture module boundary coupling"`

### 2. Filtering Rules

| Rule | Threshold | Rationale |
|------|-----------|-----------|
| **Cap per reviewer** | 3-5 lessons | More than 5 dilutes focus; fewer than 3 may miss patterns |
| **Recency bias** | Prefer < 30 days | Recent lessons reflect current codebase state |
| **Severity override** | Include P1+ regardless of age | High-severity lessons remain relevant indefinitely |
| **Category match** | Lesson tags must overlap reviewer domain | Prevents noise from unrelated domains |

### 3. Injection Format
Lessons are injected into the reviewer's prompt as a calibration block:

```
## Calibration Context (from past lessons)
The following lessons from past sessions are relevant to your review domain.
Consider them as you review — they represent known patterns and past corrections.

1. [lesson-id] <lesson text> (learned: <date>, severity: <P1/P2/P3>)
2. [lesson-id] <lesson text> (learned: <date>, severity: <P1/P2/P3>)
3. [lesson-id] <lesson text> (learned: <date>, severity: <P1/P2/P3>)

If your findings contradict any of these lessons, flag the contradiction explicitly.
```

### 4. Research Supplements
Beyond lessons, reviewers may receive research excerpts:
- `docs/compound/research/scenario-testing/` — for test-coverage and runtime verification reviews
- `docs/compound/research/code-review/` — for systematic review methodology
- `docs/compound/research/tdd/` — for TDD and testing pattern reviews
- `docs/compound/research/property-testing/` — for property-based test reviews
- `docs/compound/research/tdd/architecture-tests-archunit.md` — for architecture-reviewer and drift-detector (layer isolation rules, dependency graph enforcement)
- `docs/compound/research/tdd/regenerate-and-diff-testing.md` — for surface-alignment-reviewer and drift-detector (derived artifact freshness)
- `docs/compound/research/tdd/database-testing-patterns.md` — for test-coverage-reviewer and surface-alignment-reviewer (DB testing fidelity, anti-patterns)
- `docs/compound/research/tdd/test-infrastructure-as-code.md` — for test-coverage-reviewer (Testcontainers, fixture orchestration, service virtualization)
- `docs/compound/research/spec_design/protobuf-schema-evolution.md` — for surface-alignment-reviewer and security-reviewer (schema breaking change detection)

Only include excerpts that are directly relevant to the reviewer's domain and the specific code under review.

## Contradiction Detection (LCR-3)

### What Is a Contradiction?
A contradiction occurs when a reviewer produces a finding that directly opposes a calibration lesson. Examples:

| Lesson | Finding | Contradiction? |
|--------|---------|----------------|
| "Never mock the database in integration tests" | "Database calls should be mocked for speed" | Yes |
| "Use string interpolation for SQL" | "Use parameterized queries" | No (lesson was wrong, finding is correct — still flag it) |
| "Always validate input at boundaries" | "Add input validation to internal helper" | No (different context) |

### Resolution Protocol
1. **Flag**: Include both the lesson text and the finding in a contradiction report
2. **Escalate**: Use `AskUserQuestion` to present the contradiction to the human
3. **Record**: After resolution, use `ca learn` to either:
   - Reinforce the lesson (if finding was wrong)
   - Update/supersede the lesson (if finding was correct)
   - Add nuance (if both are correct in different contexts)

### When NOT to Flag
- Finding and lesson address different aspects of the same topic
- Finding is more specific than the lesson (refinement, not contradiction)
- Lesson is about a different technology/module than the code under review

## Edge Cases

### No Lessons Found
If `ca search` returns zero results for a reviewer category:
- Proceed without calibration (this is normal for new projects)
- Do NOT flag as an error or process gap

### All Lessons Are Stale (> 90 days)
- Include the top 2-3 by severity anyway
- Note in calibration block: "These lessons are older than 90 days and may not reflect current codebase state"

### Lesson Conflicts With Each Other
- Present both lessons to the reviewer
- Let the reviewer use judgment about which applies
- If unresolvable, escalate via `AskUserQuestion`
