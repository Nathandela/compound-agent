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
6. **Reversibility analysis**: classify decisions as irreversible (schema, public API, service boundary), moderate (framework), or reversible (library, config). Spend effort proportional to irreversibility.
7. **Change volatility**: rate each boundary stable/moderate/high. High-volatility justifies modularity investment.
8. Use `AskUserQuestion` to clarify scope and preferences

**Gate 1**: Use `AskUserQuestion` to confirm the understanding is complete before proceeding to Spec.

## Phase 2: Spec
**Goal**: Produce a system-level specification.
1. Write **system-level EARS requirements** (Ubiquitous/Event/State/Unwanted/Optional patterns)
2. Produce **architecture diagrams**: C4Context, sequenceDiagram, stateDiagram-v2
3. Generate a **scenario table** from the EARS requirements
4. Write the spec to `docs/specs/<name>.md` and create a **meta-epic bead**

**Gate 2**: Use `AskUserQuestion` to get human approval of the system-level spec.

## Phase 3: Decompose
**Goal**: Break the system into naturally-scoped epics using DDD bounded contexts.

Spawn **6 parallel subagents** (via Task tool):
1. **Bounded context mapper**: Identify natural domain boundaries and propose candidate epics
2. **Dependency analyst**: Structural + change coupling (git history entropy), dependency graph, processing order
3. **Scope sizer**: "One cook-it cycle" heuristic, cognitive load check (7+/-2 concepts per epic)
4. **Interface designer**: Explicit contracts (API/data) + implicit contracts (threading, delivery guarantees, timeout/retry, backpressure, resource ownership, failure modes)
5. **Control structure analyst** (STPA): Identify hazards at composition boundaries, unsafe control actions (commission/omission/timing), propose mitigations
6. **Structural-semantic gap analyst**: Compare dependency graph partition vs DDD semantic partition, flag disagreements

**Synthesis**: Merge subagent findings into a proposed epic structure. For each epic:
- Title and scope boundaries (what is in, what is out)
- Relevant EARS subset from the system spec
- Interface contracts: explicit (API/data) + implicit (timing, threading, failure modes)
- Assumptions that must hold for this boundary to remain valid
- Org alignment: which team type owns this (stream-aligned/platform/enabling/complicated-subsystem)?
- Pointer to the master spec file

**Multi-criteria validation** before Gate 3 -- for each epic:
- [ ] Structural: low change coupling, acyclic dependencies
- [ ] Semantic: stable bounded context, coherent ubiquitous language
- [ ] Organizational: single team owner, within cognitive budget
- [ ] Economic: modularity benefit > coordination overhead

**Gate 3**: Use `AskUserQuestion` to get human approval of the epic structure, dependency graph, and interface contracts.

## Phase 4: Materialize
**Goal**: Create the actual beads.
1. Create epic beads via `bd create --title="..." --type=epic --priority=<N>` for each approved epic
2. Store scope, EARS subset, interface contracts (explicit + implicit), and key assumptions in each epic description
3. Define **fitness functions** per epic to monitor assumptions. Document re-decomposition trigger.
4. Wire dependencies via `bd dep add` for all relationships
5. Store processing order as notes on the meta-epic
6. Capture lessons via `npx ca learn`

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
- Treating complex decisions as complicated (Cynefin): service boundaries need experiments, not just analysis
- Ignoring implicit contracts (threading, timing, backpressure) -- Garlan's architectural mismatch
- Not capturing assumptions that would invalidate the decomposition if wrong

## Quality Criteria
- [ ] Socratic phase completed with domain glossary and mindmap
- [ ] System-level EARS requirements cover all capabilities
- [ ] Architecture diagrams produced (C4, sequence, state)
- [ ] Spec written to docs/specs/ and meta-epic created
- [ ] 6-angle convoy executed for decomposition (DDD + STPA + gap analysis)
- [ ] Each epic has scope boundaries, EARS subset, interface contracts (explicit + implicit), and assumptions
- [ ] Dependencies wired via bd dep add
- [ ] Processing order stored on meta-epic
- [ ] 3 human gates passed via AskUserQuestion
- [ ] Memory searched at each phase

