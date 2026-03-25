---
name: Review
description: Multi-agent review with lesson-calibrated reviewers, runtime verification, and severity classification
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, consolidating findings with severity classification (P0/P1/P2/P3), and gating completion on implementation-reviewer approval. Reviewers are calibrated with past lessons and relevant research before reviewing.

## Methodology
1. Run quality gates first: `{{QUALITY_GATE_TEST}} && {{QUALITY_GATE_LINT}}`
2. Read the epic description (`bd show <epic>`) for EARS requirements -- reviewers verify each requirement is met
3. **Check Acceptance Criteria**: Locate the `## Acceptance Criteria` table in the epic description. For each AC row, verify the implementation satisfies the criterion using the specified verification method.
   - If the AC section is **missing**: flag as **P1 process finding** ("No Acceptance Criteria section found in epic description — plan phase did not generate AC table")
   - If an AC criterion is **not met**: flag as **P1 defect** ("AC-N not satisfied: <details>")
   - If an AC criterion is **met**: annotate the AC row as PASS in the review report
4. **Lesson-Calibrated Review (LCR)**:
   a. For each reviewer category (security, test-coverage, simplicity, architecture, etc.), run `ca search "<category> review"` to retrieve relevant past lessons
   b. Filter results by category match and recency (prefer lessons < 30 days old)
   c. Cap at **3-5 lessons per reviewer** -- more dilutes focus
   d. Inject matched lessons into each reviewer's prompt as calibration context
   e. Consult `docs/compound/research/` for methodology references relevant to the review domain (e.g., `docs/compound/research/scenario-testing/` for testing reviews)
   f. **Contradiction detection**: If a reviewer finding contradicts a high-severity lesson (severity >= P1), flag the contradiction for human review via `AskUserQuestion` with both the finding and the lesson content. Do not auto-resolve contradictions.
   > See `review/references/lesson-calibration.md` for detailed calibration guidance
5. Search memory with `ca search` for known patterns and recurring issues (broader search beyond per-reviewer calibration)
6. Select reviewer tier based on diff size:
   - **Small** (<100 lines): 4 core -- security, test-coverage, simplicity, cct-subagent
   - **Medium** (100-500): add architecture, performance, scenario-coverage, pattern-matcher (8 total)
   - **Large** (500+): all reviewers including doc-gardener, drift-detector, runtime-verifier
7. **Runtime Verification (conditional)**: Detect project type and conditionally spawn runtime-verifier:
   - **Web UI project** (has `package.json` with React/Vue/Angular/Svelte, or HTML files in changed set): spawn `runtime-verifier` agent
   - **HTTP API project** (has Express/Fastify/Flask/Django/Gin routes, or OpenAPI spec): spawn `runtime-verifier` agent
   - **CLI/library project** (no web server, no UI): **SKIP** runtime-verifier -- report as P3/INFO ("Runtime verification skipped: CLI/library project detected")
   - Role skill: `.claude/skills/compound/agents/runtime-verifier/SKILL.md`
   - Timeout: 5min total suite, 2min per individual test
   > See RV-1 through RV-5 in epic for full requirements
8. Spawn reviewers in an **AgentTeam** (TeamCreate + Task with `team_name`):
   - Role skills: `.claude/skills/compound/agents/{security-reviewer,architecture-reviewer,performance-reviewer,test-coverage-reviewer,simplicity-reviewer,scenario-coverage-reviewer}/SKILL.md`
   - Security specialist skills (on-demand, spawned by security-reviewer): `.claude/skills/compound/agents/{security-injection,security-secrets,security-auth,security-data,security-deps}/SKILL.md`
   - Runtime verifier (conditional, see step 7): `.claude/skills/compound/agents/runtime-verifier/SKILL.md`
   - For large diffs (500+), deploy MULTIPLE instances; split files across instances, coordinate via SendMessage
9. Reviewers communicate findings to each other via `SendMessage`
10. Collect, consolidate, and deduplicate all findings
11. Classify by severity: P0 (blocks merge), P1 (critical/blocking), P2 (important), P3 (minor)
12. Use `AskUserQuestion` when severity is ambiguous or fix has multiple valid options
13. Create beads issues for P1 findings: `bd create --title="P1: ..."`
14. Verify spec alignment: flag unmet EARS requirements as P1, flag requirements met but missing from acceptance criteria as gaps
15. Fix all P1 findings before proceeding
16. Run `/implementation-reviewer` as mandatory gate
17. Capture novel findings with `ca learn`; pattern-matcher auto-reinforces recurring issues

## Acceptance Criteria Review Protocol
When checking AC, produce a summary table in the review report:

| AC ID | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| AC-1  | When X... | PASS/FAIL | test file, line N / manual check |

All AC rows must be PASS for the review to proceed to `/implementation-reviewer`.

## Lesson-Calibrated Review Protocol
Reviewers are pre-loaded with relevant lessons before they begin reviewing:

### Per-Reviewer Calibration
Each reviewer receives lessons filtered by their domain:
- **security-reviewer**: `ca search "security vulnerability injection XSS"`
- **test-coverage-reviewer**: `ca search "testing coverage TDD mock"`
- **simplicity-reviewer**: `ca search "complexity refactor simplify"`
- **architecture-reviewer**: `ca search "architecture module boundary coupling"`
- **performance-reviewer**: `ca search "performance optimization latency"`
- **pattern-matcher**: `ca search "pattern recurring mistake"`

### Calibration Rules
- **Cap**: 3-5 lessons per reviewer (prevents context dilution)
- **Recency bias**: Prefer lessons from the last 30 days; older lessons included only if severity >= P1
- **Category filter**: Match lesson tags to reviewer domain; discard unrelated results
- **Research supplement**: Each reviewer may also receive relevant research excerpts from `docs/research/`

### Contradiction Handling (LCR-3)
When a reviewer produces a finding that directly contradicts a calibration lesson:
1. Flag the contradiction with both the finding and the lesson text
2. Escalate via `AskUserQuestion` -- do NOT auto-resolve
3. Record resolution via `ca learn` to prevent future contradictions

## Memory Integration
- Run `ca search` before review for known recurring issues
- **LCR**: Per-reviewer calibration queries (see Lesson-Calibrated Review Protocol above)
- **pattern-matcher** auto-reinforces: recurring findings get severity increased via `ca learn`
- **cct-subagent** reads CCT patterns for known Claude failure patterns
- Capture the review report via `ca learn` with `type=solution`

## Runtime Verification Integration
When the runtime-verifier is triggered (web/API projects only):
- Verifier generates ephemeral Playwright tests against a running application instance
- Findings are reported in standard P0-P3 format and merged with other reviewer findings
- If the app cannot be started: report as **P1/INFRA** with diagnostics (not silent skip)
- If no runtime target exists (CLI/library): report as **P3/INFO SKIPPED**
- Verifier uses Playwright/Puppeteer **library APIs** (code generation), NOT browser MCP tools

## Docs Integration
- **doc-gardener** checks code/docs alignment and ADR compliance
- Flags undocumented public APIs and ADR violations

## Literature
- Consult `docs/compound/research/scenario-testing/` for runtime verification methodology and testing best practices
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
- Not calibrating reviewers with past lessons (LCR skip)
- Running runtime-verifier on CLI projects (wastes time, always SKIPs)
- Silently skipping runtime-verifier when build fails (must report P1/INFRA)

## Quality Criteria
- All quality gates pass (`{{QUALITY_GATE_TEST}}`, `{{QUALITY_GATE_LINT}}`)
- All 12 reviewer perspectives were applied in parallel
- Findings are classified P0/P1/P2/P3 and deduplicated
- **Reviewers were calibrated with 3-5 relevant lessons each (LCR)**
- **Research references were consulted for applicable review domains**
- **Lesson contradictions were flagged for human review (LCR-3)**
- pattern-matcher checked memory and reinforced recurring issues
- cct-subagent checked against known Claude failure patterns
- doc-gardener confirmed docs/ADR alignment
- security-reviewer P0 findings: none (blocks merge)
- security-reviewer P1 findings: all acknowledged or resolved
- **Runtime verifier ran for web/API projects or reported SKIPPED for CLI (RV)**
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
