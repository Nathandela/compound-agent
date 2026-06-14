---
version: "{{VERSION}}"
last-updated: "{{DATE}}"
summary: "Phase skills and agent role skills reference"
---

# Skills Reference

Skills are instructions that Claude reads before executing each phase. They live in `.claude/skills/compound/` and are auto-installed by `ca setup`.

---

## Phase skills

### `/compound:spec-dev`

**Purpose**: Develop precise specifications through Socratic dialogue, EARS notation, and Mermaid diagrams.

**When invoked**: At the start of a new feature or epic, before any planning.

**What it does**: Guides the user through 4 phases (Explore, Understand, Specify, Hand off) to produce a rigorous spec. Spawns research subagents, uses Mermaid diagrams as thinking tools, detects NL ambiguity, writes EARS-notation requirements, and writes the consolidated spec to a `docs/specs/<epic-id>-<slug>.md` file (the single source of truth), leaving a pointer stub in the beads epic.

### `/compound:plan`

**Purpose**: Decompose work into small testable tasks with dependencies.

**When invoked**: After spec-dev, before any implementation.

**What it does**: Reviews spec-dev output, spawns analysts, decomposes into tasks, appends the Acceptance Criteria table and an epic-local Verification Contract to the spec file, creates beads issues, and creates Review + Compound blocking tasks.

### `/compound:work`

**Purpose**: Team-based TDD execution with adaptive complexity.

**When invoked**: After plan, when tasks are ready in beads.

**What it does**: Picks tasks from `bd ready`, reads the epic's Acceptance Criteria and Verification Contract, deploys an AgentTeam with test-writers and implementers, coordinates agent work, commits incrementally, and produces the required evidence before `/implementation-reviewer`.

### `/compound:review`

**Purpose**: Multi-agent review with parallel specialized reviewers.

**When invoked**: After all work tasks are closed.

**What it does**: Runs baseline quality gates plus contract-required build checks, verifies Acceptance Criteria and Verification Contract evidence, selects reviewer tier based on diff size (4-13 reviewers), spawns reviewers in an AgentTeam, classifies findings by severity, fixes all P1s, runs `/implementation-reviewer`.

### `/compound:compound`

**Purpose**: Reflect on the cycle and capture lessons for future sessions.

**When invoked**: After review is approved.

**What it does**: Spawns an analysis pipeline (context-analyzer, lesson-extractor, pattern-matcher, solution-writer, compounding), applies quality filters, classifies items by type and severity, stores via `ca learn`, checks for verification-contract drift, and runs `ca verify-gates`.

### `/compound:cook-it`

**Purpose**: Full-cycle orchestrator chaining all five phases.

**When invoked**: When you want to run an entire epic end-to-end.

**What it does**: Sequences all 5 phases with mandatory gates between them, tracks progress in beads notes, handles resumption after interruption. See [WORKFLOW.md](WORKFLOW.md) for full details.

### `/compound:get-a-phd`

**Purpose**: Conduct deep, PhD-level research to build knowledge for working subagents.

**When invoked**: When agents need domain knowledge not yet covered in `docs/research/`.

**What it does**: Analyzes beads epics for knowledge gaps, checks existing docs coverage, proposes research topics for user confirmation, spawns parallel researcher subagents, and stores output at `docs/research/<topic>/<slug>.md`.

### `/compound:agentic-audit`

**Purpose**: Audit a codebase against the 16-principle Agentic Codebase Manifesto.

**When invoked**: When evaluating a codebase's readiness for AI agent collaboration.

**What it does**: Detects the project stack, scores all 16 principles (0-2) with specific evidence across 3 pillars (Codebase Memory, Implementation Feedbacks, Mapping the Context) plus cross-cutting concerns. Produces a scored report (out of 32) with prioritized actions and offers to create a beads epic for improvements.

### `/compound:agentic-setup`

**Purpose**: Set up a codebase for agentic AI development (runs audit first).

**When invoked**: When you want to improve a codebase's agentic readiness by filling gaps.

**What it does**: Runs the full audit first, then proposes concrete remediation actions for each gap found. Creates real content (AGENTS.md, docs/, ADRs, lint configs) generated from actual codebase analysis. Asks for user approval before each file creation.

### `/compound:build-great-things`

**Purpose**: Comprehensive playbook for building world-class websites, web apps, and dashboards.

**When invoked**: When building a new website/web app from scratch, redesigning pages, adding polish/animations, fixing generic-looking UI, or improving visual hierarchy.

**What it does**: Guides through a 6-phase build sequence (Foundation → Structure → Craft → Motion → Performance → Launch) with separate tracks for websites and web applications. Covers brand identity, IA, typography, color, scroll animations, micro-interactions, hover effects, loading/empty/error states, accessibility, SEO, and conversion optimization. Includes a mandatory quality checklist and anti-patterns for common AI laziness. References deep research on design theory, perceptual science, and UX methodology.

### `/compound:architect`

**Purpose**: Decompose a large system specification into cook-it-ready epic beads via DDD bounded contexts.

**When invoked**: When a large system needs to be broken down into naturally-scoped epics before implementation.

**What it does**: Runs six phases (Socratic → Spec → Decompose → Materialize → Launch → Polish) with human gates. Uses DDD bounded contexts, STPA analysis, and a 6-angle decomposition convoy. At the Launch gate it offers two implementation modes: a detached infinity loop (background `ca loop` in a screen session) or live orchestration (the architect stays in the session and autonomously drives each materialised epic through `/compound:cook-it` sequentially in dependency order, tracking progress via a beads-backed checklist note and resuming after interruption).

---

## Detached loop and harness targets

The architect Launch gate's detached mode runs `ca loop` in a `screen` session. `ca loop --implementer` selects the coding agent: `claude` (default), `goose`, `codex`, or `gemini`. The `codex` implementer defaults to model `gpt-5.5-codex` and `gemini` defaults to `gemini-3.1-pro`.

`ca setup --harness` installs the compound skills into a target harness. Supported values are `claude`, `codex`, `gemini`, and `goose`, plus `antigravity` (groundwork only -- not yet available as a `ca loop --implementer`).

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
/compound:build-great-things   # Web design/development playbook
/compound:architect        # System decomposition into epics
/compound:learn-that       # Conversation-aware lesson capture with confirmation
/compound:check-that       # Search lessons and apply to current work
/compound:prime            # Prime session with workflow context
```

Each skill reads its SKILL.md file from `.claude/skills/compound/<phase>/SKILL.md` at invocation time. Skills are never executed from memory.
