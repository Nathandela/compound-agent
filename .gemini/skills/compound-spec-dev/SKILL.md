---
name: compound-spec-dev
description: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams
---

# Spec Dev Skill

## Overview
Develop unambiguous, testable specifications before implementation. Structured 4-phase process producing EARS-notation requirements, architecture diagrams, and a beads epic.

Scale formality to risk: skip for trivial (<1h), lightweight (EARS + epic) for small, full 4-phase for medium+. Use `AskUserQuestion` early to gauge scope.

## Methodology: 4-Phase Spec Development

### Phase 1: Explore
**Goal**: Map the problem domain before narrowing.
1. Ask "why" before "how" -- understand the real need
2. Search memory: `npx ca search` for past features, constraints, decisions
3. Search knowledge: `npx ca knowledge "relevant terms"`
4. Spawn subagents for research (`.claude/agents/compound/repo-analyst.md`, `memory-analyst.md`, or `subagent_type: Explore`)
5. For deep domain knowledge, consider `/get-a-phd`
6. Build a discovery mindmap (Mermaid `mindmap`) -- makes implicit assumptions visible
7. Use `AskUserQuestion` to clarify scope and preferences
8. **Validate assumptions** about library capabilities, API availability, and tooling compatibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If research reveals the problem is fundamentally different, restart Explore.

### Phase 2: Understand
**Goal**: Crystallize requirements through Socratic dialogue.
1. For each capability, ask: triggers? edge cases? constraints? acceptance criteria?
2. Use Mermaid diagrams (`sequenceDiagram`, `stateDiagram-v2`) to expose hidden structure
3. Detect ambiguities: vague adjectives, unclear pronouns, passive voice, compound requirements. See `references/spec-guide.md` for full checklist
4. Build a domain glossary for ambiguous terms
5. **Change volatility**: rate stable/moderate/high. Flag high-volatility for modularity investment.
6. **Cynefin classify** each requirement: Clear/Complicated/Complex. Complex needs safe-to-fail experiments, not just analysis.
7. For composed systems, add **composition EARS**: `When <A> times out, <B> shall...`, `If <A> retries, <B> shall...`
8. Use `AskUserQuestion` to resolve each ambiguity
9. **Validate assumptions** about edge case behavior, integration compatibility, and constraint feasibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If specifying reveals missing knowledge, loop back to Explore.

### Phase 3: Specify
**Goal**: Produce formal, testable requirements.
1. Write each requirement using **EARS notation** (Ubiquitous, Event-driven, State-driven, Unwanted behavior, Optional -- see `references/spec-guide.md` for templates and ordering)
2. Verify each requirement: no vague adjectives, edge cases covered, quantities specified, testable
3. Document trade-offs when requirements conflict (see `references/spec-guide.md`)
4. Produce architecture diagrams (`erDiagram`, `C4Context`, `flowchart`)
5. Create ADRs in `docs/decisions/` for significant decisions
6. **Generate scenario table** from EARS requirements and Mermaid diagrams. Cover `happy`, `error`, `boundary`, `combinatorial`, and `adversarial` categories. Use sequential IDs (S1, S2...):

   | ID | Source | Category | Precondition | Trigger | Expected Outcome |
   |----|--------|----------|--------------|---------|------------------|
7. **Validate assumptions** about performance bounds and architecture feasibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If contradictions or gaps emerge, loop back to Understand.

### Phase 4: Hand off
1. Create beads epic if needed (`bd create --title="..." --type=epic --priority=<N>`)
2. Store spec in the epic description (`bd update <epic-id> --description="..."`) -- single source of truth, including both EARS requirements and scenario table
3. Flag open questions for plan phase
4. Capture lessons: `npx ca learn`

## Memory Integration
- `npx ca search` and `npx ca knowledge` before generating approaches
- `npx ca learn` after corrections or discoveries

## Reference Material
Read `references/spec-guide.md` on demand for EARS patterns, Mermaid templates, and ambiguity checklists.

## Hypothesis Validation Protocol
Validate assumptions with executable code before recording as fact:
1. **State** the hypothesis explicitly
2. **Write** a minimal throwaway probe script
3. **Execute** the script and capture output
4. **Delete** the script immediately -- no validation code persists
5. **Record** in the Validation Log (table below)

### Validation Log
End each spec with:

| ID | Phase | Hypothesis | Method | Result | Impact on Spec |
|----|-------|-----------|--------|--------|---------------|

## Common Pitfalls
- Jumping to solutions before exploring the problem
- Skipping diagrams -- they reveal hidden assumptions
- Vague requirements without EARS patterns
- Not searching memory for past patterns and pitfalls
- Over-specifying trivial tasks
- Ignoring iteration signals when gaps emerge
- Not creating the beads epic
- Specifying implementation instead of requirements
- Skipping scenario table generation after EARS requirements
- Not classifying requirements by Cynefin domain (Complex needs experiments)
- Assuming without validating -- always probe with throwaway code when feasible
- Persisting validation code instead of deleting after capture

## Quality Criteria
- [ ] Requirements use EARS notation
- [ ] Ambiguities detected and resolved via dialogue
- [ ] Mermaid diagrams used as thinking tools
- [ ] Memory searched (`npx ca search`)
- [ ] Trade-offs documented with rationale
- [ ] User engaged via `AskUserQuestion` at decisions
- [ ] Scenario table generated from EARS requirements and diagrams
- [ ] Spec and scenario table stored in beads epic description
- [ ] ADRs created for significant decisions
- [ ] Cynefin classification applied, volatility assessed
- [ ] Technical assumptions validated with executable probes where feasible

