---
name: compound-review
description: Multi-agent review with parallel specialized reviewers and severity classification
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, consolidating findings with severity classification (P0/P1/P2/P3), and gating completion on implementation-reviewer approval.

## Methodology
1. Run quality gates first: `pnpm test && pnpm lint`
2. Read the epic description (`bd show <epic>`) for EARS requirements -- reviewers verify each requirement is met
3. Search memory with `npx ca search` for known patterns and recurring issues
4. Select reviewer tier based on diff size:
   - **Small** (<100 lines): 4 core -- security, test-coverage, simplicity, cct-reviewer
   - **Medium** (100-500): add architecture, performance, edge-case (7 total)
   - **Large** (500+): all 11 reviewers including docs, consistency, error-handling, pattern-matcher
5. Spawn reviewers in an **AgentTeam** (TeamCreate + Task with `team_name`):
   - Role skills: `.claude/skills/compound/agents/{security-reviewer,architecture-reviewer,performance-reviewer,test-coverage-reviewer,simplicity-reviewer}/SKILL.md`
   - Security specialist skills (on-demand, spawned by security-reviewer): `.claude/skills/compound/agents/{security-injection,security-secrets,security-auth,security-data,security-deps}/SKILL.md`
   - For large diffs (500+), deploy MULTIPLE instances; split files across instances, coordinate via SendMessage
6. Reviewers communicate findings to each other via `SendMessage`
7. Collect, consolidate, and deduplicate all findings
8. Classify by severity: P0 (blocks merge), P1 (critical/blocking), P2 (important), P3 (minor)
9. Use `AskUserQuestion` when severity is ambiguous or fix has multiple valid options
10. Create beads issues for P1 findings: `bd create --title="P1: ..."`
11. Verify spec alignment: flag unmet EARS requirements as P1, flag requirements met but missing from acceptance criteria as gaps
12. Fix all P1 findings before proceeding
13. Run `/implementation-reviewer` as mandatory gate
14. Capture novel findings with `npx ca learn`; pattern-matcher auto-reinforces recurring issues

## Memory Integration
- Run `npx ca search` before review for known recurring issues
- **pattern-matcher** auto-reinforces: recurring findings get severity increased via `npx ca learn`
- **cct-reviewer** reads CCT patterns for known Claude failure patterns
- Capture the review report via `npx ca learn` with `type=solution`

## Docs Integration
- **docs-reviewer** checks code/docs alignment and ADR compliance
- Flags undocumented public APIs and ADR violations

## Literature
- Consult `docs/compound/research/code-review/` for systematic review methodology, severity taxonomies, and evidence-based review practices
- Run `npx ca knowledge "code review methodology"` for indexed knowledge on review techniques
- Run `npx ca search "review"` for lessons from past review cycles

## Common Pitfalls
- Ignoring reviewer feedback because "it works"
- Not running all 11 reviewer perspectives (skipping dimensions)
- Treating all findings as equal priority (classify P1/P2/P3 first)
- Not creating beads issues for deferred fixes
- Skipping quality gates before review
- Bypassing the implementation-reviewer gate
- Not checking CCT patterns for known Claude mistakes

## Quality Criteria
- All quality gates pass (`pnpm test`, lint)
- All 11 reviewer perspectives were applied in parallel
- Findings are classified P0/P1/P2/P3 and deduplicated
- pattern-matcher checked memory and reinforced recurring issues
- cct-reviewer checked against known Claude failure patterns
- docs-reviewer confirmed docs/ADR alignment
- security-reviewer P0 findings: none (blocks merge)
- security-reviewer P1 findings: all acknowledged or resolved
- All P1 findings fixed before `/implementation-reviewer` approval
- All spec requirements verified against implementation
- `/implementation-reviewer` approved as mandatory gate

## PHASE GATE 4 -- MANDATORY
Before starting Compound, verify review is complete:
- `/implementation-reviewer` must have returned APPROVED
- All P1 findings must be resolved

**CRITICAL**: Use `npx ca learn` for ALL lesson storage -- NOT MEMORY.md.

