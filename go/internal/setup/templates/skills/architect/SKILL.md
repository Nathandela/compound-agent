---
name: Architect
description: Decompose a large system specification into cook-it-ready epic beads via DDD bounded contexts
phase: architect
---

# Architect Skill

## Overview
Take a large system specification and decompose it into naturally-scoped epic beads that the infinity loop can process via cook-it. Each output epic is sized for one cook-it cycle.

6 phases with 5 human gates (Phase 5 and Phase 6 are opt-in). Runs BEFORE spec-dev -- each decomposed epic then goes through full cook-it (including spec-dev to refine its EARS subset).

## Input
- Beads epic ID: read epic description as input
- File path: read markdown file as input
- Neither: use \`AskUserQuestion\` to gather the system description

## Phase 1: Socratic
**Goal**: Understand the system domain before decomposing.
1. Search memory: \`ca search\` for past features, constraints, decisions
2. Search knowledge: \`ca knowledge "relevant terms"\`
3. **Research sufficiency gate** (see below)
4. Ask "why" before "how" -- understand the real need
5. Build a **domain glossary** (ubiquitous language) from the dialogue
6. **Design skill detection**: If the system involves building something users will see or interact with -- websites, web apps, dashboards, landing pages, APIs with client-facing surfaces, or any product where design quality matters -- flag it for the \`/compound:build-great-things\` skill. This covers both visual design (typography, color, motion, states) and software design philosophy (deep modules, complexity management, information architecture, state architecture). This informs the Phase 2 spec note.
7. Produce a **discovery mindmap** (Mermaid \`mindmap\`) to expose assumptions
8. **Reversibility analysis**: classify decisions as irreversible (schema, public API, service boundary), moderate (framework), or reversible (library, config). Spend effort proportional to irreversibility.
9. **Change volatility**: rate each boundary stable/moderate/high. High-volatility justifies modularity investment.
10. Use \`AskUserQuestion\` to clarify scope and preferences

### Research Sufficiency Gate
After steps 1-2, evaluate whether the domain is well-enough understood to decompose:

1. **Collect results**: Gather all hits from \`ca search\` and \`ca knowledge\` plus any existing documents in \`docs/research/\` relevant to the domain.
2. **Evaluate relevance, not just count**: Score each result for semantic relevance to the decomposition task (STPA H2.1). A result is "relevant" only if it directly informs bounded context identification, interface design, or domain modeling for this specific system.
3. **Apply threshold**: If **fewer than 3 results score above the relevance threshold (0.7+ similarity or clear topical match)**, the domain is insufficiently understood.
   - **Insufficient**: Recommend triggering \`/compound:get-a-phd\` with the domain topic before continuing decomposition. Use \`AskUserQuestion\` to confirm with the user.
   - **Sufficient**: Note the evidence ("N relevant sources found: [list]") and proceed. Skip get-a-phd.
4. **Time budget** (STPA H2.5): Research (including any get-a-phd execution) is capped at **15 minutes or 3 research rounds**, whichever comes first. If the budget expires, proceed with available knowledge and document gaps as assumptions.
5. **Artifact storage**: When get-a-phd produces output, verify artifacts land in \`docs/research/<topic>/\` and that \`docs/research/index.md\` is updated before continuing to decomposition.

**Gate 1**: Use \`AskUserQuestion\` to confirm the understanding is complete before proceeding to Spec.

## Phase 2: Spec
**Goal**: Produce a system-level specification.
1. Write **system-level EARS requirements** (Ubiquitous/Event/State/Unwanted/Optional patterns)
2. Produce **architecture diagrams**: C4Context, sequenceDiagram, stateDiagram-v2
3. Generate a **scenario table** from the EARS requirements
4. Write the spec to \`docs/specs/<name>.md\` and create a **meta-epic bead**
5. **Design skill note**: If design-relevant work was detected in Phase 1 (step 6), add a note to the spec recommending that applicable epics invoke \`/compound:build-great-things\` during their work phase. The skill covers both software design philosophy (Ousterhout's complexity management, deep modules, information hiding) and the full build sequence for user-facing products (IA, typography, color, motion, states, accessibility, conversion). Read \`build-great-things/SKILL.md\` for the full playbook.
6. **Default profile note (advisory only)**: If the system clearly maps to a dominant delivery shape (`webapp`, `api`, `cli`, `library`, `service`), record that in the spec or meta-epic as advisory context for downstream plan. Do NOT create repo-global config for this, and do NOT treat it as a substitute for the per-epic `## Verification Contract`.

### Advisory Fleet (Post-Spec)
Before presenting the spec to the human, solicit external architectural perspectives. Read \`architect/references/advisory-fleet.md\` for the full protocol. In brief:
1. **Detect** available advisor CLIs (\`claude\`, \`gemini\`, \`codex\`) with a health-check Bash call
2. **Write** prompt files to \`/tmp/advisory/\` (one per lens, parallel Write calls)
3. **Spawn** each advisor as a background Bash call (\`run_in_background: true\`, all in one message)
4. **Collect** reports as each advisor finishes (Read tool), then **synthesize** into a structured brief
5. **Persist** the brief to \`docs/specs/<name>-advisory-brief.md\`

The 4 advisor lenses (assigned to available CLIs per the fallback table in the reference doc):
   - **Security & Reliability** -- attack surfaces, failure modes, trust boundaries
   - **Scalability & Performance** -- bottlenecks, growth patterns, resource contention
   - **Organizational & Delivery** -- team boundaries, coordination cost, cognitive load
   - **Simplicity & Alternatives** (devil's advocate) -- over-engineering, simpler approaches

If no advisor CLIs are available, skip this step and proceed directly to Gate 2. The advisory fleet is non-blocking -- it informs the human's decision but cannot veto it.

**Gate 2**: Use \`AskUserQuestion\` to get human approval of the system-level spec. The Gate 2 question MUST include the advisory fleet brief (if produced) so the human sees both the spec and external perspectives in the same view. If no brief was produced, note why (no CLIs, all timed out, etc.).

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
- Delivery profile hints when they materially affect downstream verification contracts

**Multi-criteria validation** before Gate 3 -- for each epic:
- [ ] Structural: low change coupling, acyclic dependencies
- [ ] Semantic: stable bounded context, coherent ubiquitous language
- [ ] Organizational: single team owner, within cognitive budget
- [ ] Economic: modularity benefit > coordination overhead
- [ ] For user-facing systems, at least one early epic is a production-grade slice, not only subsystem scaffolding

**Gate 3**: Use \`AskUserQuestion\` to get human approval of the epic structure, dependency graph, and interface contracts.

## Phase 4: Materialize
**Goal**: Create the actual beads.
1. Create epic beads via \`bd create --title="..." --type=epic --priority=<N>\` for each approved epic
2. Store scope, EARS subset, interface contracts (explicit + implicit), and key assumptions in each epic description
3. Define **fitness functions** per epic to monitor assumptions. Document re-decomposition trigger.
4. Wire dependencies via \`bd dep add\` for all relationships
5. Store processing order as notes on the meta-epic
6. **Create Integration Verification epic** (see below)
7. Capture lessons via \`ca learn\`

### Integration Verification Epic
After creating all domain epics, create a final **Integration Verification (IV) epic** that validates cross-epic interfaces:

1. **Create the IV epic**: \`bd create --title="Integration Verification: <system name>" --type=epic --priority=<N>\`
2. **Wire dependencies**: The IV epic depends on ALL other materialized epics (\`bd dep add <iv-id> <epic-id>\` for each). It runs last.
3. **Scope proportionally** (IV-2) using the contract classification tree:
   | Contract Type | Examples | IV Scope |
   |--------------|----------|----------|
   | Data-only | Shared structs, config, file formats | **LIGHT** — schema validation, round-trip tests |
   | Behavioral | API calls, event handlers, callbacks | **MEDIUM** — contract tests, integration scenarios |
   | Composition | Shared state, orchestration, lifecycle | **FULL** — end-to-end flows, failure injection |
   Classify each interface contract from Phase 3 and pick the highest scope level across all contracts.
4. **IV epic description must include** (STPA H3.3):
   - Scope level (LIGHT / MEDIUM / FULL) with justification
   - **Contracts under test table**: list every cross-epic interface contract with source epic, target epic, contract type, and test approach
   - Dependencies (all materialized epics)
   - Instruction that the IV epic goes through the full cook-it pipeline (IV-3)
   - Instruction that the plan phase produces tasks testing cross-epic interfaces from the architect's contracts (IV-4)
   - Instruction that if integration tests find cross-boundary failures, create bug beads with deps to the originating epics (IV-5)

## Phase 5: Launch (Opt-in)
**Goal**: Configure and launch the infinity loop on the materialized epics.

This phase is OPT-IN. After Phase 4:
- If the user's starting prompt mentioned loop/launch intent: proceed directly.
- Otherwise: use \`AskUserQuestion\` to ask if they want to launch the infinity loop.
- If declined: stop here. The architect's job is done.

**Gate 4** (launch consent received):

**Invoke \`/compound:launch-loop\` now.** Do NOT attempt to run \`ca loop\` or \`ca polish\` directly. The launch-loop command enforces mandatory skill reading, authorization gates, CLI flag syntax, and critical gotchas. It is the ONLY supported entry point for loop launching.

### Phase 6: Polish (Opt-in, post-loop)

After the infinity loop completes, ask the user if they want polish cycles. If yes, invoke \`/compound:launch-loop\` again with polish intent. It handles both infinity and polish loop configuration.

## Memory Integration
- \`ca search\` before starting each phase
- \`ca knowledge\` for indexed project docs
- \`ca learn\` after corrections or discoveries

## Common Pitfalls
- Jumping to decomposition without understanding the domain (skip Socratic)
- Micro-slicing epics too small (each epic should be a natural bounded context, not a single task)
- Missing interface contracts between epics (coupling will bite during implementation)
- Not searching memory for past decomposition patterns
- Skipping human gates (Gates 1-3 are mandatory; Gates 4-5 activate with opt-in phases)
- Creating epics without EARS subset (loses traceability to system spec)
- Not wiring dependencies (loop will process in wrong order)
- Treating complex decisions as complicated (Cynefin): service boundaries need experiments, not just analysis
- Ignoring implicit contracts (threading, timing, backpressure) -- Garlan's architectural mismatch
- Not capturing assumptions that would invalidate the decomposition if wrong
- **Counting search results without evaluating relevance** -- 10 low-relevance hits do not equal domain familiarity (STPA H2.1)
- **Unbounded research spirals** -- always enforce the 15-minute / 3-round budget (STPA H2.5)
- **Skipping the research gate when the domain is novel** -- unfamiliar domains lead to wrong bounded contexts
- **Omitting the Integration Verification epic** -- cross-epic interface failures are only caught at the end; without IV, integration bugs surface too late
- **Under-scoping integration verification** -- using LIGHT scope when behavioral or composition contracts exist; match scope to contract complexity
- **IV epic without enough structure** -- spec-dev cannot produce a meaningful plan if the IV description lacks the contracts-under-test table (STPA H3.3)
- **Skipping the advisory fleet** when external CLIs are available -- the 5-minute investment catches blind spots before committing to an architecture
- **Treating advisory feedback as blocking** -- advisors inform the human, they don't have veto power
- Launching loop without verifying all epics are status=open (pre-flight check)
- Skipping dry-run (catches configuration errors before live execution)
- Running polish loop without specifying cycle count upfront (N must be decided before launch)
- Using polish loop for correctness fixes (it is craft-focused; use review fleet for correctness)

## Quality Criteria
- [ ] Socratic phase completed with domain glossary and mindmap
- [ ] **Research sufficiency gate evaluated** with documented evidence (sources listed or get-a-phd triggered)
- [ ] System-level EARS requirements cover all capabilities
- [ ] Architecture diagrams produced (C4, sequence, state)
- [ ] Spec written to docs/specs/ and meta-epic created
- [ ] 6-angle convoy executed for decomposition (DDD + STPA + gap analysis)
- [ ] Each epic has scope boundaries, EARS subset, interface contracts (explicit + implicit), and assumptions
- [ ] Dependencies wired via bd dep add
- [ ] Processing order stored on meta-epic
- [ ] **Integration Verification epic created** with correct scope level, contracts-under-test table, and dependencies on all domain epics
- [ ] Advisory fleet consulted before Gate 2 (or skipped with documented reason)
- [ ] 3 human gates passed via AskUserQuestion (4 if launch phase activated, 5 if polish phase activated)
- [ ] Memory searched at each phase
- [ ] Phase 5 opt-in question asked (or intent detected in starting prompt)
- [ ] Pre-flight: all epic beads verified status=open before launch
- [ ] Dry-run offered and reviewed (if launch activated)
- [ ] Loop launched in screen session (if user approved)
- [ ] Monitoring commands reported to user
- [ ] Phase 6 opt-in question asked after loop completes (5 if polish activated)
- [ ] Polish cycle count specified upfront by user
- [ ] Polish dry-run offered and reviewed (if polish activated)
- [ ] Polish loop launched in separate screen session (if user approved)
