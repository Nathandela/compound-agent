---
name: compound-compound
description: Reflect on the cycle and capture high-quality lessons for future sessions
---

# Compound Skill

## Overview
Extract and store lessons learned during the cycle, and update project documentation. This is what makes the system compound -- each session leaves the next one better equipped.

**CRITICAL**: Store all lessons via `npx ca learn` -- NOT via MEMORY.md, NOT via markdown files.
Lessons go to `.claude/lessons/index.jsonl` through the CLI. MEMORY.md is a different system and MUST NOT be used for compounding.

## Methodology
1. Review what happened during this cycle (git diff, test results, plan context)
2. Detect spec drift: compare final implementation against original EARS requirements in the epic description (`bd show <epic>`). Note any divergences -- what changed, why, was it justified. If drift reveals a spec was wrong or incomplete, flag that for lesson extraction.
3. Spawn the analysis pipeline in an **AgentTeam** (TeamCreate + Task with `team_name`):
   - Role skills: `.claude/skills/compound/agents/{context-analyzer,lesson-extractor,pattern-matcher,solution-writer,compounding}/SKILL.md`
   - For large diffs, deploy MULTIPLE context-analyzers and lesson-extractors
   - Pipeline: context-analyzers -> lesson-extractors -> pattern-matcher + solution-writer -> compounding
   - Agents coordinate via SendMessage throughout the pipeline
4. Agents pass results through the pipeline via `SendMessage`. The lead coordinates: context-analyzer and lesson-extractor feed pattern-matcher and solution-writer, which feed compounding.
5. Apply quality filters: novelty check (>0.98 cosine similarity = skip), specificity check
6. Classify each item by type: lesson, solution, pattern, or preference
7. Classify severity: high (data loss/security/contradictions), medium (workflow/patterns), low (style/optimizations)
8. Store via `npx ca learn` with supersedes/related links where applicable.
   At minimum, capture 1 lesson per significant decision made during this cycle
9. Delegate to the `compounding` subagent to run synthesis: cluster accumulated lessons by similarity and write CCT patterns to `.claude/lessons/cct-patterns.jsonl`
10. Update outdated docs and deprecate superseded ADRs (set status to `deprecated`)
11. Use `AskUserQuestion` to confirm high-severity items with the user before storing; medium/low items are auto-stored

## Docs Integration
- docs-reviewer checks if `docs/` content is outdated after the cycle
- Check `docs/decisions/` for ADRs contradicted by the work done
- Set ADR status to `deprecated` if a decision was reversed, referencing the new ADR

## Literature
- Consult `docs/compound/research/learning-systems/` for knowledge compounding theory, spaced repetition, and lesson extraction methodology
- Run `npx ca knowledge "knowledge compounding"` for indexed knowledge on learning systems
- Run `npx ca search "compound"` for lessons from past compounding cycles

## Common Pitfalls
- Not spawning the analysis team (analyzing solo misses cross-cutting patterns)
- Capturing without checking for duplicates via `npx ca search`
- Skipping supersedes/related linking when an item updates prior knowledge
- Not checking if docs or ADRs need updating after the cycle
- Requiring user confirmation for every item (only high-severity needs it)
- Not classifying items by type (lesson/solution/pattern/preference)
- Capturing vague lessons ("be careful with X") -- be specific and concrete

## Quality Criteria
- Analysis team was spawned and agents coordinated via pipeline
- Quality filters applied (novelty + specificity)
- Duplicates checked via `npx ca search` before capture
- Items classified by type (lesson/solution/pattern/preference)
- Supersedes/related links set where applicable
- Outdated docs and ADRs were updated or deprecated
- User confirmed high-severity items
- Beads checked for related issues (`bd`)
- Each item gives clear, concrete guidance for future sessions
- Spec drift analyzed and captured

## FINAL GATE -- EPIC CLOSURE
Before closing the epic:
- Run `npx ca verify-gates <epic-id>` -- must return PASS for both gates
- Run `pnpm test` and `pnpm lint` -- must pass
If verify-gates fails, the missing phase was SKIPPED. Go back and complete it.
CRITICAL: 3/5 phases is NOT success. All 5 phases are required.

