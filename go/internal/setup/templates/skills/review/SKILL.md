---
name: Review
description: Multi-agent review with parallel specialized reviewers and severity classification
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, consolidating findings with severity classification (P0/P1/P2/P3), and gating completion on implementation-reviewer approval.

## Methodology
1. Run quality gates first: `{{QUALITY_GATE_TEST}} && {{QUALITY_GATE_LINT}}`
2. Read the epic description (`bd show <epic>`) for EARS requirements -- reviewers verify each requirement is met
3. **Check Acceptance Criteria**: Locate the `## Acceptance Criteria` table in the epic description. For each AC row, verify the implementation satisfies the criterion using the specified verification method.
   - If the AC section is **missing**: flag as **P1 process finding** ("No Acceptance Criteria section found in epic description — plan phase did not generate AC table")
   - If an AC criterion is **not met**: flag as **P1 defect** ("AC-N not satisfied: <details>")
   - If an AC criterion is **met**: annotate the AC row as PASS in the review report
4. Search memory with `ca search` for known patterns and recurring issues
5. Select reviewer tier based on diff size:
   - **Small** (<100 lines): 4 core -- security, test-coverage, simplicity, cct-reviewer
   - **Medium** (100-500): add architecture, performance, edge-case, scenario-coverage (8 total)
   - **Large** (500+): all 12 reviewers including docs, consistency, error-handling, pattern-matcher
6. Spawn reviewers in an **AgentTeam** (TeamCreate + Task with `team_name`):
   - Role skills: `.claude/skills/compound/agents/{security-reviewer,architecture-reviewer,performance-reviewer,test-coverage-reviewer,simplicity-reviewer,scenario-coverage-reviewer}/SKILL.md`
   - Security specialist skills (on-demand, spawned by security-reviewer): `.claude/skills/compound/agents/{security-injection,security-secrets,security-auth,security-data,security-deps}/SKILL.md`
   - For large diffs (500+), deploy MULTIPLE instances; split files across instances, coordinate via SendMessage
7. Reviewers communicate findings to each other via `SendMessage`
8. Collect, consolidate, and deduplicate all findings
9. Classify by severity: P0 (blocks merge), P1 (critical/blocking), P2 (important), P3 (minor)
10. Use `AskUserQuestion` when severity is ambiguous or fix has multiple valid options
11. Create beads issues for P1 findings: `bd create --title="P1: ..."`
12. Verify spec alignment: flag unmet EARS requirements as P1, flag requirements met but missing from acceptance criteria as gaps
13. Fix all P1 findings before proceeding
14. Run `/implementation-reviewer` as mandatory gate
15. Capture novel findings with `ca learn`; pattern-matcher auto-reinforces recurring issues

## Acceptance Criteria Review Protocol
When checking AC, produce a summary table in the review report:

| AC ID | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| AC-1  | When X... | PASS/FAIL | test file, line N / manual check |

All AC rows must be PASS for the review to proceed to `/implementation-reviewer`.

## Memory Integration
- Run `ca search` before review for known recurring issues
- **pattern-matcher** auto-reinforces: recurring findings get severity increased via `ca learn`
- **cct-reviewer** reads CCT patterns for known Claude failure patterns
- Capture the review report via `ca learn` with `type=solution`

## Docs Integration
- **docs-reviewer** checks code/docs alignment and ADR compliance
- Flags undocumented public APIs and ADR violations

## Literature
- Consult `docs/compound/research/code-review/` for systematic review methodology, severity taxonomies, and evidence-based review practices
- Run `ca knowledge "code review methodology"` for indexed knowledge on review techniques
- Run `ca search "review"` for lessons from past review cycles

## Common Pitfalls
- Ignoring reviewer feedback because "it works"
- Not running all 12 reviewer perspectives (skipping dimensions)
- Treating all findings as equal priority (classify P1/P2/P3 first)
- Not creating beads issues for deferred fixes
- Skipping quality gates before review
- Bypassing the implementation-reviewer gate
- Not checking CCT patterns for known Claude mistakes
- Not checking acceptance criteria from the epic description

## Quality Criteria
- All quality gates pass (`{{QUALITY_GATE_TEST}}`, `{{QUALITY_GATE_LINT}}`)
- All 12 reviewer perspectives were applied in parallel
- Findings are classified P0/P1/P2/P3 and deduplicated
- pattern-matcher checked memory and reinforced recurring issues
- cct-reviewer checked against known Claude failure patterns
- docs-reviewer confirmed docs/ADR alignment
- security-reviewer P0 findings: none (blocks merge)
- security-reviewer P1 findings: all acknowledged or resolved
- All P1 findings fixed before `/implementation-reviewer` approval
- All spec requirements verified against implementation
- **All acceptance criteria checked and verified (PASS/FAIL)**
- scenario-coverage-reviewer verified scenario table coverage (medium+ diffs)
- `/implementation-reviewer` approved as mandatory gate

## PHASE GATE 4 -- MANDATORY
Before starting Compound, verify review is complete:
- `/implementation-reviewer` must have returned APPROVED
- All P1 findings must be resolved
- **All acceptance criteria must be PASS**

**CRITICAL**: Use `ca learn` for ALL lesson storage -- NOT MEMORY.md.
