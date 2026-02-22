You are about to conduct deep, PhD-level research to build world-class knowledge for the compound agent's working subagents.

## Context Gathering

1. Read the researcher skill at `.claude/skills/compound/researcher/SKILL.md` — this defines the research methodology and output format.
2. Check current beads work:
   - Run `bd list --status=open` and `bd list --status=in_progress` to understand active epics and tasks.
   - If the user provided arguments (e.g., a focus area or epic ID), use those to narrow scope.
   - If no args, analyze all open epics to determine what knowledge gaps exist.
3. Search existing knowledge:
   - Run `npx ca knowledge "relevant terms"` to check what the knowledge base already covers.
   - Run `npx ca search "relevant terms"` to check lessons for relevant past experience.

## Topic Identification

Based on the beads context (or user args), determine which PhD-level research topics would most benefit the working agents. Consider:

- **What phases will the epic work involve?** (review, compound, TDD, etc.)
- **What domain knowledge do the subagents need?** (security review methodology, property-based testing theory, etc.)
- **What knowledge gaps exist?** Compare needed knowledge vs. what's already in `docs/`.

For each proposed topic, define:
- **Title**: Clear, specific research question
- **Rationale**: Why this PhD would help the agents execute better
- **Target audience**: Which skills/agents would consume this research
- **Estimated scope**: Narrow (focused survey) or broad (comprehensive landscape)

## Gap Analysis

Before proposing topics, scan ALL of `docs/` for existing coverage:
- `docs/research/` — existing research documents (dev repo) / `docs/compound/research/` (consumer repos)
- `docs/standards/` — coding standards that may already cover the topic
- `docs/adr/` — architecture decisions with rationale
- `docs/invariants/` — formal invariants that document domain knowledge
- `docs/verification/` — review pipeline documentation
- `docs/specs/` — feature specifications

Flag any topic where existing docs already provide sufficient coverage. Only propose research for genuine gaps.

## User Confirmation

Present your proposed PhD topics to the user using AskUserQuestion:
- Show each topic with title, rationale, and target audience
- Indicate which existing docs partially cover the topic (if any)
- Let the user select which topics to research (multiSelect)
- Accept user modifications or additions

**Do NOT proceed to research without user confirmation.**

## Research Execution

For each confirmed topic, spawn a parallel research subagent:
- Use `subagent_type: "research-specialist"` with the Task tool
- Each subagent follows the researcher skill methodology:
  1. Web search for academic papers, blog posts, benchmarks, tools
  2. Scan existing `docs/` for prior knowledge
  3. Synthesize into the research template format (see researcher SKILL.md)
- Store output at `docs/research/<general-topic>/<specific-slug>.md`
- Create the topic subdirectory if it doesn't exist

**Run research subagents in parallel** for maximum efficiency.

## Post-Research

After all research subagents complete:
1. Update the research index with the new documents
2. Run `npx ca learn` to capture key meta-insights about the research process (if any)
3. Summarize findings to the user: what was produced, where it's stored, key takeaways
