---
version: "1.7.4"
last-updated: "2026-03-11"
summary: "Phase skills and agent role skills reference"
---

# Skills Reference

Skills are instructions that Claude reads before executing each phase. They live in `.claude/skills/compound/` and are auto-installed by `ca setup`.

---

## Phase skills

### `/compound:spec-dev`

**Purpose**: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams.

**When invoked**: At the start of a new feature or epic, before any planning.

**What it does**: Guides the user through 4 phases (Explore, Understand, Specify, Hand off) to produce a rigorous spec. Spawns research subagents, uses Mermaid diagrams as thinking tools, detects NL ambiguity, writes EARS-notation requirements, and stores the consolidated spec in the beads epic description.

### `/compound:plan`

**Purpose**: Decompose work into small testable tasks with dependencies.

**When invoked**: After spec-dev, before any implementation.

**What it does**: Reviews spec-dev output, spawns analysts, decomposes into tasks with acceptance criteria, creates beads issues, and creates Review + Compound blocking tasks.

### `/compound:work`

**Purpose**: Team-based TDD execution with adaptive complexity.

**When invoked**: After plan, when tasks are ready in beads.

**What it does**: Picks tasks from `bd ready`, deploys an AgentTeam with test-writers and implementers, coordinates agent work, commits incrementally, runs `/implementation-reviewer` as mandatory gate.

### `/compound:review`

**Purpose**: Multi-agent review with parallel specialized reviewers.

**When invoked**: After all work tasks are closed.

**What it does**: Runs quality gates, selects reviewer tier based on diff size (4-11 reviewers), spawns reviewers in an AgentTeam, classifies findings by severity, fixes all P1s, runs `/implementation-reviewer`.

### `/compound:compound`

**Purpose**: Reflect on the cycle and capture lessons for future sessions.

**When invoked**: After review is approved.

**What it does**: Spawns an analysis pipeline (context-analyzer, lesson-extractor, pattern-matcher, solution-writer, compounding), applies quality filters, classifies items by type and severity, stores via `ca learn`, runs `ca verify-gates`.

### `/compound:cook-it`

**Purpose**: Full-cycle orchestrator chaining all five phases.

**When invoked**: When you want to run an entire epic end-to-end.

**What it does**: Sequences all 5 phases with mandatory gates between them, tracks progress in beads notes, handles resumption after interruption. See [WORKFLOW.md](WORKFLOW.md) for full details.

### `/compound:get-a-phd`

**Purpose**: Conduct deep, PhD-level research to build knowledge for working subagents.

**When invoked**: When agents need domain knowledge not yet covered in `docs/research/`.

**What it does**: Analyzes beads epics for knowledge gaps, checks existing docs coverage, proposes research topics for user confirmation, spawns parallel researcher subagents, and stores output at `docs/research/<topic>/<slug>.md`.

### `/compound:agentic-audit`

**Purpose**: Audit a codebase against the 15-principle Agentic Codebase Manifesto.

**When invoked**: When evaluating a codebase's readiness for AI agent collaboration.

**What it does**: Detects the project stack, scores all 15 principles (0-2) with specific evidence across 3 pillars (Codebase Memory, Implementation Feedbacks, Mapping the Context) plus cross-cutting concerns. Produces a scored report (out of 30) with prioritized actions and offers to create a beads epic for improvements.

### `/compound:agentic-setup`

**Purpose**: Set up a codebase for agentic AI development (runs audit first).

**When invoked**: When you want to improve a codebase's agentic readiness by filling gaps.

**What it does**: Runs the full audit first, then proposes concrete remediation actions for each gap found. Creates real content (AGENTS.md, docs/, ADRs, lint configs) generated from actual codebase analysis. Asks for user approval before each file creation.

---

## Skill invocation

Skills are invoked as Claude Code slash commands:

```
/compound:spec-dev         # Start spec-dev phase
/compound:plan             # Start plan phase
/compound:work             # Start work phase
/compound:review           # Start review phase
/compound:compound         # Start compound phase
/compound:cook-it <epic-id>    # Run all phases end-to-end
/compound:research         # Spawn research subagent
/compound:test-clean       # Clean test artifacts
/compound:get-a-phd <focus>       # Deep research for agent knowledge
/compound:agentic-audit    # Audit codebase against agentic manifesto
/compound:agentic-setup    # Audit then set up agentic infrastructure
/compound:learn-that       # Conversation-aware lesson capture with confirmation
/compound:check-that       # Search lessons and apply to current work
/compound:prime            # Prime session with workflow context
```

Each skill reads its SKILL.md file from `.claude/skills/compound/<phase>/SKILL.md` at invocation time. Skills are never executed from memory.
