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

**Iteration trigger**: If research reveals the problem is fundamentally different, restart Explore.

### Phase 2: Understand
**Goal**: Crystallize requirements through Socratic dialogue.
1. For each capability, ask: triggers? edge cases? constraints? acceptance criteria?
2. Use Mermaid diagrams (`sequenceDiagram`, `stateDiagram-v2`) to expose hidden structure
3. Detect ambiguities: vague adjectives, unclear pronouns, passive voice, compound requirements. See `references/spec-guide.md` for full checklist
4. Build a domain glossary for ambiguous terms
5. Use `AskUserQuestion` to resolve each ambiguity

**Iteration trigger**: If specifying reveals missing knowledge, loop back to Explore.

### Phase 3: Specify
**Goal**: Produce formal, testable requirements.
1. Write each requirement using **EARS notation**:
   - Ubiquitous: `The system shall <action>.`
   - Event-driven: `When <trigger>, the system shall <action>.`
   - State-driven: `While <state>, the system shall <action>.`
   - Unwanted behavior: `If <condition>, then the system shall <action>.`
   - Optional: `Where <feature>, the system shall <action>.`
   - Combined ordering: `Where > While > When > If/then > shall`
2. Verify each requirement: no vague adjectives, edge cases covered, quantities specified, testable
3. Document trade-offs when requirements conflict (see `references/spec-guide.md`)
4. Produce architecture diagrams (`erDiagram`, `C4Context`, `flowchart`)
5. Create ADRs in `docs/decisions/` for significant decisions

**Iteration trigger**: If contradictions or gaps emerge, loop back to Understand.

### Phase 4: Hand off
1. Store spec in beads epic description (`bd update <epic> --description="..."`) -- single source of truth
2. Create beads epic if needed (`bd create`)
3. Flag open questions for plan phase
4. Capture lessons: `npx ca learn`

## Memory Integration
- `npx ca search` before generating approaches
- `npx ca knowledge` for indexed project docs
- `npx ca learn` after corrections or discoveries

## Reference Material
Read `.claude/skills/compound/spec-dev/references/spec-guide.md` on demand for EARS patterns, Mermaid templates, ambiguity checklists, and trade-off frameworks.

## Common Pitfalls
- Jumping to solutions before exploring the problem
- Skipping diagrams -- they reveal hidden assumptions
- Vague requirements without EARS patterns
- Not searching memory for past patterns and pitfalls
- Over-specifying trivial tasks
- Ignoring iteration signals when gaps emerge
- Not creating the beads epic
- Specifying implementation instead of requirements

## Quality Criteria
- [ ] Requirements use EARS notation
- [ ] Ambiguities detected and resolved via dialogue
- [ ] Mermaid diagrams used as thinking tools
- [ ] Memory searched (`npx ca search`)
- [ ] Trade-offs documented with rationale
- [ ] User engaged via `AskUserQuestion` at decisions
- [ ] Spec stored in beads epic description
- [ ] ADRs created for significant decisions

