---
name: compound-spec-dev
description: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams
---

# Spec Dev Skill

## Overview
Develop unambiguous, testable specifications before committing to implementation. This phase uses a 4-phase process (Explore, Understand, Specify, Hand off) that produces EARS-notation requirements, Mermaid diagrams, and a beads epic ready for planning.

Scale formality to risk: skip spec-dev for trivial tasks, use lightweight EARS for small tasks, run the full 4-phase process for medium/large work.

## Methodology

### Phase 1: Explore
1. Ask "why" before "how" -- understand the real need behind the request
2. Search memory: `npx ca search` and docs: `npx ca knowledge "relevant topic"` for similar past features and constraints
3. Spawn **subagents** in parallel for research:
   - Available agents: `.claude/agents/compound/repo-analyst.md`, `memory-analyst.md`
   - Or use `subagent_type: Explore` for ad-hoc codebase research
   - Deploy MULTIPLE when topic spans several domains; synthesize findings before proceeding
4. For deep unknowns, invoke the **researcher skill** (`.claude/skills/compound/researcher/SKILL.md`) to produce a survey document
5. Build a discovery mindmap (Mermaid) showing stakeholders, capabilities, constraints
6. Use `AskUserQuestion` to clarify scope, constraints, and preferences

### Phase 2: Understand
1. Probe each capability with Socratic questions: What triggers it? Edge cases? Constraints? Acceptance criteria?
2. Use Mermaid diagrams as thinking tools (`sequenceDiagram` for workflows, `stateDiagram-v2` for lifecycles)
3. Detect and flag ambiguities: vague adjectives, unclear pronouns, passive voice, compound requirements
4. Build a domain glossary for terms with multiple interpretations
5. Resolve ambiguities with `AskUserQuestion` before moving on

### Phase 3: Specify
1. Write requirements using EARS notation:
   - Ubiquitous: `The system shall <action>.`
   - Event-driven: `When <trigger>, the system shall <action>.`
   - State-driven: `While <state>, the system shall <action>.`
   - Unwanted behavior: `If <condition>, then the system shall <action>.`
   - Combined ordering: Where > While > When > If/then > shall
2. Verify each requirement is testable, quantified, and unambiguous
3. Document trade-offs when requirements conflict (MCDA scoring or satisficing)
4. Produce architecture diagrams (`erDiagram`, `C4Context`, `flowchart`)
5. Create ADRs in `docs/decisions/` for significant decisions

### Phase 4: Hand off
1. Store consolidated spec in beads epic description (`bd update <epic> --description="..."`)
2. Create the beads epic with `bd create` if not already created
3. Flag open questions for the plan phase
4. Capture lessons: `npx ca learn` for novel insights

**Iteration**: If a later phase reveals gaps, loop back to the earlier phase.

See `references/spec-guide.md` for EARS patterns, Mermaid templates, ambiguity checklist, and trade-off frameworks.

## Memory Integration
- `npx ca search` and `npx ca knowledge "topic"` before generating approaches
- Look for past architectural decisions, pitfalls, and preferences
- `npx ca learn` after corrections or novel discoveries

## Docs Integration
- Spawn docs-explorer to scan `docs/` for relevant architecture docs, research, and standards
- Review existing ADRs in `docs/decisions/` -- prior decisions may constrain the spec
- Auto-create ADR for significant decisions made during specification

## Common Pitfalls
- Jumping to solutions before exploring the problem
- Skipping diagrams -- they reveal hidden assumptions, not just document decisions
- Writing vague requirements ("handle errors gracefully") instead of EARS patterns
- Not searching memory for similar past features
- Not checking existing docs and ADRs for prior decisions
- Over-specifying trivially small tasks
- Ignoring iteration signals when specifying reveals gaps
- Not creating a beads epic from conclusions (losing spec output)
- Not invoking the researcher skill when the domain requires deep investigation

## Quality Criteria
- Multiple approaches were considered (at least 2-3)
- Requirements use EARS notation (not freeform prose)
- Ambiguities detected and resolved via Socratic dialogue
- Mermaid diagrams used as thinking tools
- Memory was searched for relevant context
- Existing docs and ADRs were reviewed for prior decisions
- Trade-offs documented with rationale
- User engaged via `AskUserQuestion` at each decision point
- Spec stored in beads epic description
- ADRs created for significant architectural decisions
- Open questions flagged for the plan phase

