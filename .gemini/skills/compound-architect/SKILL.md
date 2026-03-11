---
name: compound-architect
description: Decompose a large system specification into cook-it-ready epic beads via DDD bounded contexts
---

# Architect Skill

## Overview
Take a large system specification and decompose it into naturally-scoped epic beads that the infinity loop can process via cook-it. Each output epic is sized for one cook-it cycle.

4 phases with 3 human gates. Runs BEFORE spec-dev -- each decomposed epic then goes through full cook-it (including spec-dev to refine its EARS subset).

## Input
- Beads epic ID: read epic description as input
- File path: read markdown file as input
- Neither: use `AskUserQuestion` to gather the system description

## Phase 1: Socratic
**Goal**: Understand the system domain before decomposing.
1. Search memory: `npx ca search` for past features, constraints, decisions
2. Search knowledge: `npx ca knowledge "relevant terms"`
3. Ask "why" before "how" -- understand the real need
4. Build a **domain glossary** (ubiquitous language) from the dialogue
5. Produce a **discovery mindmap** (Mermaid `mindmap`) to expose assumptions
6. Use `AskUserQuestion` to clarify scope and preferences

**Gate 1**: Use `AskUserQuestion` to confirm the understanding is complete before proceeding to Spec.

## Phase 2: Spec
**Goal**: Produce a system-level specification.
1. Write **system-level EARS requirements** covering the entire system:
   - Ubiquitous: `The system shall <action>.`
   - Event-driven: `When <trigger>, the system shall <action>.`
   - State-driven: `While <state>, the system shall <action>.`
   - Unwanted behavior: `If <condition>, then the system shall <action>.`
   - Optional: `Where <feature>, the system shall <action>.`
2. Produce **architecture diagrams**: C4Context, sequenceDiagram, stateDiagram-v2
3. Generate a **scenario table** from the EARS requirements
4. Write the spec to `docs/specs/<name>.md`
5. Create a **meta-epic bead** linking to the spec file

**Gate 2**: Use `AskUserQuestion` to get human approval of the system-level spec.

## Phase 3: Decompose
**Goal**: Break the system into naturally-scoped epics using DDD bounded contexts.

Spawn **4 parallel subagents** (via Agent tool):
1. **Bounded context mapper**: Identify natural domain boundaries and propose candidate epics
2. **Dependency analyst**: Analyze coupling between candidates, propose dependency graph with processing order
3. **Scope sizer**: Evaluate each candidate against "completable in one cook-it cycle" heuristic, flag oversized/undersized
4. **Interface designer**: Define explicit interface contracts (data/APIs) between candidate epics

**Synthesis**: Merge subagent findings into a proposed epic structure. For each epic:
- Title and scope boundaries (what is in, what is out)
- Relevant EARS subset from the system spec
- Interface contracts: provides (what it exposes) and consumes (what it needs)
- Pointer to the master spec file

**Gate 3**: Use `AskUserQuestion` to get human approval of the epic structure, dependency graph, and interface contracts.

## Phase 4: Materialize
**Goal**: Create the actual beads.
1. Create epic beads via `bd create --title="..." --type=epic --priority=<N>` for each approved epic
2. Store scope, EARS subset, and interface contracts in each epic description
3. Wire dependencies via `bd dep add` for all relationships (including child epics depending on meta-epic where needed)
4. Store suggested processing order as notes on the meta-epic
5. Capture lessons via `npx ca learn`

## Memory Integration
- `npx ca search` before starting each phase
- `npx ca knowledge` for indexed project docs
- `npx ca learn` after corrections or discoveries

## Common Pitfalls
- Jumping to decomposition without understanding the domain (skip Socratic)
- Micro-slicing epics too small (each epic should be a natural bounded context, not a single task)
- Missing interface contracts between epics (coupling will bite during implementation)
- Not searching memory for past decomposition patterns
- Skipping human gates (the 3 gates are the quality checkpoints)
- Creating epics without EARS subset (loses traceability to system spec)
- Not wiring dependencies (loop will process in wrong order)

## Quality Criteria
- [ ] Socratic phase completed with domain glossary and mindmap
- [ ] System-level EARS requirements cover all capabilities
- [ ] Architecture diagrams produced (C4, sequence, state)
- [ ] Spec written to docs/specs/ and meta-epic created
- [ ] 4-angle DDD convoy executed for decomposition
- [ ] Each epic has scope boundaries, EARS subset, and interface contracts
- [ ] Dependencies wired via bd dep add
- [ ] Processing order stored on meta-epic
- [ ] 3 human gates passed via AskUserQuestion
- [ ] Memory searched at each phase

