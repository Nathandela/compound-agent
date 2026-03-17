/* eslint-disable max-lines -- template data file; each skill is a multiline string constant */
/**
 * Phase skill SKILL.md templates for compound workflow phases.
 * Written to .claude/skills/compound/<phase>/SKILL.md during setup.
 */

// ANSI color codes for cook-it banner
const cn = '\x1b[36m'; // cyan — network nodes/edges
const rs = '\x1b[0m';  // reset

export const PHASE_SKILLS: Record<string, string> = {
  'spec-dev': `---
name: Spec Dev
description: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams
---

# Spec Dev Skill

## Overview
Develop unambiguous, testable specifications before implementation. Structured 4-phase process producing EARS-notation requirements, architecture diagrams, and a beads epic.

Scale formality to risk: skip for trivial (<1h), lightweight (EARS + epic) for small, full 4-phase for medium+. Use \`AskUserQuestion\` early to gauge scope.

## Methodology: 4-Phase Spec Development

### Phase 1: Explore
**Goal**: Map the problem domain before narrowing.
1. Ask "why" before "how" -- understand the real need
2. Search memory: \`npx ca search\` for past features, constraints, decisions
3. Search knowledge: \`npx ca knowledge "relevant terms"\`
4. Spawn subagents for research (\`.claude/agents/compound/repo-analyst.md\`, \`memory-analyst.md\`, or \`subagent_type: Explore\`)
5. For deep domain knowledge, consider \`/get-a-phd\`
6. Build a discovery mindmap (Mermaid \`mindmap\`) -- makes implicit assumptions visible
7. Use \`AskUserQuestion\` to clarify scope and preferences
8. **Validate assumptions** about library capabilities, API availability, and tooling compatibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If research reveals the problem is fundamentally different, restart Explore.

### Phase 2: Understand
**Goal**: Crystallize requirements through Socratic dialogue.
1. For each capability, ask: triggers? edge cases? constraints? acceptance criteria?
2. Use Mermaid diagrams (\`sequenceDiagram\`, \`stateDiagram-v2\`) to expose hidden structure
3. Detect ambiguities: vague adjectives, unclear pronouns, passive voice, compound requirements. See \`references/spec-guide.md\` for full checklist
4. Build a domain glossary for ambiguous terms
5. **Change volatility**: rate stable/moderate/high. Flag high-volatility for modularity investment.
6. **Cynefin classify** each requirement: Clear/Complicated/Complex. Complex needs safe-to-fail experiments, not just analysis.
7. For composed systems, add **composition EARS**: \`When <A> times out, <B> shall...\`, \`If <A> retries, <B> shall...\`
8. Use \`AskUserQuestion\` to resolve each ambiguity
9. **Validate assumptions** about edge case behavior, integration compatibility, and constraint feasibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If specifying reveals missing knowledge, loop back to Explore.

### Phase 3: Specify
**Goal**: Produce formal, testable requirements.
1. Write each requirement using **EARS notation** (Ubiquitous, Event-driven, State-driven, Unwanted behavior, Optional -- see \`references/spec-guide.md\` for templates and ordering)
2. Verify each requirement: no vague adjectives, edge cases covered, quantities specified, testable
3. Document trade-offs when requirements conflict (see \`references/spec-guide.md\`)
4. Produce architecture diagrams (\`erDiagram\`, \`C4Context\`, \`flowchart\`)
5. Create ADRs in \`docs/decisions/\` for significant decisions
6. **Generate scenario table** from EARS requirements and Mermaid diagrams. Cover \`happy\`, \`error\`, \`boundary\`, \`combinatorial\`, and \`adversarial\` categories. Use sequential IDs (S1, S2...):

   | ID | Source | Category | Precondition | Trigger | Expected Outcome |
   |----|--------|----------|--------------|---------|------------------|
7. **Validate assumptions** about performance bounds and architecture feasibility using the Hypothesis Validation Protocol below

**Iteration trigger**: If contradictions or gaps emerge, loop back to Understand.

### Phase 4: Hand off
1. Create beads epic if needed (\`bd create --title="..." --type=epic --priority=<N>\`)
2. Store spec in the epic description (\`bd update <epic-id> --description="..."\`) -- single source of truth, including both EARS requirements and scenario table
3. Flag open questions for plan phase
4. Capture lessons: \`npx ca learn\`

## Memory Integration
- \`npx ca search\` and \`npx ca knowledge\` before generating approaches
- \`npx ca learn\` after corrections or discoveries

## Reference Material
Read \`references/spec-guide.md\` on demand for EARS patterns, Mermaid templates, and ambiguity checklists.

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
- [ ] Memory searched (\`npx ca search\`)
- [ ] Trade-offs documented with rationale
- [ ] User engaged via \`AskUserQuestion\` at decisions
- [ ] Scenario table generated from EARS requirements and diagrams
- [ ] Spec and scenario table stored in beads epic description
- [ ] ADRs created for significant decisions
- [ ] Cynefin classification applied, volatility assessed
- [ ] Technical assumptions validated with executable probes where feasible
`,

  plan: `---
name: Plan
description: Decompose work into small testable tasks with clear dependencies
---

# Plan Skill

## Overview
Create a concrete implementation plan by decomposing work into small, testable tasks with dependencies and acceptance criteria.

## Methodology
1. Read the spec from the epic description (\`bd show <epic>\`) for EARS requirements, decisions, and open questions. Verify its type is \`epic\` -- if it was created as \`task\`, fix with \`bd update <id> --type=epic\`
2. Search memory with \`npx ca search\` and docs with \`npx ca knowledge "relevant topic"\` for architectural patterns and past mistakes
3. Spawn **subagents** via Task tool in parallel for research (lightweight, no inter-agent coordination):
   - Available agents: \`.claude/agents/compound/repo-analyst.md\`, \`memory-analyst.md\`
   - For complex features, deploy MULTIPLE analysts per domain area
   - Synthesize all findings before decomposing into tasks
4. For decisions requiring deep technical grounding, invoke the **researcher skill** to produce a survey document. Review findings before decomposing into tasks.
5. Synthesize research findings into a coherent approach. Flag conflicts between ADRs and proposed plan.
6. Use \`AskUserQuestion\` to resolve ambiguities, conflicting constraints, or priority trade-offs before decomposing
7. Decompose into tasks small enough to verify individually
8. **Boundary stability check**: verify each task stays within its epic's scope boundary. If a task crosses epic boundaries, split it or expand scope.
9. **Last Responsible Moment**: for each task, assess if it can be deferred for information gain. Mark deferrable tasks with rationale: "defer until <milestone> because <information needed>".
10. **Change coupling check**: if files A and B change together >50% of the time (git log), they should be in the same task, not separate ones.
11. Define acceptance criteria for each task
12. Ensure each task traces back to a spec requirement for traceability
13. Map dependencies between tasks
14. Create beads issues: \`bd create --title="..." --type=task\`
15. Create review and compound blocking tasks (\`bd create\` + \`bd dep add\`) that depend on work tasks — these survive compaction and surface via \`bd ready\` after work completes

## Memory Integration
- Run \`npx ca search\` and \`npx ca knowledge "relevant topic"\` for patterns related to the feature area
- Look for past planning mistakes (missing dependencies, unclear criteria)
- Check for preferred architectural patterns in this codebase

## Docs Integration
- Spawn docs-analyst to scan \`docs/\` for relevant specs, standards, and research
- Check \`docs/decisions/\` for existing ADRs that constrain or inform the plan
- If the plan contradicts an ADR, flag it for the user before proceeding

## Common Pitfalls
- Creating too many fine-grained tasks (aim for 3-7 per feature)
- Unclear acceptance criteria ("make it work" is not a criterion)
- Missing dependencies between tasks
- Not checking memory for past architectural decisions
- Not reviewing existing ADRs and docs for constraints
- Making architectural decisions without research backing (use the researcher skill for complex domains)
- Planning implementation details too early (stay at task level)
- Not checking tasks against epic boundaries (boundary drift)
- Splitting change-coupled files into separate tasks

## Quality Criteria
- Each task has clear acceptance criteria
- Dependencies are mapped and no circular dependencies exist
- Tasks are ordered so each can be verified independently
- Memory was searched for relevant patterns and past mistakes
- Existing docs and ADRs were checked for constraints
- Ambiguities resolved via \`AskUserQuestion\` before decomposing
- Complexity estimates are realistic (no "should be quick")
- Each task traces back to a spec requirement
- Tasks respect epic scope boundaries (no cross-boundary work)
- Change-coupled files grouped together

## POST-PLAN VERIFICATION -- MANDATORY
After creating all tasks, verify review and compound tasks exist:
- Run \`bd list --status=open\` and check for a "Review:" task and a "Compound:" task
- If either is missing, CREATE THEM NOW. The plan is NOT complete without these gates.
`,

  work: `---
name: Work
description: Team-based TDD execution with adaptive complexity and agent delegation
---

# Work Skill

## Overview
Execute implementation through an AgentTeam using adaptive TDD. The lead coordinates and delegates -- agents write code.

## Methodology
1. Pick tasks from \`bd ready\` or \`$ARGUMENTS\`
2. Mark tasks in progress: \`bd update <id> --status=in_progress\`
3. Read the epic description (\`bd show <epic>\`) for spec context -- EARS requirements guide what "done" looks like
4. Run \`npx ca search\` per agent/subtask for targeted context. Display results.
5. Assess parallelization: identify independent tasks that can be worked simultaneously
6. Deploy an **AgentTeam** (TeamCreate + Task with \`team_name\`) with MULTIPLE test-writers and implementers:
   - Role skills: \`.claude/skills/compound/agents/{test-writer,implementer}/SKILL.md\`
   - Scale teammate count to independent tasks; pairs coordinate via SendMessage on shared interfaces
7. Agents communicate via SendMessage when working on overlapping areas.
8. Lead coordinates: review agent outputs, resolve conflicts, verify tests pass. Do not write code directly.
9. If implementation diverges from spec requirements, stop and discuss with user via AskUserQuestion before proceeding.
10. If blocked, use AskUserQuestion to get user direction.
11. Shut down the team when done: send shutdown_request to all teammates.
12. Commit incrementally as tests pass.
13. Run full test suite for regressions.
14. Close tasks: \`bd close <id>\`

## Memory Integration
- Run \`npx ca search\` per delegated subtask with the subtask's specific description
- Each agent receives memory items tailored to their assigned task, not a shared blob
- Run \`npx ca learn\` after corrections or novel discoveries

## MANDATORY VERIFICATION -- DO NOT CLOSE TASK WITHOUT THIS
Before \`bd close\`, you MUST:
1. Run \`pnpm test\` then \`pnpm lint\` (quality gates)
2. Run \`/implementation-reviewer\` on changed code -- wait for APPROVED
If REJECTED: fix ALL issues, re-run tests, resubmit. INVIOLABLE per CLAUDE.md.

The full 8-step pipeline (invariant-designer through implementation-reviewer) is recommended
for complex changes. For all changes, \`/implementation-reviewer\` is the minimum required gate.

## Beads Lifecycle
- \`bd ready\` to find available tasks
- \`bd update <id> --status=in_progress\` when starting
- \`bd close <id>\` when all tests pass

## Parallelization Strategy
- **Always prefer parallel work**: independent tasks should be assigned to different teammate pairs simultaneously
- **Scale the team adaptively**: deploy multiple test-writer + implementer pairs proportional to independent task count
- **Subagent spawning within teammates**: each teammate should spawn opus subagents for independent subtasks (e.g., a test-writer spawning subagents to write tests for multiple modules in parallel)
- **Coordinate on shared interfaces**: teammates working on overlapping APIs must communicate via SendMessage before implementing

## Literature
- Consult \`docs/compound/research/tdd/\` for TDD methodology, test-first development evidence, and best practices
- Consult \`docs/compound/research/property-testing/\` for property-based testing theory and invariant design
- Run \`npx ca knowledge "TDD test-first"\` for indexed knowledge on testing methodology
- Run \`npx ca search "testing"\` for lessons from past TDD cycles

## Technical Debt Protocol
When shortcuts are proposed, classify using Fowler's quadrant: only **Prudent/Deliberate** debt is rational (conscious choice, known trade-off, explicit repayment plan). Reckless or Inadvertent debt must be fixed immediately. Document debt decisions in epic notes.

## Composition Boundary Verification
If work touches a composition boundary (inter-epic or inter-service interface):
- Verify implementation matches the interface contracts (explicit + implicit) from architect phase
- Write tests for implicit contracts: timeout interactions, retry behavior, backpressure
- Check for metastable failure risk: feedback loops (retry amplification, cache storms)

## Common Pitfalls
- Lead writing code instead of delegating to agents
- Not injecting memory context into agent prompts
- Modifying tests to make them pass instead of fixing implementation
- Not running the full test suite after agent work completes
- Accumulating reckless/inadvertent tech debt without classification

## Quality Criteria
- Tests existed before implementation code
- Agents received relevant memory context
- Lead coordinated without writing implementation code
- Incremental commits made as tests pass
- All tests pass after refactoring
- Task lifecycle tracked via beads (\`bd\`)
- Implementation aligns with spec requirements from epic
- Technical debt classified (only Prudent/Deliberate accepted)
- Composition boundaries verified against interface contracts

## PHASE GATE 3 -- MANDATORY
Before starting Review, verify ALL work tasks are closed:
- \`bd list --status=in_progress\` must return empty
- \`bd list --status=open\` should only have Review and Compound tasks remaining
If any work tasks remain open, DO NOT proceed. Complete them first.
`,

  review: `---
name: Review
description: Multi-agent review with parallel specialized reviewers and severity classification
---

# Review Skill

## Overview
Perform thorough code review by spawning specialized reviewers in parallel, consolidating findings with severity classification (P0/P1/P2/P3), and gating completion on implementation-reviewer approval.

## Methodology
1. Run quality gates first: \`pnpm test && pnpm lint\`
2. Read the epic description (\`bd show <epic>\`) for EARS requirements -- reviewers verify each requirement is met
3. Search memory with \`npx ca search\` for known patterns and recurring issues
4. Select reviewer tier based on diff size:
   - **Small** (<100 lines): 4 core -- security, test-coverage, simplicity, cct-reviewer
   - **Medium** (100-500): add architecture, performance, edge-case, scenario-coverage (8 total)
   - **Large** (500+): all 12+ reviewers including docs, consistency, error-handling, pattern-matcher
   - **Composition changes**: add boundary-reviewer (coupling within epic boundaries?), control-structure-reviewer (STPA mitigations implemented?), observability-reviewer (metrics at boundaries?)
5. Spawn reviewers in an **AgentTeam** (TeamCreate + Task with \`team_name\`):
   - Role skills: \`.claude/skills/compound/agents/{security-reviewer,architecture-reviewer,performance-reviewer,test-coverage-reviewer,simplicity-reviewer,scenario-coverage-reviewer}/SKILL.md\`
   - Security specialist skills (on-demand, spawned by security-reviewer): \`.claude/skills/compound/agents/{security-injection,security-secrets,security-auth,security-data,security-deps}/SKILL.md\`
   - For large diffs (500+), deploy MULTIPLE instances; split files across instances, coordinate via SendMessage
6. Reviewers communicate findings to each other via \`SendMessage\`
7. Collect, consolidate, and deduplicate all findings
8. Classify by severity: P0 (blocks merge), P1 (critical/blocking), P2 (important), P3 (minor)
9. Use \`AskUserQuestion\` when severity is ambiguous or fix has multiple valid options
10. Create beads issues for P1 findings: \`bd create --title="P1: ..."\`
11. Verify spec alignment: flag unmet EARS requirements as P1. Verify assumptions from architect phase still hold. Check change coupling: do modified files cluster within epic boundaries or leak across?
12. Fix all P1 findings before proceeding
13. Run \`/implementation-reviewer\` as mandatory gate
14. Capture novel findings with \`npx ca learn\`; pattern-matcher auto-reinforces recurring issues

## Memory Integration
- Run \`npx ca search\` before review for known recurring issues
- **pattern-matcher** auto-reinforces: recurring findings get severity increased via \`npx ca learn\`
- **cct-reviewer** reads CCT patterns for known Claude failure patterns
- Capture the review report via \`npx ca learn\` with \`type=solution\`

## Docs Integration
- **docs-reviewer** checks code/docs alignment and ADR compliance
- Flags undocumented public APIs and ADR violations

## Literature
- Consult \`docs/compound/research/code-review/\` for systematic review methodology, severity taxonomies, and evidence-based review practices
- Run \`npx ca knowledge "code review methodology"\` for indexed knowledge on review techniques
- Run \`npx ca search "review"\` for lessons from past review cycles

## Common Pitfalls
- Ignoring reviewer feedback because "it works"
- Not running all 12 reviewer perspectives (skipping dimensions)
- Treating all findings as equal priority (classify P1/P2/P3 first)
- Not creating beads issues for deferred fixes
- Skipping quality gates before review
- Bypassing the implementation-reviewer gate
- Not checking CCT patterns for known Claude mistakes
- Not verifying architect assumptions still hold after implementation

## Quality Criteria
- All quality gates pass (\`pnpm test\`, lint)
- All 12 reviewer perspectives were applied in parallel
- Findings are classified P0/P1/P2/P3 and deduplicated
- pattern-matcher checked memory and reinforced recurring issues
- cct-reviewer checked against known Claude failure patterns
- docs-reviewer confirmed docs/ADR alignment
- security-reviewer P0 findings: none (blocks merge)
- security-reviewer P1 findings: all acknowledged or resolved
- All P1 findings fixed before \`/implementation-reviewer\` approval
- All spec requirements verified against implementation
- scenario-coverage-reviewer verified scenario table coverage (medium+ diffs)
- \`/implementation-reviewer\` approved as mandatory gate

## PHASE GATE 4 -- MANDATORY
Before starting Compound, verify review is complete:
- \`/implementation-reviewer\` must have returned APPROVED
- All P1 findings must be resolved

**CRITICAL**: Use \`npx ca learn\` for ALL lesson storage -- NOT MEMORY.md.
`,

  compound: `---
name: Compound
description: Reflect on the cycle and capture high-quality lessons for future sessions
---

# Compound Skill

## Overview
Extract and store lessons learned during the cycle, and update project documentation. This is what makes the system compound -- each session leaves the next one better equipped.

**CRITICAL**: Store all lessons via \`npx ca learn\` -- NOT via MEMORY.md, NOT via markdown files.
Lessons go to \`.claude/lessons/index.jsonl\` through the CLI. MEMORY.md is a different system and MUST NOT be used for compounding.

## Methodology
1. Review what happened during this cycle (git diff, test results, plan context)
2. Detect spec drift: compare final implementation against original EARS requirements in the epic description (\`bd show <epic>\`). Note any divergences -- what changed, why, was it justified. If drift reveals a spec was wrong or incomplete, flag that for lesson extraction.
3. **Decomposition quality assessment**: compare actual implementation against predicted boundaries from architect. Did files cluster as predicted? Were assumptions valid? Rate boundary quality: "This boundary [succeeded/failed] because..." Capture as lesson for future architect runs.
4. **Assumption tracking**: for each assumption from architect phase, record predicted vs actual volatility. Store with \`npx ca learn\` for calibration.
5. **Emergence analysis**: if unexpected system behaviors occurred, classify root cause: incomplete interface contract (Garlan), control structure inadequacy (STPA), or scale-induced phase transition. Capture preventive lesson.
3. Spawn the analysis pipeline in an **AgentTeam** (TeamCreate + Task with \`team_name\`):
   - Role skills: \`.claude/skills/compound/agents/{context-analyzer,lesson-extractor,pattern-matcher,solution-writer,compounding}/SKILL.md\`
   - For large diffs, deploy MULTIPLE context-analyzers and lesson-extractors
   - Pipeline: context-analyzers -> lesson-extractors -> pattern-matcher + solution-writer -> compounding
   - Agents coordinate via SendMessage throughout the pipeline
4. Agents pass results through the pipeline via \`SendMessage\`. The lead coordinates: context-analyzer and lesson-extractor feed pattern-matcher and solution-writer, which feed compounding.
5. Apply quality filters: novelty check (>0.98 cosine similarity = skip), specificity check
6. Classify each item by type: lesson, solution, pattern, or preference
7. Classify severity: high (data loss/security/contradictions), medium (workflow/patterns), low (style/optimizations)
8. Store via \`npx ca learn\` with supersedes/related links where applicable.
   At minimum, capture 1 lesson per significant decision made during this cycle
9. Delegate to the \`compounding\` subagent to run synthesis: cluster accumulated lessons by similarity and write CCT patterns to \`.claude/lessons/cct-patterns.jsonl\`
10. Update outdated docs and deprecate superseded ADRs (set status to \`deprecated\`)
11. Use \`AskUserQuestion\` to confirm high-severity items with the user before storing; medium/low items are auto-stored

## Docs Integration
- docs-reviewer checks if \`docs/\` content is outdated after the cycle
- Check \`docs/decisions/\` for ADRs contradicted by the work done
- Set ADR status to \`deprecated\` if a decision was reversed, referencing the new ADR

## Literature
- Consult \`docs/compound/research/learning-systems/\` for knowledge compounding theory, spaced repetition, and lesson extraction methodology
- Run \`npx ca knowledge "knowledge compounding"\` for indexed knowledge on learning systems
- Run \`npx ca search "compound"\` for lessons from past compounding cycles

## Common Pitfalls
- Not spawning the analysis team (analyzing solo misses cross-cutting patterns)
- Capturing without checking for duplicates via \`npx ca search\`
- Skipping supersedes/related linking when an item updates prior knowledge
- Not checking if docs or ADRs need updating after the cycle
- Requiring user confirmation for every item (only high-severity needs it)
- Not classifying items by type (lesson/solution/pattern/preference)
- Capturing vague lessons ("be careful with X") -- be specific and concrete
- Not assessing decomposition boundary quality against architect predictions
- Not tracking assumption accuracy for future calibration

## Quality Criteria
- Analysis team was spawned and agents coordinated via pipeline
- Quality filters applied (novelty + specificity)
- Duplicates checked via \`npx ca search\` before capture
- Items classified by type (lesson/solution/pattern/preference)
- Supersedes/related links set where applicable
- Outdated docs and ADRs were updated or deprecated
- User confirmed high-severity items
- Beads checked for related issues (\`bd\`)
- Each item gives clear, concrete guidance for future sessions
- Spec drift analyzed and captured
- Decomposition boundary quality assessed
- Architect assumptions tracked (predicted vs actual)
- Emergent failures classified by root cause if any occurred

## FINAL GATE -- EPIC CLOSURE
Before closing the epic:
- Run \`npx ca verify-gates <epic-id>\` -- must return PASS for both gates
- Run \`pnpm test\` and \`pnpm lint\` -- must pass
If verify-gates fails, the missing phase was SKIPPED. Go back and complete it.
CRITICAL: 3/5 phases is NOT success. All 5 phases are required.
`,

  researcher: `---
name: Researcher
description: Deep research producing structured survey documents for informed decision-making
---

# Researcher Skill

## Overview
Conduct deep research on a topic and produce a structured survey document following the project's research template. This skill spawns parallel research subagents to gather comprehensive information, then synthesizes findings into a PhD-depth document stored in \`docs/research/\`.

## Methodology
1. Identify the research question, scope, and exclusions
2. Search memory with \`npx ca search\` for existing knowledge on the topic
3. Spawn parallel research subagents via Task tool:
   - **Web search specialist**: Uses WebSearch/WebFetch for academic papers, blog posts, benchmarks, and tools
   - **Codebase explorer**: Uses \`subagent_type: Explore\` to find relevant existing code patterns
   - **Docs scanner**: Reads \`docs/\` for prior research, ADRs, and standards that inform the topic
4. Collect and deduplicate findings from all subagents
5. Synthesize into TEMPLATE_FOR_RESEARCH.md format:
   - Abstract (2-3 paragraphs)
   - Introduction (problem statement, scope, definitions)
   - Foundations (theoretical background)
   - Taxonomy of Approaches (classification framework, visual table/tree)
   - Analysis (one subsection per approach with theory, evidence, implementations, strengths/limitations)
   - Comparative Synthesis (cross-cutting trade-off table)
   - Open Problems & Gaps
   - Conclusion
   - References (full citations)
   - Practitioner Resources (annotated tools/repos)
6. Store output at \`docs/research/<topic-slug>.md\` (kebab-case filename)
7. Report key findings back for upstream skill (spec-dev/plan) to act on

## Memory Integration
- Run \`npx ca search\` with topic keywords before starting research
- Check for existing research docs in \`docs/research/\` and \`docs/compound/research/\` that overlap
- After completion, key findings can be captured via \`npx ca learn\`

## Docs Integration
- Scan \`docs/research/\` and \`docs/compound/research/\` for prior survey documents on related topics
- Check \`docs/decisions/\` for ADRs that inform or constrain the research scope
- Reference existing project docs as primary sources where relevant

## Output Format

Every research document MUST follow this exact structure:

# [Topic Title]

*[Date]*

## Abstract
2-3 paragraph summary: what this survey covers, main approaches, key trade-offs.

## 1. Introduction
- Problem statement
- Scope: covered and excluded
- Key definitions

## 2. Foundations
Theoretical background. Assume technical reader, not domain specialist.

## 3. Taxonomy of Approaches
Classification framework. Present visually (table or tree) before details.

## 4. Analysis
One subsection per approach:
### 4.x [Approach Name]
- **Theory & mechanism**
- **Literature evidence**
- **Implementations & benchmarks**
- **Strengths & limitations**

## 5. Comparative Synthesis
Cross-cutting trade-off table. No recommendations.

## 6. Open Problems & Gaps
Unsolved, under-researched, or risky areas.

## 7. Conclusion
Synthesis. No verdict.

## References
Full citations with URLs.

## Practitioner Resources
Annotated tools, repos, articles grouped by category.

## Common Pitfalls
- Shallow treatment: each approach needs theory, evidence, AND implementation examples
- Missing taxonomy: always classify approaches before diving into analysis
- Recommendation bias: present trade-offs, never recommend (ADR process decides)
- Ignoring gaps: explicitly state where evidence is thin or conflicting
- Not deduplicating subagent findings (leads to repetitive content)
- Skipping the comparative synthesis table

## Quality Criteria
- PhD academic depth (reads like a technical survey paper)
- Multiple research subagents were deployed in parallel
- Memory was searched for existing knowledge
- Existing docs/research were checked for overlap
- Every approach has: theory, evidence, implementations, strengths/limitations
- Comparative synthesis table present with clear trade-offs
- Open problems honestly identified
- Full references with URLs
- Practitioner resources annotated
- No recommendations -- landscape presentation only
`,

  'cook-it': `---
name: Cook It
description: Full-cycle orchestrator chaining all five phases with gates and controls
---

# Cook It Skill

## Overview

Chain all 5 phases end-to-end: Spec Dev, Plan, Work, Review, Compound. This skill governs the orchestration -- phase sequencing, gates, progress tracking, and error recovery.

## CRITICAL RULE -- READ BEFORE EXECUTE
Before starting EACH phase, you MUST use the Read tool to open its skill file:
- .claude/skills/compound/spec-dev/SKILL.md
- .claude/skills/compound/plan/SKILL.md
- .claude/skills/compound/work/SKILL.md
- .claude/skills/compound/review/SKILL.md
- .claude/skills/compound/compound/SKILL.md

Do NOT proceed from memory. Read the skill, then follow it exactly.

## Session Start
When a cooking session begins, IMMEDIATELY print the banner below (copy it verbatim):

${cn}         o
        /|\\
       o-o-o
      /|\\ /|\\
     o-o-o-o-o
      \\|/ \\|/
       o-o-o
        \\|/
         o${rs}

Then proceed with the protocol below.

## Phase Execution Protocol
0. Initialize state: \`npx ca phase-check init <epic-id>\`
For each phase:
1. Announce: "[Phase N/5] PHASE_NAME"
2. Start state: \`npx ca phase-check start <phase>\`
3. Read the phase skill file (see above)
4. Run \`npx ca search\` and \`npx ca knowledge\` with the current goal -- display results before proceeding
5. Execute the phase following the skill instructions
6. Update epic state: \`bd update <epic-id> --notes="Phase: NAME COMPLETE | Next: NEXT"\`
7. Verify phase gate before proceeding to the next phase

## Phase Gates (MANDATORY)
- **After Plan**: Run \`bd list --status=open\` and verify Review + Compound tasks exist, then run \`npx ca phase-check gate post-plan\`
- **After Work (GATE 3)**: \`bd list --status=in_progress\` must be empty. Then run \`npx ca phase-check gate gate-3\`
- **After Review (GATE 4)**: /implementation-reviewer must have returned APPROVED. Then run \`npx ca phase-check gate gate-4\`
- **After Compound (FINAL GATE)**: Run \`npx ca verify-gates <epic-id>\` (must PASS), \`pnpm test\`, and \`pnpm lint\`, then run \`npx ca phase-check gate final\` (auto-cleans phase state)

If a gate fails, DO NOT proceed. Fix the issue first.

## Phase Control
- **Skip phases**: Parse arguments for "from PHASE" (e.g., "from plan"). Skip earlier phases.
- **Resume**: After interruption, run \`bd show <epic-id>\` and read notes for phase state. Resume from that phase.
- **Retry**: If a phase fails, report and ask user to retry, skip, or abort via AskUserQuestion.
- **Progress**: Always announce current phase number before starting.

## Stop Conditions
- Spec dev reveals goal is unclear -- stop, ask user
- Tests produce unresolvable failures -- stop, report
- Review finds critical security issues -- stop, report

## Common Pitfalls
- Skipping the Read step for a phase skill (NON-NEGOTIABLE)
- Not running phase gates between phases
- Not announcing progress ("[Phase N/5]")
- Proceeding after a failed gate
- Not updating epic notes with phase state (loses resume ability)
- Batching all commits to the end instead of committing incrementally

## Quality Criteria
- All 5 phases were executed (3/5 is NOT success)
- Each phase skill was Read before execution
- Phase gates verified between each transition
- Epic notes updated after each phase
- Memory searched at the start of each phase
- \`npx ca verify-gates\` passed at the end

## SESSION CLOSE -- INVIOLABLE
Before saying "done": git status, git add, bd sync, git commit, bd sync, git push.
If phase state gets stuck, use the escape hatch: \`npx ca phase-check clean\` (or \`npx ca phase-clean\`).
`,

  'test-cleaner': `---
name: Test Cleaner
description: Multi-phase test suite optimization with adversarial review
---

# Test Cleaner Skill

## Overview
Analyze, optimize, and clean a project's test suite through a multi-phase workflow with adversarial review. Produces machine-readable output and feeds findings into compound-agent memory.

## Methodology

### Phase 1: Analysis
Spawn multiple analysis subagents in parallel:
- **Cargo-cult detector**: Find fake tests, mocked business logic, trivial assertions
- **Redundancy analyzer**: Identify overlapping/duplicate test coverage
- **Independence checker**: Verify tests don't depend on execution order or shared state
- **Invariant tracer**: Map which invariants each test verifies (Lamport framework)
- **Coverage analyzer**: Identify untested code paths and modules

### Phase 2: Planning
Synthesize analysis results into a refined optimization plan:
- Categorize findings by severity (P1/P2/P3)
- Propose specific changes for each finding
- Estimate impact on test suite speed and coverage
- Iterate with subagents until the plan is comprehensive

### Phase 3: Adversarial Review (CRITICAL QUALITY GATE)
**This is THE KEY PHASE -- the most important phase in the entire workflow. NEVER skip, NEVER rush, NEVER settle for "good enough."**

Expose the plan to two neutral reviewer subagents:
- **Reviewer A** (Opus): Independent critique of the optimization plan
- **Reviewer B** (Sonnet): Independent critique from a different perspective

Both reviewers challenge assumptions, identify risks, and suggest improvements.

**Mandatory iteration loop**: After each reviewer pass, if ANY issues, concerns, or suggestions remain from EITHER reviewer, revise the plan and re-submit to BOTH reviewers. Repeat until BOTH reviewers explicitly approve with ZERO reservations. Do not proceed to Phase 4 until unanimous, unconditional approval is reached.

This is the critical quality gate. Loop as many times as needed. The test suite must be bulletproof before execution begins.

### Phase 4: Execution
Apply the agreed changes:
- Machine-readable output format: \`ERROR [file:line] type: description\`
- Include \`REMEDIATION\` suggestions and \`SEE\` references
- Use \`pnpm test:segment\`, \`pnpm test:random\`, \`pnpm test:critical\` for targeted validation

### Phase 5: Verification
- Run full test suite after changes
- Compare before/after metrics (count, duration, coverage)
- Feed findings into compound-agent memory via \`npx ca learn\`

## Test Scripts Integration
- \`pnpm test:segment <module>\` -- Test specific module in isolation
- \`pnpm test:random <pct>\` -- Deterministic random subset (seeded per-agent)
- \`pnpm test:critical\` -- P1/critical tests only (fast CI feedback)

## Memory Integration
- Run \`npx ca search "test optimization"\` before starting
- After completion, capture findings via \`npx ca learn\`
- Feed patterns into CCT system for future sessions

## Common Pitfalls
- Deleting tests without verifying coverage is maintained elsewhere
- Optimizing for speed at the cost of correctness
- Settling for partial approval or cutting the Phase 3 review loop short before BOTH reviewers approve with zero reservations
- Making changes without machine-readable output
- Not feeding results back into compound-agent memory

## Quality Criteria
- All 5 phases completed (analysis, planning, review, execution, verification)
- Both adversarial reviewers approved with zero reservations after iterative refinement
- Machine-readable output format used throughout
- Full test suite passes after changes
- Coverage not degraded
- Findings captured in compound-agent memory
`,

  'agentic': `---
name: Agentic Codebase
description: Audit and set up a codebase for agentic AI development using the 15-principle manifesto
---

# Agentic Codebase Skill

## Overview

Assess and improve a codebase's readiness for AI agent collaboration. Based on the 15-principle Agentic Codebase Manifesto organized across 3 pillars.

This skill operates in two modes:
- **Mode: audit** -- Score the codebase against all 15 principles, produce a report with evidence and prioritized actions
- **Mode: setup** -- Run audit first, then incrementally fill gaps with real content generated from codebase analysis

Mode is set by the calling command (\\\`/compound:agentic-audit\\\` or \\\`/compound:agentic-setup\\\`). The command wrapper tells you which mode to run -- do not parse \\\`$ARGUMENTS\\\` for mode detection.

## Stack Detection

Before auditing, detect the project stack to adapt checks:
1. Look for package.json (Node/TS), pyproject.toml or setup.py (Python), Cargo.toml (Rust), go.mod (Go), Makefile, CMakeLists.txt (C/C++)
2. Check for framework markers: next.config, django, fastapi, express, etc.
3. Identify build/test/lint commands from config files
4. Store detected stack for use in principle checks and AGENTS.md generation

## Audit Methodology

### Scoring Rubric
Each principle is scored:
- **0 (Absent)**: No evidence of this principle in the codebase
- **1 (Partial)**: Some evidence but incomplete or inconsistent
- **2 (Present)**: Clear, consistent implementation

Adapt criteria to the detected stack. For example: "strict mode" means TypeScript strict, Python mypy --strict, or Rust default safety. "Linter" means ESLint, pylint/ruff, clippy, golangci-lint, etc. Score based on the ecosystem's equivalent tooling.

### The 15 Principles

#### Pillar I: Codebase Memory (Traceability) -- max 8 points

**P1. Repository is the only truth**
Check: All context an agent needs lives in version control
Evidence: Look for docs/ directory, inline documentation, config files
Score 0: No docs directory, no README beyond boilerplate
Score 1: README exists but key context lives elsewhere
Score 2: Comprehensive docs/, config, and context all in-repo

**P2. Trace decisions, not just outcomes**
Check: Architectural decisions have recorded rationale
Evidence: Look for docs/adr/, docs/decisions/, ADR files
Score 0: No decision records
Score 1: Some decisions documented but inconsistent format
Score 2: ADR directory with structured records

**P3. Never answer the same question twice**
Check: Solutions/fixes are documented to prevent rediscovery
Evidence: Solutions docs, post-mortems, troubleshooting guides, or a memory system
Score 0: No solutions documentation
Score 1: Scattered notes but no systematic approach
Score 2: Structured solutions docs or integrated memory system

**P4. Knowledge is infrastructure**
Check: Documentation is versioned alongside code
Evidence: Specs, research, standards co-located in repo
Score 0: Documentation lives outside version control
Score 1: Some docs in repo but key knowledge is external
Score 2: All project knowledge versioned in docs/

#### Pillar II: Implementation Feedbacks (Mechanical Verification) -- max 8 points

**P5. Test is specification**
Check: Tests define behavior before or alongside implementation
Evidence: Test files, coverage tooling, test-first patterns
Score 0: No tests or minimal coverage
Score 1: Tests exist but post-hoc or inconsistent
Score 2: Comprehensive test suite with test-driven patterns

**P6. Constraints are multipliers**
Check: Linters, type checkers, architectural rules configured and enforced
Evidence: ESLint/pylint/clippy config, TypeScript strict mode, CI enforcement
Score 0: No linting or type checking
Score 1: Linter exists but not enforced in CI
Score 2: Strict linting + type checking enforced in CI

**P7. Write feedback for machines**
Check: Error messages, logs, and output are structured for agent consumption
Evidence: Structured logging, clear error messages with context
Score 0: Unstructured logs, generic error messages
Score 1: Some structured logging but inconsistent
Score 2: Structured logging throughout, remediation hints in errors

**P8. Fight entropy continuously**
Check: Active maintenance processes prevent drift
Evidence: Automated formatting, dependency updates, quality monitoring
Score 0: No automated maintenance
Score 1: Basic formatting but no proactive monitoring
Score 2: Automated formatting + dependency updates + quality tracking

#### Pillar III: Mapping the Context (Navigable Structure) -- max 8 points

**P9. Map, not manual**
Check: Entry point document provides a navigable map, not an encyclopedia
Evidence: AGENTS.md, CLAUDE.md, or similar
Score 0: No agent-facing entry point document
Score 1: README exists but not optimized for agents
Score 2: Dedicated AGENTS.md or CLAUDE.md with commands, structure, conventions

**P10. Explicit over implicit, always**
Check: Types, naming, patterns are explicit
Evidence: Type annotations, consistent naming, documented conventions
Score 0: No type annotations, inconsistent naming
Score 1: Some types but gaps, or undocumented conventions
Score 2: Full type coverage, documented naming conventions

**P11. Modularity is non-negotiable**
Check: Single responsibility per file, clear boundaries
Evidence: File sizes, module organization, dependency structure
Score 0: Monolithic files (>500 LOC common), unclear boundaries
Score 1: Some modular structure but large files remain
Score 2: Consistent small files, clear APIs, enforced boundaries

**P12. Structure in layers, govern by inheritance**
Check: Layered architecture with explicit dependency rules
Evidence: Layer separation, import rules, dependency graph
Score 0: No discernible layering
Score 1: Informal layers but no enforcement
Score 2: Explicit layers with enforced dependency directions

#### Cross-Cutting -- max 6 points

**P13. Simplicity compounds**
Check: Prefer boring technologies, minimal abstractions
Evidence: Dependency count, abstraction depth
Score 0: Over-engineered with many abstractions
Score 1: Moderate complexity, some unnecessary abstractions
Score 2: Minimal dependencies, straightforward patterns

**P14. Human designs the system, not the output**
Check: Human effort in system design (tests, docs, constraints)
Evidence: Quality of test harnesses, documentation, CI/CD
Score 0: No investment in development infrastructure
Score 1: Some tooling but gaps in key areas
Score 2: Strong CI, testing framework, documentation system

**P15. Parallelize by decomposition**
Check: Work can be split into independent units
Evidence: Module independence, clear interfaces, minimal coupling
Score 0: Tightly coupled, hard to work on independently
Score 1: Some independent modules but shared state
Score 2: Well-decomposed with clear interfaces

### Audit Execution Steps

1. Run \\\`npx ca search "agentic codebase"\\\` for relevant lessons
2. Detect project stack (see Stack Detection above)
3. Use Glob and Grep to check for evidence of each principle:
   - Glob for: docs/**, *.test.*, .eslintrc*, AGENTS.md, CLAUDE.md
   - Grep for: type annotations, structured logging, ADR format
   - Read key files: README, config files, sample source files
4. Score each principle (0-2) with specific evidence
5. Aggregate scores by pillar and compute total out of 30
6. Generate prioritized actions (score-0 first, then score-1)
7. Present report to user

### Report Format

Present as markdown tables per pillar:

Pillar I: Codebase Memory -- X/8
| # | Principle | Score | Evidence |
|---|-----------|-------|----------|
| P1 | Repository is the only truth | 0/1/2 | finding |
...repeat for all pillars with separator rows...

**Overall Score: X/30**

### Priority Actions
1. [Score-0 items first, most impactful]
2. ...

After presenting, use \\\`AskUserQuestion\\\`: "Create a beads epic with issues for improvements?"
If yes, create epic via bd create and individual issues.

## Setup Methodology

### Prerequisites
Run the full audit first. Setup only addresses gaps found by the audit.

### Setup Execution Steps

1. Present audit findings summary
2. For each principle scored 0 or 1, propose a concrete action:

**P1/P4 gaps**: Create docs/ skeleton (INDEX.md, adr/, standards/) with real content from analysis
**P2 gaps**: Create ADR template and first ADR from actual architecture analysis
**P3 gaps**: Suggest solutions documentation structure
**P5 gaps**: Suggest test framework setup based on detected stack
**P6 gaps**: Suggest linter/type checker configuration for detected stack
**P7 gaps**: Suggest structured logging patterns for detected stack
**P9 gaps**: Generate AGENTS.md by analyzing actual codebase (build commands, structure, conventions)
**P10 gaps**: Suggest type annotation and strict mode settings
**P11 gaps**: Identify files >500 LOC, suggest refactoring targets
**P12 gaps**: Document layer structure and suggest import lint rules (e.g., eslint-plugin-import boundaries, Rust mod visibility)
**P13 gaps**: Flag over-abstraction (deep inheritance, excessive wrappers), suggest simplification targets
**P14 gaps**: Suggest CI pipeline improvements, test harness setup, or pre-commit hooks for detected stack
**P15 gaps**: Identify tightly coupled modules, suggest interface extraction for parallel workability
**P8 gaps**: Suggest automated formatting (prettier/black/rustfmt), dependency update tooling (renovate/dependabot), and quality monitoring

3. Before each action, use \\\`AskUserQuestion\\\`: "Create [file]? Preview: [content]"
4. Only create/modify files the user approves
5. Never overwrite existing files without explicit approval

### Setup Completion Gate
After all approved actions are applied, verify:
- List all files created/modified during setup
- Run quality gates if available (\\\`pnpm test\\\`, \\\`pnpm lint\\\`, or stack equivalent)
- Confirm no existing files were overwritten without approval
- Present summary: principles addressed, files created, remaining gaps

## Memory Integration

- Before analysis: \\\`npx ca search "agentic codebase"\\\` for relevant lessons
- After completing: offer \\\`npx ca learn\\\` to capture insights

## Common Pitfalls

- Scoring too generously without specific evidence for score 2
- Generating template content instead of analyzing the actual codebase
- Overwriting existing files without asking
- Not detecting the project stack before generating content
- Creating too many files at once instead of prioritizing
- Forgetting to offer beads epic creation after audit

## Quality Criteria

- All 15 principles assessed with specific evidence
- Scores justified with findings
- Pillar totals and overall score calculated correctly
- Actions prioritized (score-0 before score-1)
- Stack detected and checks adapted accordingly
- User consulted via AskUserQuestion at key decisions
- Memory searched before analysis
- Setup mode ran audit first
- No files overwritten without approval
- Generated content based on actual codebase analysis
`,

  'architect': `---
name: Architect
description: Decompose a large system specification into cook-it-ready epic beads via DDD bounded contexts
---

# Architect Skill

## Overview
Take a large system specification and decompose it into naturally-scoped epic beads that the infinity loop can process via cook-it. Each output epic is sized for one cook-it cycle.

4 phases with 3 human gates. Runs BEFORE spec-dev -- each decomposed epic then goes through full cook-it (including spec-dev to refine its EARS subset).

## Input
- Beads epic ID: read epic description as input
- File path: read markdown file as input
- Neither: use \`AskUserQuestion\` to gather the system description

## Phase 1: Socratic
**Goal**: Understand the system domain before decomposing.
1. Search memory: \`npx ca search\` for past features, constraints, decisions
2. Search knowledge: \`npx ca knowledge "relevant terms"\`
3. Ask "why" before "how" -- understand the real need
4. Build a **domain glossary** (ubiquitous language) from the dialogue
5. Produce a **discovery mindmap** (Mermaid \`mindmap\`) to expose assumptions
6. **Reversibility analysis**: classify decisions as irreversible (schema, public API, service boundary), moderate (framework), or reversible (library, config). Spend effort proportional to irreversibility.
7. **Change volatility**: rate each boundary stable/moderate/high. High-volatility justifies modularity investment.
8. Use \`AskUserQuestion\` to clarify scope and preferences

**Gate 1**: Use \`AskUserQuestion\` to confirm the understanding is complete before proceeding to Spec.

## Phase 2: Spec
**Goal**: Produce a system-level specification.
1. Write **system-level EARS requirements** (Ubiquitous/Event/State/Unwanted/Optional patterns)
2. Produce **architecture diagrams**: C4Context, sequenceDiagram, stateDiagram-v2
3. Generate a **scenario table** from the EARS requirements
4. Write the spec to \`docs/specs/<name>.md\` and create a **meta-epic bead**

**Gate 2**: Use \`AskUserQuestion\` to get human approval of the system-level spec.

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

**Gate 3**: Use \`AskUserQuestion\` to get human approval of the epic structure, dependency graph, and interface contracts.

## Phase 4: Materialize
**Goal**: Create the actual beads.
1. Create epic beads via \`bd create --title="..." --type=epic --priority=<N>\` for each approved epic
2. Store scope, EARS subset, interface contracts (explicit + implicit), and key assumptions in each epic description
3. Define **fitness functions** per epic to monitor assumptions. Document re-decomposition trigger.
4. Wire dependencies via \`bd dep add\` for all relationships
5. Store processing order as notes on the meta-epic
6. Capture lessons via \`npx ca learn\`

## Memory Integration
- \`npx ca search\` before starting each phase
- \`npx ca knowledge\` for indexed project docs
- \`npx ca learn\` after corrections or discoveries

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
`,
};

/**
 * Reference files for phase skills.
 * Map: "phase/relative-path" -> content
 * Installed alongside PHASE_SKILLS by installPhaseSkills().
 */
export const PHASE_SKILL_REFERENCES: Record<string, string> = {
  'spec-dev/references/spec-guide.md': `# Spec Dev Quick Reference

## EARS Notation Patterns

EARS (Easy Approach to Requirements Syntax) provides five sentence templates:

| Pattern | Template | Example |
|---------|----------|---------|
| **Ubiquitous** | The system shall \`<action>\`. | The system shall validate all inputs. |
| **Event-driven** | When \`<trigger>\`, the system shall \`<action>\`. | When the user submits the form, the system shall validate all fields. |
| **State-driven** | While \`<state>\`, the system shall \`<action>\`. | While the system is in maintenance mode, the system shall reject new connections. |
| **Unwanted behavior** | If \`<condition>\`, then the system shall \`<action>\`. | If the database connection fails, then the system shall retry with exponential backoff. |
| **Optional** | Where \`<feature>\`, the system shall \`<action>\`. | Where SSO is enabled, the system shall redirect to the identity provider. |

**Combined ordering**: Where > While > When > If/then > shall

### Quality Checks for Each Requirement
- [ ] Uses one of the five EARS patterns
- [ ] No vague adjectives (fast, efficient, user-friendly, easy)
- [ ] Quantities specified where applicable (timeouts, limits, thresholds)
- [ ] Edge cases addressed (empty input, max values, concurrent access)
- [ ] Testable — can write a pass/fail test against it
- [ ] Single responsibility — one requirement per sentence

---

## Mermaid Diagram Selection Guide

| Diagram Type | Use When | Syntax |
|-------------|----------|--------|
| \`mindmap\` | Exploring problem domain, brainstorming | Phase 1 (Explore) |
| \`sequenceDiagram\` | Showing interactions between components | Phase 2 (Understand) |
| \`stateDiagram-v2\` | Modeling lifecycle, state transitions | Phase 2 (Understand) |
| \`flowchart\` | Showing decision logic, data flow | Phase 3 (Specify) |
| \`erDiagram\` | Defining data models, relationships | Phase 3 (Specify) |
| \`C4Context\` | System-level architecture boundaries | Phase 3 (Specify) |

### When to Use Diagrams
- **Always** use a mindmap in Explore to surface hidden assumptions
- **Use sequence diagrams** when 2+ components interact
- **Use state diagrams** when an entity has a lifecycle
- **Skip diagrams** only for truly trivial features (<1h of work)

---

## NL Ambiguity Detection Checklist

Watch for these ambiguity patterns in requirements:

| Pattern | Example | Fix |
|---------|---------|-----|
| **Vague adjectives** | "fast response" | Specify: "response within 200ms" |
| **Unclear pronouns** | "it should update" | Name the subject: "the cache should update" |
| **Passive voice** | "data is validated" | Active: "the API validates data" |
| **Compound requirements** | "shall validate and log and notify" | Split into 3 separate requirements |
| **Unbounded lists** | "supports CSV, JSON, etc." | Enumerate all formats explicitly |
| **Missing quantities** | "handles large files" | Specify: "handles files up to 500MB" |
| **Implicit assumptions** | "users can access" | Specify: "authenticated users with role X can access" |
| **Temporal ambiguity** | "after processing" | Specify: "within 5s of processing completion" |

---

## Trade-off Documentation Framework

When requirements conflict, document the trade-off:

### Template
\`\`\`
### Trade-off: [Short Title]

**Tension**: [Requirement A] conflicts with [Requirement B].

**Options**:
1. [Option 1]: [Description]. Pro: [benefit]. Con: [cost].
2. [Option 2]: [Description]. Pro: [benefit]. Con: [cost].

**Decision**: [Chosen option] because [rationale].

**Consequence**: [What this means for implementation].
\`\`\`

### Common Trade-off Dimensions
- **Performance vs. Safety**: Validation adds latency
- **Flexibility vs. Simplicity**: Configuration adds complexity
- **Consistency vs. Availability**: Strict consistency limits throughput
- **Security vs. Usability**: Auth steps add friction
- **Completeness vs. Time-to-market**: More features delay delivery

### Decision Criteria
When evaluating trade-offs, consider:
1. **Reversibility**: Can we change this later? Prefer reversible decisions.
2. **Blast radius**: How many components does this affect?
3. **Evidence**: What data supports each option?
4. **Alignment**: Which option best serves the stated goal?
`,
};
