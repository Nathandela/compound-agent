---
name: Spec Dev
description: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams
phase: spec-dev
---

# Spec Dev Skill

## Overview
Develop unambiguous, testable specifications before implementation. Structured 4-phase process producing EARS-notation requirements, architecture diagrams, and a `docs/specs/<epic-id>-<slug>.md` spec file plus a pointer-stub beads epic.

Scale formality to risk: skip for trivial (<1h), lightweight (EARS + epic) for small, full 4-phase for medium+. Use `AskUserQuestion` early to gauge scope.

## Methodology: 4-Phase Spec Development

### Phase 1: Explore
**Goal**: Map the problem domain before narrowing.
1. Ask "why" before "how" -- understand the real need
2. Search memory: `ca search` for past features, constraints, decisions
3. Search knowledge: `ca knowledge "relevant terms"`
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
6. **Generate scenario table** from EARS requirements and Mermaid diagrams:
   - For each EARS requirement: at least one **happy** scenario + one **error** scenario
   - For quantified parameters: **boundary** scenarios (min, max, just-beyond)
   - From sequence diagrams: one scenario per message path including alt/opt fragments
   - From state diagrams: each transition + at least one invalid transition (**adversarial**)
   - For multi-parameter requirements: **combinatorial** scenarios using pairwise (2-way) coverage
   - For external interfaces: **adversarial** scenarios per applicable STRIDE category (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege)
   - Use sequential IDs (S1, S2...) and this table format:

   | ID | Source | Category | Precondition | Trigger | Expected Outcome |
   |----|--------|----------|--------------|---------|------------------|
   | S1 | R1 | happy | precondition | action | assertion |

   Categories: `happy`, `error`, `boundary`, `combinatorial`, `adversarial`

**Iteration trigger**: If contradictions or gaps emerge, loop back to Understand.

### Phase 4: Hand off
The spec FILE at `docs/specs/<epic-id>-<slug>.md` is the single source of truth. The epic description is only a pointer stub. `<slug>` = epic title kebab-cased (lowercase, spaces to hyphen, strip non-alphanumeric/hyphen chars, collapse repeats, max 50 chars).

1. **Create the beads epic first** if needed so the epic id is known (`bd create --title="..." --type=epic --priority=<N>`)
2. **Write the full spec** to `docs/specs/<epic-id>-<slug>.md`: frontmatter (`epic`, `title`, `status: draft`, `created: <today>`), then `# <title>`, `## Overview`, `## EARS Requirements`, `## Scenario Table` (the table from Phase 3), `## Diagrams`, `## Open Questions`, and an empty `## Amendments` section. The plan phase later inserts Acceptance Criteria and Verification Contract before `## Amendments`. If this epic was materialized by the architect, its description already carries scope boundaries, an EARS subset, interface contracts (explicit + implicit), and assumptions -- fold ALL of that into the spec file (into `## Overview`, `## EARS Requirements`, plus `## Interface Contracts` and `## Assumptions` sections) so nothing is lost when the description becomes a stub in step 3. See `references/spec-guide.md` for the full skeleton.
3. **Set the epic description to the pointer stub** (`bd update <epic-id> --description="..."`):
   ```
   <one-line summary of the epic>

   Spec: docs/specs/<epic-id>-<slug>.md

   Open questions for plan: <comma list, or none>
   ```
4. **Add the Spec: bead note**: `bd update <epic-id> --notes "Spec: docs/specs/<epic-id>-<slug>.md"`
5. **Register in the index**: if `docs/specs/` or `docs/specs/index.md` is missing, create them first (`mkdir -p docs/specs`, write a `# Specs Index` header table). Then append a row: `| [<epic-id>-<slug>.md](<epic-id>-<slug>.md) | <title> (epic <epic-id>) |`
6. **Flag open questions** for the plan phase in the stub's "Open questions for plan" line
7. Capture lessons: `ca learn`

**Note on downstream contracts**: The EARS requirements you write here are the source material for both the Acceptance Criteria table and the Verification Contract. The plan phase will extract testable AC rows and derive the epic-local proof of done from the product profile, touched surfaces, and risks. Write EARS requirements with testability in mind, and call out user-visible surfaces, public APIs, persistence changes, packaging concerns, and operational risks explicitly.

**Amendments policy**: append-only, MAJOR/MATERIAL changes only (scope shift, requirement change, Verification Contract escalation, compound spec-drift reconciliation). Routine first-time section additions (e.g. plan adding AC/VC) do NOT get an entry.

## Memory Integration
- `ca search` before generating approaches
- `ca knowledge` for indexed project docs
- `ca learn` after corrections or discoveries

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
- Skipping scenario table generation after EARS requirements
- Writing EARS requirements that cannot be mapped to testable acceptance criteria
- Hiding important surfaces or risks in prose so plan cannot derive a clean Verification Contract
- Storing the spec in the epic description instead of `docs/specs/<epic-id>-<slug>.md`
- Leaving the epic description as the full spec rather than a pointer stub
- Forgetting to append the row to `docs/specs/index.md`
- Omitting the empty `## Amendments` section from the spec file

## Quality Criteria
- [ ] Requirements use EARS notation
- [ ] Ambiguities detected and resolved via dialogue
- [ ] Mermaid diagrams used as thinking tools
- [ ] Memory searched (`ca search`)
- [ ] Trade-offs documented with rationale
- [ ] User engaged via `AskUserQuestion` at decisions
- [ ] Scenario table generated from EARS requirements and diagrams
- [ ] Spec written to `docs/specs/<epic-id>-<slug>.md` (single source of truth)
- [ ] Epic description is a pointer stub, not the spec body
- [ ] `docs/specs/index.md` updated with the spec row
- [ ] Empty `## Amendments` section present in the spec file
- [ ] ADRs created for significant decisions
- [ ] **EARS requirements are testable and can map to acceptance criteria**
- [ ] **Important surfaces and risks are explicit enough for plan to derive a Verification Contract**
